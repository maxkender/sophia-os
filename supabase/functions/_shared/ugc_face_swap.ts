/**
 * Transfert d'identité UGC à l'assignation (corps entier, pas un head-swap) :
 *   Figure 1 = slide slideshow (scène + pose)
 *   Figures 2+ = 4 angles du persona
 *   → fal-ai/nano-banana-pro/edit → strip C2PA → nouveau media (ugc_face_regen)
 *   → met à jour uniquement les post_slides de CE post (pas la biblio partagée).
 */

import { retirerContentCredentialsBytes } from "./c2pa.ts";
import { aspectRatioProche, editerNanoBananaPro } from "./fal_nano_banana.ts";
import { dimensionsImage } from "./inpaint.ts";
import { mapPool } from "./parallel.ts";
import { chargerPrompt, serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

const BUCKET = "medias";
const LARGEUR_SWAP = 2;

const PROMPT_DEFAUT = `Figure 1 is the base photo (scene + pose). Figures 2+ are reference photos of ONE same person — the persona.

Transfer the FULL identity of the persona onto Figure 1 — this is NOT a head swap / face paste:
- Face, facial features, hairstyle, hair color, eye color
- Skin tone and skin texture on ALL visible skin: face, neck, décolleté, arms, hands, shoulders, legs — zero mismatch between head and body
- Body type / build consistent with the persona references

KEEP from Figure 1 exactly:
- Body pose, hand positions, gesture
- Facial expression and gaze direction
- Clothing and accessories worn in the scene
- Framing, camera angle, background
- Lighting, color grade, image grain / phone-photo noise and overall quality

Do NOT leave the original person's skin tone on neck, arms, hands or chest.
Do NOT only replace the head. The whole visible person must look like the persona.
Photorealistic, casual amateur phone-photo look.`;

export interface UgcPersonaAngles {
  id: string;
  image_face_url: string;
  image_left_url: string;
  image_right_url: string;
  image_down_url: string;
}

async function uploader(
  supabase: Supabase,
  path: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime || "image/png",
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw new Error(`Upload UGC swap: ${error.message}`);
  const pub = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return `${pub}?v=${Date.now()}`;
}

/**
 * Pour un post UGC AI : remplace les slides à visage_premier_plan par une
 * regen Nano Banana (scène + persona). Les autres slides restent inchangées.
 */
export async function appliquerFaceSwapUgcPost(
  supabase: Supabase,
  args: {
    postId: string;
    compteId: string;
    contenuId: string;
    persona: UgcPersonaAngles;
    onLog?: (detail: string) => void;
  },
): Promise<{ swaps: number; echecs: number }> {
  const log = (detail: string) => {
    try {
      args.onLog?.(detail);
    } catch {
      // ignore
    }
  };
  const { data: slides, error } = await supabase
    .from("post_slides")
    .select("id, position, media_id")
    .eq("post_id", args.postId)
    .not("media_id", "is", null)
    .order("position");
  if (error) throw error;
  if (!slides?.length) return { swaps: 0, echecs: 0 };

  const mediaIds = [
    ...new Set(
      slides
        .map((s) => s.media_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: medias } = await supabase
    .from("media_library")
    .select("id, url, visage_premier_plan, ugc_face_regen")
    .in("id", mediaIds);

  const parId = new Map((medias ?? []).map((m) => [m.id as string, m]));
  const aSwapper = slides.filter((s) => {
    const m = parId.get(s.media_id as string);
    if (!m?.url) return false;
    if (m.ugc_face_regen) return false;
    return m.visage_premier_plan === true;
  });

  if (aSwapper.length === 0) {
    log("Aucune slide à visage à swapper");
    return { swaps: 0, echecs: 0 };
  }
  log(`${aSwapper.length} slide(s) visage à régénérer`);

  const prompt =
    (await chargerPrompt(supabase, "ugc_face_swap"))?.trim() || PROMPT_DEFAUT;
  const personaUrls = [
    args.persona.image_face_url,
    args.persona.image_left_url,
    args.persona.image_right_url,
    args.persona.image_down_url,
  ].filter(Boolean);

  let swaps = 0;
  let echecs = 0;

  await mapPool(aSwapper, LARGEUR_SWAP, async (slide) => {
    const src = parId.get(slide.media_id as string)!;
    const pos = Number(slide.position);
    try {
      // Ratio = slide de référence (Figure 1), pas le 9:16 des personas.
      log(`Slide ${pos} : lecture ratio…`);
      const aspectRatio = await aspectDepuisUrl(src.url as string);
      const imageUrls = [src.url as string, ...personaUrls];
      log(`Slide ${pos} : Nano Banana edit (aspect=${aspectRatio})…`);
      const edit = await editerNanoBananaPro(
        imageUrls,
        prompt,
        (p) => {
          if (p.phase === "poll") {
            log(`Slide ${pos} : Fal ${p.statut ?? "…"} (#${p.polls ?? 0})`);
          } else if (p.phase === "submit") {
            log(`Slide ${pos} : ${p.detail ?? "submit"}`);
          } else if (p.phase === "download") {
            log(`Slide ${pos} : téléchargement…`);
          }
        },
        { aspectRatio },
      );
      log(`Slide ${pos} : strip C2PA + upload…`);
      const strip = await retirerContentCredentialsBytes(edit.bytes);
      const mime =
        strip.mime === "application/octet-stream" ? edit.mime : strip.mime;
      const ext = mime.includes("jpeg") || mime.includes("jpg")
        ? "jpg"
        : mime.includes("webp")
          ? "webp"
          : "png";
      const path =
        `ugc/swaps/${args.postId}/${pos}-${Date.now()}.${ext}`;
      const url = await uploader(supabase, path, strip.bytes, mime);

      const { data: nouveau, error: errM } = await supabase
        .from("media_library")
        .insert({
          compte_id: args.compteId,
          contenu_id: args.contenuId,
          storage_path: path,
          url,
          source: "genere_ia",
          tags: ["ugc_face_swap"],
          visage_premier_plan: true,
          ugc_face_regen: true,
          texte_restant: false,
        })
        .select("id")
        .single();
      if (errM || !nouveau) throw errM ?? new Error("insert media UGC échoué");

      const { error: errS } = await supabase
        .from("post_slides")
        .update({ media_id: nouveau.id })
        .eq("id", slide.id);
      if (errS) throw errS;
      swaps += 1;
      log(`Slide ${pos} : OK`);
    } catch (e) {
      echecs += 1;
      log(`Slide ${pos} : échec — ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  return { swaps, echecs };
}

export async function chargerPersonaUgc(
  supabase: Supabase,
  personaId: string,
): Promise<UgcPersonaAngles | null> {
  const { data, error } = await supabase
    .from("ugc_personas")
    .select(
      "id, image_face_url, image_left_url, image_right_url, image_down_url",
    )
    .eq("id", personaId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.image_face_url) return null;
  return data as UgcPersonaAngles;
}

/** Ratio Fal calqué sur la slide scène ; `auto` en repli. */
async function aspectDepuisUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return "auto";
    const bytes = new Uint8Array(await res.arrayBuffer());
    const dims = dimensionsImage(bytes);
    if (!dims) return "auto";
    return aspectRatioProche(dims.w, dims.h);
  } catch {
    return "auto";
  }
}
