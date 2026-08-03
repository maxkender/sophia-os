/**
 * Vidéos AI — reactions + utilisations :
 *   { action: "import_tiktok", url, stream? }
 *     → vidéo entière en TEMP `_tmp_full.mp4` (pour le trim UI seulement)
 *   { action: "finalize", … }
 *     → storage final = UNIQUEMENT :
 *         1) vidéo croppée (trim)
 *         2) first_frame_reference (10ᵉ frame)
 *         + video_text (OCR) en DB
 *       Tout le reste du dossier (dont `_tmp_full`) est purgé.
 *   { action: "ocr_frame", imageUrl, stream? }
 *   { action: "list" | "delete" | "list_utilisations" | "register_utilisation" | "delete_utilisation" }
 */

import { downloadMedia, scrapeVideoPost } from "../_shared/apify.ts";
import { normaliserVideoMp4PourKling } from "../_shared/fal_normaliser_video.ts";
import { ocrFrame } from "../_shared/gemini.ts";
import { reponseNdjson, veutStream } from "../_shared/nettoyage_etapes.ts";
import {
  assertAuthorised,
  corsHeaders,
  json,
  messageErreur,
  serviceClient,
} from "../_shared/supabase.ts";

const BUCKET = "medias";

type Supabase = ReturnType<typeof serviceClient>;

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

async function supprimerStorage(supabase: Supabase, path: string | null | undefined) {
  const p = String(path ?? "").trim();
  if (!p) return;
  try {
    await supabase.storage.from(BUCKET).remove([p]);
  } catch {
    // best-effort
  }
}

/** Garde uniquement les chemins listés dans le dossier reaction. */
async function purgerDossierReaction(
  supabase: Supabase,
  reactionId: string,
  garder: string[],
): Promise<void> {
  const prefix = `ugc/reactions/${reactionId}`;
  const keep = new Set(garder.map((p) => p.trim()).filter(Boolean));
  const { data: files, error } = await supabase.storage.from(BUCKET).list(prefix, {
    limit: 100,
  });
  if (error || !files?.length) return;
  const aSupprimer = files
    .map((f) => `${prefix}/${f.name}`)
    .filter((p) => !keep.has(p));
  if (aSupprimer.length === 0) return;
  await supabase.storage.from(BUCKET).remove(aSupprimer);
}

function normaliserLienTikTok(raw: string): string {
  const u = raw.trim();
  if (!u) throw new Error("URL TikTok requise");
  if (!/tiktok\.com\//i.test(u) && !/vm\.tiktok\.com\//i.test(u)) {
    throw new Error("Lien TikTok invalide");
  }
  return u.split("?")[0] ?? u;
}

