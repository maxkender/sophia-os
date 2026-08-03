/**
 * Assignation UGC AI VIDEO (1 créateur / 1 slot) :
 *   0) Choisir reaction (même label, pas de re-use sauf fallback) + utilisation
 *   1) Nettoyage frame10 (process classique Fal/Replicate text-removal + C2PA)
 *   2) Nano Banana edit : frame10 nettoyée + images persona → photo ref
 *   3) Kling motion-control : photo ref + vidéo reaction
 *   4) Concat Kling + utilisation (même label)
 *   5) Caption traduite (langue créateur) — pas de « Sophia »
 *
 * Option `jusquA: "face_ref"` : s'arrête après Nano Banana (test Admin).
 */

import { retirerContentCredentialsBytes } from "./c2pa.ts";
import { editerNanoBananaPro } from "./fal_nano_banana.ts";
import { klingMotionControl } from "./fal_kling_motion.ts";
import { mergerVideosFal } from "./fal_merge_videos.ts";
import { falHebergerOctets } from "./fal_queue.ts";
import { cleanImage, TEXT_MODELS } from "./gemini.ts";
import { mapPool } from "./parallel.ts";
import { chargerPrompt, serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

const BUCKET = "medias";
const LARGEUR = 1; // Kling lourd — 1 compte à la fois en batch

const PROMPT_FACE_DEFAUT = `Figure 1 is the base photo. Figures 2+ are reference photos of one same person.
Keep EVERYTHING in Figure 1 identical: exact body pose, hands, framing, camera
angle, background, lighting and color grade.
Replace ONLY the head and face with the person shown in the reference photos —
same facial features, same hairstyle, same skin tone as the references.
Blend the new head naturally onto the existing body and match the scene lighting.
Photorealistic, keep the amateur phone-photo look.`;

const NEGATIVE_DEFAUT =
  "identity change, different face, face morphing, warping, distortion, extra fingers, deformed hands, model look, glamour, studio lighting, soft flattering light, airbrushed skin, dewy, glossy, creamy bokeh, watermark, text, logo, cartoon, 3D render";

const PROMPT_KLING_DEFAUT =
  "Same person as in the reference image, natural reaction, amateur vertical phone video, casual lighting.";

const PROMPT_CAPTION_DEFAUT = `Tu rédiges la légende TikTok d'une vidéo UGC en DEUX parties collées :
1) une réaction « waouh regarde ce que je viens de trouver » (le visage parle, pas besoin de décrire la scène),
2) une démo d'utilisation d'une appli (la suite de la vidéo).

Règles STRICTES :
- Écris UNIQUEMENT dans la langue cible indiquée.
- Ne mentionne JAMAIS Sophia, ni aucun nom de marque interne.
- Oriente clairement vers l'appli / le truc montré dans la partie utilisation (curiosité + CTA soft).
- Ton casual, téléphone, authentique. 1 à 3 phrases max + hashtags légers optionnels.
- Pas de guillemets autour de la légende. Sortie = texte prêt à coller.`;

export type AssignationUgcVideoLog = (detail: string) => void;

export interface AssignationUgcVideoResultat {
  compteId: string;
  crees: number;
  postIds?: string[];
  erreur?: string;
  raison?: string;
}

async function uploader(
  supabase: Supabase,
  path: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw new Error(`Upload storage: ${error.message}`);
  const pub = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return `${pub}?v=${Date.now()}`;
}

async function genererCaptionGemini(input: {
  langue: string;
  videoText: string | null;
  instructions: string;
}): Promise<string> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY manquant");
  const prompt = `${input.instructions}

Langue cible : ${input.langue}
Texte OCR lu sur la frame réaction (contexte, peut être vide) :
---
${input.videoText?.trim() || "(aucun)"}
---
Légende :`;

  const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
  let last = "";
  for (const model of TEXT_MODELS) {
    try {
      const res = await fetch(`${BASE}/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        }),
      });
      if (!res.ok) {
        last = `${model} ${res.status}`;
        continue;
      }
      const data = await res.json();
      const text = String(
        data?.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text ?? "")
          .join("") ?? "",
      ).trim();
      if (text) return text.replace(/^["«]|["»]$/g, "").trim();
      last = `${model}: vide`;
    } catch (e) {
      last = `${model}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  throw new Error(`Caption Gemini échouée (${last})`);
}

async function labelsDuCompte(
  supabase: Supabase,
  compteId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("compte_labels")
    .select("label_id")
    .eq("compte_id", compteId);
  if (error) throw error;
  return (data ?? []).map((r) => r.label_id as string).filter(Boolean);
}

async function reactionsUtilisees(
  supabase: Supabase,
  compteId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from("ugc_video_posts")
    .select("reaction_id")
    .eq("compte_id", compteId)
    .neq("statut", "echec");
  return new Set((data ?? []).map((r) => r.reaction_id as string).filter(Boolean));
}

/** Download storage service-role (évite les 400 public URL / manquants). */
async function telechargerStorage(
  supabase: Supabase,
  path: string | null | undefined,
): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const p = String(path ?? "").trim();
  if (!p) return null;
  const { data, error } = await supabase.storage.from(BUCKET).download(p);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.length < 32) return null;
  const mime =
    (typeof data.type === "string" && data.type) ||
    (p.endsWith(".png")
      ? "image/png"
      : p.endsWith(".webp")
        ? "image/webp"
        : p.endsWith(".mp4")
          ? "video/mp4"
          : p.endsWith(".webm")
            ? "video/webm"
            : "image/jpeg");
  return { bytes, mime };
}

type ReactionChoisie = {
  id: string;
  label_id: string;
  video_source_url: string;
  video_source_path: string | null;
  first_frame_reference_url: string;
  first_frame_reference_path: string;
  video_text: string | null;
  titre: string;
  frameBytes: Uint8Array;
  frameMime: string;
};

async function choisirReaction(
  supabase: Supabase,
  compteId: string,
  labelIds: string[],
  log: AssignationUgcVideoLog,
): Promise<ReactionChoisie | null> {
  if (labelIds.length === 0) {
    log("Aucun label sur le compte — impossible de matcher une reaction");
    return null;
  }
  const { data, error } = await supabase
    .from("ugc_reactions")
    .select(
      "id, label_id, video_source_url, video_source_path, first_frame_reference_url, first_frame_reference_path, video_text, titre, statut",
    )
    .eq("statut", "pret")
    .in("label_id", labelIds)
    .not("video_source_url", "is", null)
    .not("first_frame_reference_url", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const pool = (data ?? []).filter(
    (r) =>
      r.label_id &&
      r.video_source_url &&
      r.first_frame_reference_url &&
      r.first_frame_reference_path,
  ) as Array<{
    id: string;
    label_id: string;
    video_source_url: string;
    video_source_path: string | null;
    first_frame_reference_url: string;
    first_frame_reference_path: string;
    video_text: string | null;
    titre: string;
  }>;
  if (pool.length === 0) {
    log(`Aucune reaction pret pour labels=[${labelIds.join(",")}]`);
    return null;
  }

  const used = await reactionsUtilisees(supabase, compteId);
  const freshes = pool.filter((r) => !used.has(r.id));
  const candidats = [...(freshes.length > 0 ? freshes : pool)];
  // Mélange léger pour ne pas toujours prendre la même.
  for (let i = candidats.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidats[i], candidats[j]] = [candidats[j]!, candidats[i]!];
  }
  if (freshes.length === 0) {
    log(
      `Fallback : toutes les reactions déjà utilisées (${used.size}) — on réutilise`,
    );
  } else {
    log(`${freshes.length} reaction(s) neuve(s) / ${pool.length} total`);
  }

  for (const r of candidats) {
    const frame = await telechargerStorage(
      supabase,
      r.first_frame_reference_path,
    );
    if (!frame) {
      log(
        `Reaction ${r.id.slice(0, 8)} : frame absente en storage — archivée`,
      );
      await supabase
        .from("ugc_reactions")
        .update({
          statut: "archive",
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      continue;
    }
    return {
      ...r,
      frameBytes: frame.bytes,
      frameMime: frame.mime,
    };
  }
  log("Aucune reaction avec frame10 encore présente en storage");
  return null;
}

async function choisirUtilisation(
  supabase: Supabase,
  labelId: string,
  log: AssignationUgcVideoLog,
): Promise<{ id: string; video_url: string; titre: string } | null> {
  const { data, error } = await supabase
    .from("ugc_utilisations")
    .select("id, video_url, titre, label_id")
    .eq("label_id", labelId)
    .not("video_url", "is", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const pool = (data ?? []).filter((u) => u.video_url) as Array<{
    id: string;
    video_url: string;
    titre: string;
  }>;
  if (pool.length === 0) {
    log(`Aucune utilisation pour label=${labelId.slice(0, 8)}`);
    return null;
  }
  log(`${pool.length} utilisation(s) pour ce label`);
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

async function chargerPersonaUrls(
  supabase: Supabase,
  personaId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("ugc_personas")
    .select(
      "image_face_url, image_left_url, image_right_url, image_down_url, image_profile_url",
    )
    .eq("id", personaId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return [];
  return [
    data.image_face_url,
    data.image_left_url,
    data.image_right_url,
    data.image_down_url,
    data.image_profile_url,
  ]
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean);
}

/**
 * Pipeline complet pour UN slot d'un compte UGC AI VIDEO.
 */
export type AssignationUgcVideoJusqua = "face_ref" | "complet";

export async function assignerUgcVideoSlot(
  supabase: Supabase,
  compte: {
    id: string;
    langue: string | null;
    ugc_persona_id: string | null;
    persona_nom: string | null;
    handle_tiktok: string | null;
  },
  jour: string,
  opts: {
    test?: boolean;
    /** Stop après Nano Banana (étapes 0–2). Défaut = pipeline complet. */
    jusquA?: AssignationUgcVideoJusqua;
    onLog?: AssignationUgcVideoLog;
  } = {},
): Promise<{ postId: string } | { erreur: string }> {
  const log = (d: string) => {
    try {
      opts.onLog?.(d);
    } catch {
      // ignore
    }
  };
  const jusquA: AssignationUgcVideoJusqua =
    opts.jusquA === "face_ref" ? "face_ref" : "complet";
  const nom =
    compte.persona_nom ?? compte.handle_tiktok ?? compte.id.slice(0, 8);
  log(
    `── Slot UGC AI VIDEO · ${nom} · jour=${jour}${opts.test ? " · TEST" : ""}${
      jusquA === "face_ref" ? " · jusqu'à face_ref (0–2)" : ""
    }`,
  );

  if (!compte.ugc_persona_id) {
    return { erreur: "Compte UGC AI VIDEO sans persona" };
  }

  const labelIds = await labelsDuCompte(supabase, compte.id);
  log(`Labels compte (${labelIds.length}) : ${labelIds.map((x) => x.slice(0, 8)).join(", ") || "—"}`);

  const reaction = await choisirReaction(supabase, compte.id, labelIds, log);
  if (!reaction) {
    return { erreur: "Aucune reaction disponible (label ∩ pret)" };
  }
  log(
    `Reaction choisie · id=${reaction.id.slice(0, 8)} · label=${reaction.label_id.slice(0, 8)} · « ${reaction.titre || "—"} »`,
  );

  const utilisation = await choisirUtilisation(supabase, reaction.label_id, log);
  if (!utilisation) {
    return { erreur: "Aucune utilisation pour le label de la reaction" };
  }
  log(
    `Utilisation choisie · id=${utilisation.id.slice(0, 8)} · « ${utilisation.titre || "—"} »`,
  );

  const { data: row, error: errIns } = await supabase
    .from("ugc_video_posts")
    .insert({
      compte_id: compte.id,
      date_publication_prevue: jour,
      reaction_id: reaction.id,
      utilisation_id: utilisation.id,
      label_id: reaction.label_id,
      video_text_source: reaction.video_text,
      statut: "running",
      est_test: Boolean(opts.test),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (errIns || !row) {
    return { erreur: `Insert ugc_video_posts: ${errIns?.message ?? "?"}` };
  }
  const postId = row.id as string;
  log(`Post créé · ${postId.slice(0, 8)} · statut=running`);

  try {
    const etapeTotal = jusquA === "face_ref" ? 2 : 5;

    // ── 1) Nettoyage frame10 (process classique) ────────────────────
    log(
      `Étape 1/${etapeTotal} Nettoyage frame10 (text-removal classique Fal/Replicate)`,
    );
    // Rehost CDN Fal : les runners Fal/Replicate échouent parfois sur
    // les URLs Supabase (file_download_error). Octets déjà lus via storage.
    log(
      `  Rehost Fal · ${reaction.frameBytes.length} octets (${reaction.frameMime})`,
    );
    const framePourNettoyage = await falHebergerOctets(
      reaction.frameBytes,
      reaction.frameMime,
      `ugc-frame10-${postId.slice(0, 8)}.jpg`,
    );
    log(`  Rehost OK · ${framePourNettoyage.slice(-56)}`);
    const cleaned = await cleanImage(framePourNettoyage, async (e) => {
      if (e.detail) log(`  ${e.detail}`);
    });
    const cleanBytes = Uint8Array.from(atob(cleaned.base64), (c) =>
      c.charCodeAt(0),
    );
    const cleanMime = cleaned.mime || "image/png";
    const cleanExt = cleanMime.includes("jpeg") || cleanMime.includes("jpg")
      ? "jpg"
      : cleanMime.includes("webp")
        ? "webp"
        : "png";
    const cleanPath = `ugc/video-posts/${postId}/frame10_clean.${cleanExt}`;
    const frameCleanUrl = await uploader(
      supabase,
      cleanPath,
      cleanBytes,
      cleanMime,
    );
    await supabase
      .from("ugc_video_posts")
      .update({
        frame_clean_path: cleanPath,
        frame_clean_url: frameCleanUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);
    log(
      `  Frame10 nettoyée · moteur=${cleaned.moteur} · ${cleanBytes.length} octets → ${cleanPath}`,
    );

    // ── 2) Nano Banana ──────────────────────────────────────────────
    const personaUrls = await chargerPersonaUrls(supabase, compte.ugc_persona_id);
    if (personaUrls.length === 0) {
      throw new Error("Persona sans images");
    }
    log(
      `Étape 2/${etapeTotal} Nano Banana · Figure1=frame10 nettoyée · Figures2+=${personaUrls.length} persona`,
    );
    const promptFace =
      (await chargerPrompt(supabase, "ugc_video_face_ref"))?.trim() ||
      PROMPT_FACE_DEFAUT;
    const imageUrls = [frameCleanUrl, ...personaUrls];
    const edit = await editerNanoBananaPro(
      imageUrls,
      promptFace,
      (p) => {
        if (p.phase === "poll") {
          log(`  NB Fal ${p.statut ?? "…"} (#${p.polls ?? 0})`);
        } else if (p.detail) {
          log(`  NB ${p.detail}`);
        }
      },
      { aspectRatio: "9:16" },
    );
    log(`  NB OK · ${edit.bytes.length} octets · strip C2PA…`);
    const strip = await retirerContentCredentialsBytes(edit.bytes);
    const mime =
      strip.mime === "application/octet-stream" ? edit.mime : strip.mime;
    const ext = mime.includes("jpeg") || mime.includes("jpg")
      ? "jpg"
      : mime.includes("webp")
        ? "webp"
        : "png";
    const imagePath = `ugc/video-posts/${postId}/face_ref.${ext}`;
    const imageUrl = await uploader(supabase, imagePath, strip.bytes, mime || "image/png");
    await supabase
      .from("ugc_video_posts")
      .update({
        image_ref_path: imagePath,
        image_ref_url: imageUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);
    log(`  Photo ref uploadée · ${imagePath}`);

    if (jusquA === "face_ref") {
      await supabase
        .from("ugc_video_posts")
        .update({
          statut: "pret",
          pipeline_erreur: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId);
      log(
        `── Terminé (étapes 0–2) · post ${postId.slice(0, 8)} statut=pret · face_ref seule`,
      );
      return { postId };
    }

    // ── 3) Kling motion-control ─────────────────────────────────────
    // Reactions admin = souvent WebM MediaRecorder → Kling 422 « Video format
    // is invalid ». klingMotionControl re-encode en MP4 H.264 avant l'appel.
    log(
      `Étape 3/${etapeTotal} Kling motion-control · image=ref · video=reaction (${reaction.video_source_url.includes(".webm") ? "webm→mp4" : "mp4"})`,
    );
    const neg =
      (await chargerPrompt(supabase, "ugc_video_kling_negative"))?.trim() ||
      NEGATIVE_DEFAUT;
    const klingPrompt =
      (await chargerPrompt(supabase, "ugc_video_kling_prompt"))?.trim() ||
      PROMPT_KLING_DEFAUT;
    const kling = await klingMotionControl({
      imageUrl,
      videoUrl: reaction.video_source_url,
      prompt: klingPrompt,
      negativePrompt: neg,
      characterOrientation: "video",
      keepOriginalSound: true,
      onProgress: (p) => {
        if (p.phase === "poll") {
          log(`  Kling Fal ${p.statut ?? "…"} (#${p.polls ?? 0})`);
        } else if (p.detail) {
          log(`  Kling ${p.detail}`);
        }
      },
    });
    const klingPath = `ugc/video-posts/${postId}/kling.mp4`;
    const klingUrl = await uploader(
      supabase,
      klingPath,
      kling.bytes,
      kling.mime.includes("video") ? kling.mime : "video/mp4",
    );
    await supabase
      .from("ugc_video_posts")
      .update({
        video_kling_path: klingPath,
        video_kling_url: klingUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);
    log(`  Kling OK · ${kling.bytes.length} octets → ${klingPath}`);

    // ── 4) Concat utilisation ───────────────────────────────────────
    log(`Étape 4/${etapeTotal} Concat Kling + utilisation (fal merge-videos)`);
    const merged = await mergerVideosFal({
      videoUrls: [klingUrl, utilisation.video_url],
      onProgress: (p) => {
        if (p.phase === "poll") {
          log(`  Merge Fal ${p.statut ?? "…"} (#${p.polls ?? 0})`);
        } else if (p.detail) {
          log(`  Merge ${p.detail}`);
        }
      },
    });
    const finalePath = `ugc/video-posts/${postId}/finale.mp4`;
    const finaleUrl = await uploader(
      supabase,
      finalePath,
      merged.bytes,
      merged.mime.includes("video") ? merged.mime : "video/mp4",
    );
    await supabase
      .from("ugc_video_posts")
      .update({
        video_finale_path: finalePath,
        video_finale_url: finaleUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);
    log(`  Concat OK · ${merged.bytes.length} octets → ${finalePath}`);

    // ── 5) Caption ──────────────────────────────────────────────────
    const langue = (compte.langue ?? "en").toLowerCase();
    log(`Étape 5/${etapeTotal} Caption Gemini · langue=${langue}`);
    const instrCaption =
      (await chargerPrompt(supabase, "ugc_video_caption"))?.trim() ||
      PROMPT_CAPTION_DEFAUT;
    const caption = await genererCaptionGemini({
      langue,
      videoText: reaction.video_text,
      instructions: instrCaption,
    });
    log(`  Caption (${caption.length} car.) : ${caption.slice(0, 120)}${caption.length > 120 ? "…" : ""}`);

    await supabase
      .from("ugc_video_posts")
      .update({
        caption,
        statut: "pret",
        pipeline_erreur: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);
    log(`── Terminé · post ${postId.slice(0, 8)} statut=pret`);
    return { postId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`ÉCHEC · ${msg}`);
    await supabase
      .from("ugc_video_posts")
      .update({
        statut: "echec",
        pipeline_erreur: msg.slice(0, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);
    return { erreur: msg };
  }
}

/** Combien de slots déjà créés (non échec) ce jour pour ce compte. */
async function slotsDuJour(
  supabase: Supabase,
  compteId: string,
  jour: string,
  estTest: boolean,
): Promise<number> {
  const { data } = await supabase
    .from("ugc_video_posts")
    .select("id, statut")
    .eq("compte_id", compteId)
    .eq("date_publication_prevue", jour)
    .eq("est_test", estTest)
    .neq("statut", "echec");
  return data?.length ?? 0;
}

export async function assignerCompteUgcVideo(
  supabase: Supabase,
  compte: {
    id: string;
    langue: string | null;
    ugc_persona_id: string | null;
    persona_nom: string | null;
    handle_tiktok: string | null;
    posts_par_jour: number | null;
    warmup_ends_at: string | null;
  },
  jour: string,
  opts: {
    test?: boolean;
    forcer?: boolean;
    ignorerWarmup?: boolean;
    jusquA?: AssignationUgcVideoJusqua;
    onLog?: AssignationUgcVideoLog;
  } = {},
): Promise<AssignationUgcVideoResultat> {
  const log = opts.onLog ?? (() => {});
  const estTest = Boolean(opts.test);

  if (!opts.ignorerWarmup && !estTest) {
    const ends = compte.warmup_ends_at;
    if (!ends || new Date(ends).getTime() > Date.now()) {
      log("Warmup non terminé — skip");
      return { compteId: compte.id, crees: 0, raison: "warmup" };
    }
  }

  const quotaBrut = Number(compte.posts_par_jour ?? 1);
  const quota = Math.min(3, Math.max(1, Number.isFinite(quotaBrut) ? quotaBrut : 1));
  const deja = await slotsDuJour(supabase, compte.id, jour, estTest);
  const manque = opts.forcer ? 1 : Math.max(0, quota - deja);
  log(`Quota=${quota} · déjà=${deja} · à créer=${manque}`);
  if (manque === 0) {
    return { compteId: compte.id, crees: 0, raison: "quota atteint" };
  }

  const postIds: string[] = [];
  let derniereErreur: string | undefined;
  for (let i = 0; i < manque; i += 1) {
    log(`Slot ${i + 1}/${manque}`);
    const r = await assignerUgcVideoSlot(supabase, compte, jour, {
      test: estTest,
      jusquA: opts.jusquA,
      onLog: log,
    });
    if ("postId" in r) postIds.push(r.postId);
    else {
      derniereErreur = r.erreur;
      break;
    }
  }

  return {
    compteId: compte.id,
    crees: postIds.length,
    postIds,
    erreur: postIds.length === 0 ? derniereErreur : undefined,
    raison: postIds.length === 0 ? derniereErreur : undefined,
  };
}

/** Tous les comptes ugc_ai_video actifs (ou un seul). */
export async function assignerTousComptesUgcVideo(
  supabase: Supabase,
  jour: string,
  compteId: string | null = null,
  opts: {
    test?: boolean;
    forcer?: boolean;
    ignorerWarmup?: boolean;
    jusquA?: AssignationUgcVideoJusqua;
    onLog?: AssignationUgcVideoLog;
  } = {},
): Promise<AssignationUgcVideoResultat[]> {
  let q = supabase
    .from("comptes")
    .select(
      "id, langue, ugc_persona_id, persona_nom, handle_tiktok, posts_par_jour, warmup_ends_at, ugc_ai_video, is_active",
    )
    .eq("is_active", true)
    .eq("ugc_ai_video", true);
  if (compteId) q = q.eq("id", compteId);
  const { data, error } = await q;
  if (error) throw error;
  const comptes = data ?? [];
  opts.onLog?.(
    `${comptes.length} compte(s) UGC AI VIDEO à traiter · jour=${jour}`,
  );

  return await mapPool(comptes, LARGEUR, async (c) => {
    try {
      return await assignerCompteUgcVideo(supabase, c, jour, opts);
    } catch (e) {
      return {
        compteId: c.id as string,
        crees: 0,
        erreur: e instanceof Error ? e.message : String(e),
      };
    }
  });
}

/** Rollback posts test d'un compte/jour. */
export async function annulerAssignationUgcVideoTest(
  supabase: Supabase,
  compteId: string,
  jour: string,
): Promise<{ posts: number }> {
  const { data } = await supabase
    .from("ugc_video_posts")
    .select(
      "id, frame_clean_path, image_ref_path, video_kling_path, video_finale_path",
    )
    .eq("compte_id", compteId)
    .eq("date_publication_prevue", jour)
    .eq("est_test", true);

  for (const p of data ?? []) {
    const paths = [
      p.frame_clean_path,
      p.image_ref_path,
      p.video_kling_path,
      p.video_finale_path,
    ]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);
    if (paths.length) {
      try {
        await supabase.storage.from(BUCKET).remove(paths);
      } catch {
        // best-effort
      }
    }
  }

  const { error } = await supabase
    .from("ugc_video_posts")
    .delete()
    .eq("compte_id", compteId)
    .eq("date_publication_prevue", jour)
    .eq("est_test", true);
  if (error) throw error;
  return { posts: data?.length ?? 0 };
}

/** Kick drain background (minuit) — consomme le stream NDJSON. */
export function kickAssignationUgcVideo(
  request: Request,
  body: Record<string, unknown>,
): void {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return;
  const secret = Deno.env.get("CRON_SECRET");
  const auth = request.headers.get("Authorization");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/x-ndjson",
  };
  if (secret) headers["x-cron-secret"] = secret;
  else if (auth) headers.Authorization = auth;

  const target = `${url}/functions/v1/assignation-ugc-video`;
  const edge = (globalThis as {
    EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void };
  }).EdgeRuntime;

  const p = fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, stream: true, manuel: true }),
  })
    .then(async (res) => {
      if (!res.body) return;
      const reader = res.body.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    })
    .catch(() => null);

  if (edge?.waitUntil) edge.waitUntil(p);
}
