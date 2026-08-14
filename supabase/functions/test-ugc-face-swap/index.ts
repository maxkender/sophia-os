/**
 * TEST isolé — face swap classique sur une vidéo référence.
 *
 *   { personaId, reactionId, stream? }
 *     → Kling motion-control (image persona + vidéo reaction)
 *
 * Ne touche PAS l’assignation, les comptes, les labels, les captions,
 * ni `ugc_video_posts`. Écrit uniquement `ugc/test-runs/{runId}/swap.mp4`.
 */

import { klingMotionControl } from "../_shared/fal_kling_motion.ts";
import { sonderDureeSec } from "../_shared/fal_normaliser_video.ts";
import { falHebergerOctets } from "../_shared/fal_queue.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
import {
  assertAuthorised,
  chargerPrompt,
  corsHeaders,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";
import {
  cheminStorageTestFaceSwap,
  estSourceWebm,
  parserPayloadTestFaceSwap,
} from "../_shared/test_ugc_face_swap.ts";

type Supabase = ReturnType<typeof serviceClient>;

const BUCKET = "medias";
const PROMPT_KLING_DEFAUT =
  "Same person as in the reference image, natural reaction, amateur vertical phone video, casual lighting.";

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
    (p.endsWith(".mp4")
      ? "video/mp4"
      : p.endsWith(".webm")
        ? "video/webm"
        : "application/octet-stream");
  return { bytes, mime };
}

async function uploader(
  supabase: Supabase,
  path: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mime || "video/mp4",
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw new Error(`Upload test face-swap: ${error.message}`);
  const pub = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return `${pub}?v=${Date.now()}`;
}

async function executerFaceSwap(
  supabase: Supabase,
  personaId: string,
  reactionId: string,
  log: (detail: string) => void,
): Promise<{
  runId: string;
  videoUrl: string;
  personaId: string;
  reactionId: string;
  personaNom: string | null;
  reactionTitre: string | null;
}> {
  const runId = crypto.randomUUID();
  log(`Test face swap isolé · run ${runId.slice(0, 8)}`);

  const { data: persona, error: errP } = await supabase
    .from("ugc_personas")
    .select("id, nom, image_face_url")
    .eq("id", personaId)
    .maybeSingle();
  if (errP) throw errP;
  if (!persona?.image_face_url) {
    throw new Error("Persona introuvable ou sans image_face_url");
  }
  log(`Persona « ${persona.nom ?? persona.id.slice(0, 8)} »`);

  const { data: reaction, error: errR } = await supabase
    .from("ugc_reactions")
    .select("id, titre, video_source_url, video_source_path")
    .eq("id", reactionId)
    .maybeSingle();
  if (errR) throw errR;
  if (!reaction?.video_source_url && !reaction?.video_source_path) {
    throw new Error("Vidéo référence introuvable (pas de video_source)");
  }
  log(`Vidéo « ${reaction.titre ?? reaction.id.slice(0, 8)} »`);

  const reactionBytes =
    (await telechargerStorage(supabase, reaction.video_source_path)) ?? null;
  let reactionVideoUrl =
    String(reaction.video_source_url ?? "").split("?")[0] ||
    String(reaction.video_source_url ?? "");
  if (reactionBytes) {
    reactionVideoUrl = await falHebergerOctets(
      reactionBytes.bytes,
      reactionBytes.mime,
      `test-face-swap-${runId.slice(0, 8)}.${
        reactionBytes.mime.includes("webm") ? "webm" : "mp4"
      }`,
    );
    log(`Reaction rehost Fal · ${reactionBytes.bytes.length} octets`);
  }
  if (!reactionVideoUrl) {
    throw new Error("URL vidéo référence vide");
  }

  const dureeReactionSec = await sonderDureeSec(reactionVideoUrl, (p) => {
    if (p.detail) log(p.detail);
  });
  if (dureeReactionSec != null && dureeReactionSec < 3) {
    throw new Error(
      `Vidéo trop courte pour Kling (${dureeReactionSec.toFixed(2)}s < 3s)`,
    );
  }
  if (dureeReactionSec != null && dureeReactionSec > 30.05) {
    throw new Error(
      `Vidéo trop longue pour Kling (${dureeReactionSec.toFixed(2)}s > 30s)`,
    );
  }
  log(
    `Kling motion-control · durée=${
      dureeReactionSec != null ? `${dureeReactionSec.toFixed(2)}s` : "?"
    } · orientation=video`,
  );

  const klingPrompt =
    (await chargerPrompt(supabase, "ugc_video_kling_prompt"))?.trim() ||
    PROMPT_KLING_DEFAUT;
  const sourceWebm = estSourceWebm({
    path: reaction.video_source_path,
    url: reaction.video_source_url,
    mime: reactionBytes?.mime,
  });

  const kling = await klingMotionControl({
    imageUrl: persona.image_face_url,
    videoUrl: reactionVideoUrl,
    prompt: klingPrompt,
    characterOrientation: "video",
    keepOriginalSound: true,
    normaliserVideo: sourceWebm,
    qualite: "standard",
    onProgress: (p) => {
      if (p.phase === "poll") {
        log(`Kling Fal ${p.statut ?? "…"} (#${p.polls ?? 0})`);
      } else if (p.detail) {
        log(`Kling ${p.detail}`);
      }
    },
  });

  const storagePath = cheminStorageTestFaceSwap(runId);
  const videoUrl = await uploader(
    supabase,
    storagePath,
    kling.bytes,
    kling.mime || "video/mp4",
  );
  log(`OK · ${storagePath}`);

  return {
    runId,
    videoUrl,
    personaId: persona.id,
    reactionId: reaction.id,
    personaNom: (persona.nom as string | null) ?? null,
    reactionTitre: (reaction.titre as string | null) ?? null,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const denied = await assertAuthorised(request);
  if (denied) return denied;

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // vide
  }

  let payload: ReturnType<typeof parserPayloadTestFaceSwap>;
  try {
    payload = parserPayloadTestFaceSwap(body);
  } catch (e) {
    return json({ error: messageErreur(e) }, 400);
  }

  const stream = veutStream(request, body);
  const supabase = serviceClient();

  const lancer = async (log: (detail: string) => void) =>
    executerFaceSwap(supabase, payload.personaId, payload.reactionId, log);

  if (stream) {
    return reponseNdjson(async (emit) => {
      const log = (detail: string) =>
        emit({
          etape: "face_swap",
          statut: "en_cours",
          detail,
          at: new Date().toISOString(),
        });
      const hb = setInterval(
        () => log("… encore en cours (Kling motion-control)"),
        25_000,
      );
      try {
        const r = await lancer(log);
        emit({
          etape: "ready",
          statut: "ok",
          ok: true,
          ...r,
          detail: "Face swap OK",
          at: new Date().toISOString(),
        });
      } catch (e) {
        emit({
          etape: "ready",
          statut: "echec",
          ok: false,
          error: messageErreur(e),
          detail: messageErreur(e),
          at: new Date().toISOString(),
        });
      } finally {
        clearInterval(hb);
      }
    });
  }

  try {
    const r = await lancer((d) => console.log(`[test-ugc-face-swap] ${d}`));
    return json({ ok: true, ...r });
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