/** Label du pool UGC AI VIDEO requis pour reactions / utilisations. */
async function assertLabelUgcAiVideo(
  supabase: Supabase,
  raw: unknown,
): Promise<string | Response> {
  const labelId = String(raw ?? "").trim();
  if (!labelId) return json({ error: "LABEL_UGC_AI_VIDEO_REQUIS" }, 400);
  const { data } = await supabase
    .from("labels")
    .select("id, ugc_ai_video")
    .eq("id", labelId)
    .maybeSingle();
  if (!data?.id || !data.ugc_ai_video) {
    return json({ error: "LABEL_UGC_AI_VIDEO_INVALIDE" }, 400);
  }
  return data.id as string;
}

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
    if (action === "list") {
      const { data, error } = await supabase
        .from("ugc_reactions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, reactions: data ?? [] });
    }

    if (action === "delete") {
      const id = String(body.id ?? "").trim();
      if (!id) return json({ error: "id requis" }, 400);
      await purgerDossierReaction(supabase, id, []);
      const { error } = await supabase.from("ugc_reactions").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "list_utilisations") {
      const { data, error } = await supabase
        .from("ugc_utilisations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, utilisations: data ?? [] });
    }

    if (action === "register_utilisation") {
      const videoPath = String(body.videoPath ?? "").trim();
      const videoUrl = String(body.videoUrl ?? "").trim();
      if (!videoPath || !videoUrl) {
        return json({ error: "videoPath / videoUrl requis" }, 400);
      }
      const labelId = await assertLabelUgcAiVideo(supabase, body.labelId ?? body.label_id);
      if (labelId instanceof Response) return labelId;
      const titre =
        String(body.titre ?? "").trim() ||
        String(body.nomFichier ?? "").trim() ||
        "Utilisation";
      const { data, error } = await supabase
        .from("ugc_utilisations")
        .insert({
          titre,
          video_path: videoPath,
          video_url: videoUrl,
          label_id: labelId,
          nom_fichier: body.nomFichier ? String(body.nomFichier) : null,
          duree_ms:
            typeof body.dureeMs === "number" && Number.isFinite(body.dureeMs)
              ? Math.round(body.dureeMs)
              : null,
        })
        .select("*")
        .single();
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true, utilisation: data });
    }

    if (action === "delete_utilisation") {
      const id = String(body.id ?? "").trim();
      if (!id) return json({ error: "id requis" }, 400);
      const { data: row } = await supabase
        .from("ugc_utilisations")
        .select("video_path")
        .eq("id", id)
        .maybeSingle();
      if (row) await supprimerStorage(supabase, row.video_path as string);
      const { error } = await supabase.from("ugc_utilisations").delete().eq("id", id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "ocr_frame") {
      const imageUrl = String(body.imageUrl ?? "").trim();
      if (!imageUrl) return json({ error: "imageUrl requis" }, 400);

      const run = async (emit?: (e: Record<string, unknown>) => void) => {
        emit?.({ etape: "ocr", statut: "en_cours", detail: "OCR Gemini…" });
        const videoText = await ocrFrame(imageUrl);
        const payload = { ok: true as const, videoText };
        emit?.({
          etape: "ready",
          statut: "ok",
          ...payload,
          detail: videoText || "(aucun texte)",
        });
        return payload;
      };

      if (stream) {
        return reponseNdjson(async (emit) => {
          await run(emit);
        });
      }
      return json(await run());
    }

    if (action === "import_tiktok") {
      const url = normaliserLienTikTok(String(body.url ?? ""));

      const run = async (emit?: (e: Record<string, unknown>) => void) => {
        const hb = setInterval(() => {
          emit?.({
            etape: "import",
            statut: "en_cours",
            detail: "… encore en cours (Apify)",
          });
        }, 25_000);
        try {
          emit?.({
            etape: "import",
            statut: "en_cours",
            detail: "Apify — scrape + download vidéo…",
          });
          const scraped = await scrapeVideoPost(url);
          const sourceUrl = scraped.webVideoUrl || url;

          const { data: existant } = await supabase
            .from("ugc_reactions")
            .select("id, video_source_path, video_path, first_frame_reference_path, statut")
            .eq("source_url", sourceUrl)
            .maybeSingle();

          if (existant?.statut === "pret") {
            throw new Error(
              "Cette reaction est déjà finalisée (trim effectué). Supprime-la pour réimporter.",
            );
          }

          const id = (existant?.id as string | undefined) ?? crypto.randomUUID();

          emit?.({
            etape: "download",
            statut: "en_cours",
            detail: "Téléchargement fichier vidéo…",
          });
          const bytes = await downloadMedia(scraped.videoUrl);
          // TEMP — purgé au finalize ; seuls crop + frame + video_text restent.
          const path = `ugc/reactions/${id}/_tmp_full.mp4`;
          emit?.({
            etape: "upload",
            statut: "en_cours",
            detail: "Upload temporaire (sera purgé après trim)…",
          });
          const videoSourceUrl = await uploader(
            supabase,
            path,
            bytes,
            "video/mp4",
          );

          const titre =
            scraped.text.trim().slice(0, 80) ||
            `Reaction ${scraped.postId.slice(0, 8)}`;
          const champs = {
            titre,
            source_url: sourceUrl,
            tiktok_post_id: scraped.postId,
            caption_source: scraped.text || null,
            video_source_path: path,
            video_source_url: videoSourceUrl,
            video_path: null as string | null,
            video_url: null as string | null,
            crop: null,
            first_frame_reference_path: null as string | null,
            first_frame_reference_url: null as string | null,
            video_text: null as string | null,
            musique_url: scraped.musicUrl,
            musique_titre: scraped.musicTitle,
            duree_ms: scraped.dureeMs,
            largeur: scraped.largeur,
            hauteur: scraped.hauteur,
            statut: "brouillon",
            updated_at: new Date().toISOString(),
          };

          let reaction;
          if (existant?.id) {
            // Anciens chemins éventuels
            if (
              existant.video_source_path &&
              existant.video_source_path !== path
            ) {
              await supprimerStorage(supabase, existant.video_source_path as string);
            }
            await supprimerStorage(supabase, existant.video_path as string);
            await supprimerStorage(
              supabase,
              existant.first_frame_reference_path as string,
            );
            const { data, error } = await supabase
              .from("ugc_reactions")
              .update(champs)
              .eq("id", id)
              .select("*")
              .single();
            if (error) throw new Error(error.message);
            reaction = data;
          } else {
            const { data, error } = await supabase
              .from("ugc_reactions")
              .insert({ id, ...champs })
              .select("*")
              .single();
            if (error) throw new Error(error.message);
            reaction = data;
          }

          emit?.({
            etape: "ready",
            statut: "ok",
            ok: true,
            reaction,
            detail: existant?.id ? "Vidéo réimportée" : "Vidéo importée",
          });
          return { ok: true as const, reaction };
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

    if (action === "finalize") {
      const id = String(body.id ?? "").trim();
      if (!id) return json({ error: "id requis" }, 400);
      const videoPath = String(body.videoPath ?? "").trim();
      const videoUrl = String(body.videoUrl ?? "").trim();
      const firstFramePath = String(body.firstFramePath ?? "").trim();
      const firstFrameUrl = String(body.firstFrameUrl ?? "").trim();
      if (!videoPath || !videoUrl) {
        return json({ error: "vidéo trimée requise (videoPath / videoUrl)" }, 400);
      }
      if (!firstFramePath || !firstFrameUrl) {
        return json({ error: "first_frame_reference requise" }, 400);
      }
      const labelId = await assertLabelUgcAiVideo(supabase, body.labelId ?? body.label_id);
      if (labelId instanceof Response) return labelId;

      const { data: actuel, error: errActuel } = await supabase
        .from("ugc_reactions")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (errActuel) return json({ error: errActuel.message }, 400);
      if (!actuel) return json({ error: "reaction introuvable" }, 404);
      if (actuel.statut === "pret") {
        return json(
          { error: "Déjà finalisée — pas de re-trim. Supprime pour recommencer." },
          400,
        );
      }

      let videoText =
        body.videoText !== undefined && body.videoText !== null
          ? String(body.videoText)
          : "";

      const run = async (emit?: (e: Record<string, unknown>) => void) => {
        if (!videoText && body.ocr !== false) {
          emit?.({
            etape: "ocr",
            statut: "en_cours",
            detail: "OCR first_frame_reference → video_text…",
          });
          videoText = await ocrFrame(firstFrameUrl);
        }

        // WebM MediaRecorder → MP4 H.264 (Kling refuse le webm navigateur).
        let finalVideoPath = videoPath;
        let finalVideoUrl = videoUrl;
        const estWebm = /\.webm(\?|$)/i.test(videoPath) || /\.webm(\?|$)/i.test(videoUrl);
        if (estWebm) {
          emit?.({
            etape: "transcode",
            statut: "en_cours",
            detail: "WebM → MP4 H.264 (Fal) pour Kling…",
          });
          const mp4 = await normaliserVideoMp4PourKling(videoUrl, (p) => {
            if (p.detail) {
              emit?.({
                etape: "transcode",
                statut: "en_cours",
                detail: p.detail,
              });
            }
          });
          finalVideoPath = `ugc/reactions/${id}/video.mp4`;
          finalVideoUrl = await uploader(
            supabase,
            finalVideoPath,
            mp4.bytes,
            "video/mp4",
          );
          // Supprime l'ancien webm si chemin différent.
          if (videoPath !== finalVideoPath) {
            await supprimerStorage(supabase, videoPath);
          }
          emit?.({
            etape: "transcode",
            statut: "ok",
            detail: `MP4 OK · ${mp4.bytes.length} octets`,
          });
        }

        emit?.({
          etape: "cleanup",
          statut: "en_cours",
          detail: "Purge : on ne garde que crop + 10ᵉ frame…",
        });
        // Storage final = exactement 2 fichiers (+ video_text en DB).
        await purgerDossierReaction(supabase, id, [finalVideoPath, firstFramePath]);

        let dureeMs: number | null = null;
        if (typeof body.dureeMs === "number" && Number.isFinite(body.dureeMs)) {
          dureeMs = Math.round(body.dureeMs);
        } else if (
          body.crop &&
          typeof body.crop.startSec === "number" &&
          typeof body.crop.endSec === "number"
        ) {
          dureeMs = Math.round(
            Math.max(0, body.crop.endSec - body.crop.startSec) * 1000,
          );
        }

        const patch: Record<string, unknown> = {
          // video_source_* = la vidéo CROPPÉE (seule vidéo persistée)
          video_source_path: finalVideoPath,
          video_source_url: finalVideoUrl,
          video_path: null,
          video_url: null,
          first_frame_reference_path: firstFramePath,
          first_frame_reference_url: firstFrameUrl,
          video_text: videoText,
          crop: body.crop ?? null,
          label_id: labelId,
          statut: "pret",
          updated_at: new Date().toISOString(),
        };
        if (dureeMs != null) patch.duree_ms = dureeMs;
        if (body.titre !== undefined) {
          const t = String(body.titre ?? "").trim();
          if (t) patch.titre = t;
        }

        const { data, error } = await supabase
          .from("ugc_reactions")
          .update(patch)
          .eq("id", id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);

        emit?.({
          etape: "ready",
          statut: "ok",
          ok: true,
          reaction: data,
          videoText,
          detail: "Enregistré : vidéo croppée + 10ᵉ frame + video_text",
        });
        return { ok: true as const, reaction: data, videoText };
      };

      if (stream) {
        return reponseNdjson(async (emit) => {
          await run(emit);
        });
      }
      return json(await run());
    }

    return json({ error: "action inconnue" }, 400);
  } catch (error) {
    return json({ ok: false, error: messageErreur(error) }, 500);
  }
});
