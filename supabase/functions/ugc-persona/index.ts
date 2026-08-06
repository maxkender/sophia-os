import {
  normaliserHandleTiktok,
  scrapeProfileAvatar,
} from "../_shared/apify.ts";
import { retirerContentCredentialsBytes } from "../_shared/c2pa.ts";
import { editerNanoBananaPro, genererNanoBananaPro } from "../_shared/fal_nano_banana.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
import { mapPool } from "../_shared/parallel.ts";
import {
  assertAuthorised,
  chargerPrompt,
  corsHeaders,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

const BUCKET = "medias";

const PROMPT_FACE_DEFAUT = `Photorealistic head-and-shoulders portrait of a 20-year-old woman,

fair skin, slim build, dark blonde shoulder-length slightly wavy hair
with a side part, black eyes, oval face with defined cheekbones and
a soft jawline, a small beauty mark above the right side of her lip and
faint freckles across her cheeks, wearing a plain white tank top
with thin hoop earrings.

Soft even studio lighting, plain light-grey seamless background,
looking straight into the camera, neutral relaxed expression.

Natural realistic skin texture with visible pores, no heavy retouching.
Sharp focus, high resolution.`;

const PROMPT_LEFT_DEFAUT = `Same exact person as the reference image — identical face, hairstyle,
hair color, skin tone, eye color and outfit. Keep the same soft studio
lighting and plain light-grey background.

Change ONLY the head/camera orientation to: three-quarter view facing left

Photorealistic, head-and-shoulders, natural skin texture, sharp focus.`;

const PROMPT_RIGHT_DEFAUT = `Same exact person as the reference image — identical face, hairstyle,
hair color, skin tone, eye color and outfit. Keep the same soft studio
lighting and plain light-grey background.

Change ONLY the head/camera orientation to: three-quarter view facing right

Photorealistic, head-and-shoulders, natural skin texture, sharp focus.`;

const PROMPT_DOWN_DEFAUT = `Same exact person as the reference image — identical face, hairstyle,
hair color, skin tone, eye color and outfit. Keep the same soft studio
lighting and plain light-grey background.

Change ONLY the head/camera orientation to: head slightly tilted down, looking down

Photorealistic, head-and-shoulders, natural skin texture, sharp focus.`;

const PROMPT_PROFILE_DEFAUT = `Same exact person as the reference images (Figures 1–4) — identical face, hairstyle, hair color, skin tone, eye color and overall look.

Photorealistic casual iPhone mirror selfie, square 1:1 crop. She is standing in front of a bathroom or bedroom mirror, holding a white iPhone up to take the photo. Natural soft daylight, candid Gen-Z vibe, slightly imperfect real-phone look. Looking toward the phone screen / her reflection. Soft natural skin texture with visible pores, no heavy retouching. Authentic bathroom/bedroom mirror selfie aesthetic, head-and-shoulders filling the square frame. Sharp focus, high resolution.`;

/** PDP depuis une photo de référence : garde la pose, identité persona corps entier. */
const PROMPT_PROFILE_FROM_REF_DEFAUT = `Figure 1 is the base photo (scene + pose). Figures 2+ are reference photos of ONE same person — the persona.

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
- Square 1:1 crop

Do NOT leave the original person's skin tone on neck, arms, hands or chest.
Do NOT only replace the head. The whole visible person must look like the persona.
Photorealistic, casual amateur phone-photo look.`;

type Supabase = ReturnType<typeof serviceClient>;

function decodeBase64(dataUrlOrB64: string): { bytes: Uint8Array; mime: string } {
  const raw = dataUrlOrB64.trim();
  const m = raw.match(/^data:([^;]+);base64,(.+)$/i);
  const mime = m?.[1] || "image/jpeg";
  const b64 = m?.[2] || raw.replace(/\s/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

async function telechargerImage(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`Téléchargement image ${res.status}`);
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.length < 100) throw new Error("Image trop petite / vide");
  return { bytes: buf, mime };
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
  if (error) throw new Error(`Upload storage: ${error.message}`);
  const pub = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return `${pub}?v=${Date.now()}`;
}

type AngleCle = "left" | "right" | "down";

const ANGLE_META: Record<
  AngleCle,
  { file: string; promptCle: string; defaut: string; colUrl: string; colPrompt: string }
> = {
  left: {
    file: "left.png",
    promptCle: "ugc_persona_edit_left",
    defaut: PROMPT_LEFT_DEFAUT,
    colUrl: "image_left_url",
    colPrompt: "prompt_left",
  },
  right: {
    file: "right.png",
    promptCle: "ugc_persona_edit_right",
    defaut: PROMPT_RIGHT_DEFAUT,
    colUrl: "image_right_url",
    colPrompt: "prompt_right",
  },
  down: {
    file: "down.png",
    promptCle: "ugc_persona_edit_down",
    defaut: PROMPT_DOWN_DEFAUT,
    colUrl: "image_down_url",
    colPrompt: "prompt_down",
  },
};

function parseAngle(raw: unknown): AngleCle | null {
  const a = String(raw ?? "").trim().toLowerCase();
  if (a === "left" || a === "right" || a === "down") return a;
  return null;
}

/**
 * Personas UGC AI (Nano Banana Pro).
 *
 *   { action: "defaults" }
 *   { action: "generate_face", prompt?, stream? }
 *   { action: "generate_angles", faceUrl, promptLeft?, promptRight?, promptDown?, stream? }
 *   { action: "generate_angle", angle, faceUrl?, prompt?, draftId?, personaId?, stream? }
 *   { action: "generate_profile", faceUrl, leftUrl, rightUrl, downUrl, prompt?,
 *                                draftId?, personaId?, refUrl?, stream? }
 *   { action: "list_profile_refs" }
 *   { action: "import_profile_ref", mode: "upload"|"tiktok",
 *                                  bytesBase64?, mime?, handleOrUrl?, label? }
 *   { action: "delete_profile_ref", id }
 *   { action: "save", nom, promptBase, faceUrl, leftUrl, rightUrl, downUrl,
 *                     profileUrl, promptLeft?, promptRight?, promptDown?, promptProfile? }
 *   { action: "list" }
 *   { action: "delete", id }
 */
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const denied = await assertAuthorised(request);
  if (denied) return denied;

  const supabase = serviceClient();

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "corps JSON attendu" }, 400);
  }

  const action = String(body.action ?? "");
  const stream = veutStream(request, body);

  try {
    if (action === "defaults") {
      const [face, left, right, down, profile, profileFromRef] = await Promise.all([
        chargerPrompt(supabase, "ugc_persona_face"),
        chargerPrompt(supabase, "ugc_persona_edit_left"),
        chargerPrompt(supabase, "ugc_persona_edit_right"),
        chargerPrompt(supabase, "ugc_persona_edit_down"),
        chargerPrompt(supabase, "ugc_persona_profile"),
        chargerPrompt(supabase, "ugc_persona_profile_from_ref"),
      ]);
      return json({
        ok: true,
        promptFace: face ?? PROMPT_FACE_DEFAUT,
        promptLeft: left ?? PROMPT_LEFT_DEFAUT,
        promptRight: right ?? PROMPT_RIGHT_DEFAUT,
        promptDown: down ?? PROMPT_DOWN_DEFAUT,
        promptProfile: profile ?? PROMPT_PROFILE_DEFAUT,
        promptProfileFromRef: profileFromRef ?? PROMPT_PROFILE_FROM_REF_DEFAUT,
      });
    }

    if (action === "list") {
      const { data, error } = await supabase
        .from("ugc_personas")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, personas: data ?? [] });
    }

    if (action === "list_profile_refs") {
      const { data, error } = await supabase
        .from("ugc_profile_refs")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, refs: data ?? [] });
    }

    if (action === "delete_profile_ref") {
      const id = String(body.id ?? "").trim();
      if (!id) return json({ error: "id requis" }, 400);
      const { data: row } = await supabase
        .from("ugc_profile_refs")
        .select("storage_path")
        .eq("id", id)
        .maybeSingle();
      const path = row?.storage_path as string | null | undefined;
      if (path) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => null);
      }
      const { error } = await supabase.from("ugc_profile_refs").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "import_profile_ref") {
      const mode = String(body.mode ?? "").trim();
      const label = body.label != null ? String(body.label).trim() || null : null;
      const id = crypto.randomUUID();

      if (mode === "upload") {
        const b64 = String(body.bytesBase64 ?? "").trim();
        if (!b64) return json({ error: "bytesBase64 requis" }, 400);
        const { bytes, mime } = decodeBase64(b64);
        const strip = await retirerContentCredentialsBytes(bytes);
        const outMime =
          strip.mime === "application/octet-stream"
            ? (String(body.mime ?? "").trim() || mime)
            : strip.mime;
        const ext = outMime.includes("png")
          ? "png"
          : outMime.includes("webp")
            ? "webp"
            : "jpg";
        const path = `ugc/profile-refs/${id}.${ext}`;
        const imageUrl = await uploader(supabase, path, strip.bytes, outMime);
        const { data, error } = await supabase
          .from("ugc_profile_refs")
          .insert({
            id,
            source: "upload",
            label,
            image_url: imageUrl,
            storage_path: path,
          })
          .select("*")
          .single();
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true, ref: data });
      }

      if (mode === "tiktok") {
        const handle = normaliserHandleTiktok(String(body.handleOrUrl ?? ""));
        if (!handle) return json({ error: "handle / lien TikTok invalide" }, 400);
        const avatarUrl = await scrapeProfileAvatar(handle);
        if (!avatarUrl) {
          return json({ error: `Avatar introuvable pour @${handle}` }, 404);
        }
        const dl = await telechargerImage(avatarUrl);
        const strip = await retirerContentCredentialsBytes(dl.bytes);
        const outMime =
          strip.mime === "application/octet-stream" ? dl.mime : strip.mime;
        const ext = outMime.includes("png")
          ? "png"
          : outMime.includes("webp")
            ? "webp"
            : "jpg";
        const path = `ugc/profile-refs/${id}.${ext}`;
        const imageUrl = await uploader(supabase, path, strip.bytes, outMime);
        const { data, error } = await supabase
          .from("ugc_profile_refs")
          .insert({
            id,
            source: "tiktok",
            label: label ?? `@${handle}`,
            tiktok_handle: handle,
            image_url: imageUrl,
            storage_path: path,
          })
          .select("*")
          .single();
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true, ref: data });
      }

      return json({ error: "mode upload|tiktok requis" }, 400);
    }

    if (action === "delete") {
      const id = String(body.id ?? "").trim();
      if (!id) return json({ error: "id requis" }, 400);
      const { error } = await supabase.from("ugc_personas").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "generate_face") {
      const prompt =
        String(body.prompt ?? "").trim() ||
        (await chargerPrompt(supabase, "ugc_persona_face")) ||
        PROMPT_FACE_DEFAUT;

      const run = async (emit?: (e: Record<string, unknown>) => void) => {
        emit?.({ etape: "generate", statut: "en_cours", detail: "Nano Banana Pro…" });
        const resultat = await genererNanoBananaPro(prompt, (p) => {
          emit?.({
            etape: "generate",
            statut: "en_cours",
            detail: p.detail ?? p.statut ?? p.phase,
            polls: p.polls,
          });
        });
        const draftId = crypto.randomUUID();
        const path = `ugc/personas/draft/${draftId}/face.png`;
        emit?.({ etape: "upload", statut: "en_cours", detail: "Upload face…" });
        const imageUrl = await uploader(supabase, path, resultat.bytes, resultat.mime);
        emit?.({
          etape: "ready",
          statut: "ok",
          imageUrl,
          draftId,
          storagePath: path,
          prompt,
        });
        return { ok: true as const, imageUrl, draftId, storagePath: path, prompt };
      };

      if (stream) {
        return reponseNdjson(async (emit) => {
          await run(emit);
        });
      }
      return json(await run());
    }

    if (action === "generate_angles") {
      const faceUrl = String(body.faceUrl ?? "").trim();
      if (!faceUrl) return json({ error: "faceUrl requis" }, 400);
      const draftId = String(body.draftId ?? crypto.randomUUID()).trim();

      const promptLeft =
        String(body.promptLeft ?? "").trim() ||
        (await chargerPrompt(supabase, "ugc_persona_edit_left")) ||
        PROMPT_LEFT_DEFAUT;
      const promptRight =
        String(body.promptRight ?? "").trim() ||
        (await chargerPrompt(supabase, "ugc_persona_edit_right")) ||
        PROMPT_RIGHT_DEFAUT;
      const promptDown =
        String(body.promptDown ?? "").trim() ||
        (await chargerPrompt(supabase, "ugc_persona_edit_down")) ||
        PROMPT_DOWN_DEFAUT;

      const angles: Array<{ cle: AngleCle; prompt: string; file: string }> = [
        { cle: "left", prompt: promptLeft, file: "left.png" },
        { cle: "right", prompt: promptRight, file: "right.png" },
        { cle: "down", prompt: promptDown, file: "down.png" },
      ];

      const run = async (emit?: (e: Record<string, unknown>) => void) => {
        emit?.({ etape: "angles", statut: "en_cours", detail: "3 angles en parallèle…" });
        const resultats = await mapPool(angles, 3, async (a) => {
          emit?.({
            etape: "angles",
            statut: "en_cours",
            detail: `Édit ${a.cle}…`,
            angle: a.cle,
          });
          const img = await editerNanoBananaPro(faceUrl, a.prompt, (p) => {
            emit?.({
              etape: "angles",
              statut: "en_cours",
              detail: `${a.cle}: ${p.detail ?? p.statut ?? p.phase}`,
              angle: a.cle,
              polls: p.polls,
            });
          });
          const path = `ugc/personas/draft/${draftId}/${a.file}`;
          const url = await uploader(supabase, path, img.bytes, img.mime);
          emit?.({
            etape: "angles",
            statut: "ok",
            detail: `${a.cle} prêt`,
            angle: a.cle,
            imageUrl: url,
          });
          return { cle: a.cle, url, prompt: a.prompt };
        });

        const map = Object.fromEntries(resultats.map((r) => [r.cle, r]));
        const payload = {
          ok: true as const,
          draftId,
          leftUrl: map.left!.url,
          rightUrl: map.right!.url,
          downUrl: map.down!.url,
          promptLeft: map.left!.prompt,
          promptRight: map.right!.prompt,
          promptDown: map.down!.prompt,
        };
        emit?.({ etape: "ready", statut: "ok", ...payload });
        return payload;
      };

      if (stream) {
        return reponseNdjson(async (emit) => {
          await run(emit);
        });
      }
      return json(await run());
    }

    /** Régénère un seul angle (création ou persona déjà enregistré). */
    if (action === "generate_angle") {
      const angle = parseAngle(body.angle);
      if (!angle) return json({ error: "angle requis (left|right|down)" }, 400);
      const meta = ANGLE_META[angle];
      const personaId = body.personaId ? String(body.personaId).trim() : "";

      let faceUrl = String(body.faceUrl ?? "").trim();
      let draftId = String(body.draftId ?? "").trim();
      let prompt = String(body.prompt ?? "").trim();

      if (personaId) {
        const { data: persona, error } = await supabase
          .from("ugc_personas")
          .select("*")
          .eq("id", personaId)
          .maybeSingle();
        if (error) return json({ error: error.message }, 400);
        if (!persona) return json({ error: "persona introuvable" }, 404);
        faceUrl = faceUrl || String(persona.image_face_url ?? "");
        if (!prompt) {
          const col = meta.colPrompt as "prompt_left" | "prompt_right" | "prompt_down";
          prompt = String(persona[col] ?? "").trim();
        }
        if (!draftId) {
          draftId =
            String(persona.storage_prefix ?? "")
              .replace(/^ugc\/personas\/draft\//, "")
              .split("/")[0] || personaId;
        }
      }

      if (!faceUrl) return json({ error: "faceUrl requis" }, 400);
      if (!draftId) draftId = crypto.randomUUID();
      if (!prompt) {
        prompt =
          (await chargerPrompt(supabase, meta.promptCle)) || meta.defaut;
      }

      const run = async (emit?: (e: Record<string, unknown>) => void) => {
        emit?.({
          etape: "angle",
          statut: "en_cours",
          detail: `Édit ${angle}…`,
          angle,
        });
        const img = await editerNanoBananaPro(faceUrl, prompt, (p) => {
          emit?.({
            etape: "angle",
            statut: "en_cours",
            detail: `${angle}: ${p.detail ?? p.statut ?? p.phase}`,
            angle,
            polls: p.polls,
          });
        });
        const path = personaId
          ? `ugc/personas/${personaId}/${meta.file}`
          : `ugc/personas/draft/${draftId}/${meta.file}`;
        emit?.({ etape: "upload", statut: "en_cours", detail: `Upload ${angle}…`, angle });
        const imageUrl = await uploader(supabase, path, img.bytes, img.mime);

        let persona = null;
        if (personaId) {
          const patch: Record<string, unknown> = {
            [meta.colUrl]: imageUrl,
            [meta.colPrompt]: prompt,
            updated_at: new Date().toISOString(),
          };
          const { data, error: errUp } = await supabase
            .from("ugc_personas")
            .update(patch)
            .eq("id", personaId)
            .select("*")
            .single();
          if (errUp) throw new Error(errUp.message);
          persona = data;
        }

        const payload = {
          ok: true as const,
          angle,
          imageUrl,
          prompt,
          draftId,
          personaId: personaId || null,
          persona,
        };
        emit?.({ etape: "ready", statut: "ok", ...payload });
        return payload;
      };

      if (stream) {
        return reponseNdjson(async (emit) => {
          await run(emit);
        });
      }
      return json(await run());
    }

    /** Photo de profil 1:1 — Nano Banana Edit avec les 4 angles en refs.
     *  Option `refUrl` : Figure 1 = pose, Figures 2+ = identité persona (corps entier). */
    if (action === "generate_profile") {
      const personaId = body.personaId ? String(body.personaId).trim() : "";
      let faceUrl = String(body.faceUrl ?? "").trim();
      let leftUrl = String(body.leftUrl ?? "").trim();
      let rightUrl = String(body.rightUrl ?? "").trim();
      let downUrl = String(body.downUrl ?? "").trim();
      let draftId = String(body.draftId ?? "").trim();
      let prompt = String(body.prompt ?? "").trim();
      const refUrl = String(body.refUrl ?? "").trim();

      if (personaId) {
        const { data: persona, error } = await supabase
          .from("ugc_personas")
          .select("*")
          .eq("id", personaId)
          .maybeSingle();
        if (error) return json({ error: error.message }, 400);
        if (!persona) return json({ error: "persona introuvable" }, 404);
        faceUrl = faceUrl || String(persona.image_face_url ?? "");
        leftUrl = leftUrl || String(persona.image_left_url ?? "");
        rightUrl = rightUrl || String(persona.image_right_url ?? "");
        downUrl = downUrl || String(persona.image_down_url ?? "");
        if (!prompt && !refUrl) {
          prompt = String(persona.prompt_profile ?? "").trim();
        }
        if (!draftId) {
          draftId =
            String(persona.storage_prefix ?? "")
              .replace(/^ugc\/personas\/draft\//, "")
              .split("/")[0] || personaId;
        }
      }

      if (!faceUrl || !leftUrl || !rightUrl || !downUrl) {
        return json({ error: "les 4 images (face + angles) sont requises" }, 400);
      }
      if (!draftId) draftId = crypto.randomUUID();

      const avecRef = Boolean(refUrl);
      if (!prompt) {
        if (avecRef) {
          prompt =
            (await chargerPrompt(supabase, "ugc_persona_profile_from_ref")) ||
            PROMPT_PROFILE_FROM_REF_DEFAUT;
        } else {
          prompt =
            (await chargerPrompt(supabase, "ugc_persona_profile")) ||
            PROMPT_PROFILE_DEFAUT;
        }
      }

      const refs = avecRef
        ? [refUrl, faceUrl, leftUrl, rightUrl, downUrl]
        : [faceUrl, leftUrl, rightUrl, downUrl];

      const run = async (emit?: (e: Record<string, unknown>) => void) => {
        const hb = setInterval(() => {
          emit?.({
            etape: "profile",
            statut: "en_cours",
            detail: "… encore en cours (profil 1:1)",
          });
        }, 25_000);
        try {
          emit?.({
            etape: "profile",
            statut: "en_cours",
            detail: avecRef
              ? "Nano Banana Edit — PDP depuis référence (pose only)…"
              : "Nano Banana Edit — photo de profil 1:1…",
          });
          const img = await editerNanoBananaPro(
            refs,
            prompt,
            (p) => {
              emit?.({
                etape: "profile",
                statut: "en_cours",
                detail: p.detail ?? p.statut ?? p.phase,
                polls: p.polls,
              });
            },
            { aspectRatio: "1:1" },
          );
          // PDP = avatar créateur → strip C2PA / métadonnées avant stockage.
          emit?.({
            etape: "profile",
            statut: "en_cours",
            detail: "Strip métadonnées (C2PA)…",
          });
          const strip = await retirerContentCredentialsBytes(img.bytes);
          const mime =
            strip.mime === "application/octet-stream" ? img.mime : strip.mime;
          const ext = mime.includes("jpeg") || mime.includes("jpg")
            ? "jpg"
            : mime.includes("webp")
              ? "webp"
              : "png";
          const path = personaId
            ? `ugc/personas/${personaId}/profile.${ext}`
            : `ugc/personas/draft/${draftId}/profile.${ext}`;
          emit?.({ etape: "upload", statut: "en_cours", detail: "Upload profil…" });
          const imageUrl = await uploader(supabase, path, strip.bytes, mime);

          let persona = null;
          if (personaId) {
            const { data, error: errUp } = await supabase
              .from("ugc_personas")
              .update({
                image_profile_url: imageUrl,
                prompt_profile: prompt,
                updated_at: new Date().toISOString(),
              })
              .eq("id", personaId)
              .select("*")
              .single();
            if (errUp) throw new Error(errUp.message);
            persona = data;
          }

          const payload = {
            ok: true as const,
            imageUrl,
            prompt,
            draftId,
            personaId: personaId || null,
            persona,
          };
          emit?.({ etape: "ready", statut: "ok", ...payload });
          return payload;
        } finally {
          clearInterval(hb);
        }
      };

      if (stream) {
        return reponseNdjson(async (emit) => {
          await run(emit);
        });
      }
      return json(await run());
    }

    if (action === "save") {
      const nom = String(body.nom ?? "").trim();
      const faceUrl = String(body.faceUrl ?? "").trim();
      const leftUrl = String(body.leftUrl ?? "").trim();
      const rightUrl = String(body.rightUrl ?? "").trim();
      const downUrl = String(body.downUrl ?? "").trim();
      const profileUrl = String(body.profileUrl ?? "").trim();
      const promptBase = String(body.promptBase ?? "").trim();
      if (!nom) return json({ error: "nom requis" }, 400);
      if (!faceUrl || !leftUrl || !rightUrl || !downUrl) {
        return json({ error: "les 4 images sont requises" }, 400);
      }
      if (!profileUrl) {
        return json({ error: "photo de profil (1:1) requise" }, 400);
      }

      const { data, error } = await supabase
        .from("ugc_personas")
        .insert({
          nom,
          prompt_base: promptBase,
          prompt_left: body.promptLeft ? String(body.promptLeft) : null,
          prompt_right: body.promptRight ? String(body.promptRight) : null,
          prompt_down: body.promptDown ? String(body.promptDown) : null,
          prompt_profile: body.promptProfile ? String(body.promptProfile) : null,
          image_face_url: faceUrl,
          image_left_url: leftUrl,
          image_right_url: rightUrl,
          image_down_url: downUrl,
          image_profile_url: profileUrl,
          storage_prefix: body.draftId ? `ugc/personas/draft/${body.draftId}` : null,
        })
        .select("*")
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, persona: data });
    }

    return json({ error: "action inconnue" }, 400);
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
