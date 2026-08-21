/**
 * Vidéos AI — reactions + utilisations :
 *   { action: "import_tiktok", url, stream? }
 *     → vidéo entière en TEMP `_tmp_full.mp4` (pour le trim UI seulement)
 *   { action: "finalize", … }
 *     → trim Fal lossless du `_tmp_full` (crop start/end) + first_frame
 *       (+ video_text OCR). Tout le reste du dossier (dont `_tmp_full`) est purgé.
 *     Fallback (sans `_tmp_full`) : vidéo déjà trimée uploadée par un ancien client.
 *   { action: "ocr_frame", imageUrl, stream? }
 *   { action: "list" | "delete" | "list_utilisations" | "register_utilisation" | "delete_utilisation" }
 */

import { downloadMedia, scrapeVideoPost } from "../_shared/apify.ts";
import {
  formaterVideoMeta,
  normaliserVideoMp4PourKling,
  sonderVideoMeta,
} from "../_shared/fal_normaliser_video.ts";
import { trimmerVideoFal } from "../_shared/fal_trim_video.ts";
import { planTrimReaction } from "../_shared/plan_trim_reaction.ts";
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

function nombreFin(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Crop start/end depuis le body (nombres, strings, snake_case). */
function parseCropBody(
  raw: unknown,
): { startSec: number; endSec: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const startSec = nombreFin(o.startSec ?? o.start_sec);
  const endSec = nombreFin(o.endSec ?? o.end_sec);
  if (startSec == null || endSec == null || !(endSec > startSec)) return null;
  return { startSec, endSec };
}

function estTrimPlein(startSec: number, endSec: number, dureeSec: number | null): boolean {
  if (dureeSec == null || !(dureeSec > 0.1)) return false;
  return startSec <= 0.05 && endSec >= dureeSec - 0.08;
}

async function copierOuReuploader(
  supabase: Supabase,
  from: string,
  to: string,
): Promise<string> {
  const { error } = await supabase.storage.from(BUCKET).copy(from, to);
  if (!error) {
    const pub = supabase.storage.from(BUCKET).getPublicUrl(to).data.publicUrl;
    return `${pub}?v=${Date.now()}`;
  }
  const { data, error: dlErr } = await supabase.storage.from(BUCKET).download(from);
  if (dlErr || !data) {
    throw new Error(
      `Copy storage: ${error.message}${dlErr ? ` · download: ${dlErr.message}` : ""}`,
    );
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  return uploader(supabase, to, bytes, "video/mp4");
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
    .select("id, ugc_ai_video, slug")
    .eq("id", labelId)
    .maybeSingle();
  // La marque système n’est pas un label thématique (checkmark compte / HM).
  if (!data?.id || !data.ugc_ai_video || data.slug === "ugc-ai-video") {
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
          const dimApify =
            scraped.largeur && scraped.hauteur
              ? `${scraped.largeur}×${scraped.hauteur}`
              : "?";
          const defApify = scraped.definition ? ` · ${scraped.definition}` : "";
          emit?.({
            etape: "download",
            statut: "ok",
            detail: `Octets bruts (pas de recodage) · ${bytes.length} octets · Apify ${dimApify}${defApify}`,
          });
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
          try {
            const metaStocke = await sonderVideoMeta(videoSourceUrl);
            emit?.({
              etape: "upload",
              statut: "ok",
              detail: `Stocké tel quel · ${formaterVideoMeta(metaStocke)}`,
            });
          } catch {
            // sondage Fal optionnel
          }

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
      const videoPathClient = String(body.videoPath ?? "").trim();
      const videoUrlClient = String(body.videoUrl ?? "").trim();
      const firstFramePath = String(body.firstFramePath ?? "").trim();
      const firstFrameUrl = String(body.firstFrameUrl ?? "").trim();
      if (!firstFramePath || !firstFrameUrl) {
        return json({ error: "first_frame_reference requise" }, 400);
      }
      let crop = parseCropBody(body.crop);
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

      const sourcePathDb = String(actuel.video_source_path ?? "").trim();
      const sourceUrlDb = String(actuel.video_source_url ?? "").trim();
      const sourcePath = sourcePathDb || videoPathClient;
      const sourceUrl = sourceUrlDb || videoUrlClient;
      const dureeSourceSec =
        typeof actuel.duree_ms === "number" && actuel.duree_ms > 0
          ? actuel.duree_ms / 1000
          : null;
      if (!crop && dureeSourceSec) {
        crop = { startSec: 0, endSec: dureeSourceSec };
      }
      if (!crop && !sourceUrl) {
        return json(
          { error: "crop (startSec/endSec) ou vidéo source requis" },
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

        // Toujours Fal/copy depuis `_tmp_full` si crop + source.
        // Ne jamais préférer un recode navigateur (ffmpeg.wasm ~15 fps).
        let finalVideoPath = `ugc/reactions/${id}/video.mp4`;
        let finalVideoUrl = "";
        const plan = planTrimReaction({
          crop,
          sourceUrl,
          videoPathClient,
          videoUrlClient,
        });

        const metaTrim = async (base: string) => {
          if (!finalVideoUrl) return base;
          try {
            return `${base} · ${formaterVideoMeta(await sonderVideoMeta(finalVideoUrl))}`;
          } catch {
            return base;
          }
        };

        const transcodeClientWebmSiBesoin = async () => {
          const estWebm =
            /\.webm(\?|$)/i.test(videoPathClient) ||
            /\.webm(\?|$)/i.test(videoUrlClient);
          if (!estWebm) return;
          emit?.({
            etape: "transcode",
            statut: "en_cours",
            detail: "WebM → MP4 H.264 (Fal) pour Kling…",
          });
          const mp4 = await normaliserVideoMp4PourKling(videoUrlClient, (p) => {
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
          if (videoPathClient !== finalVideoPath) {
            await supprimerStorage(supabase, videoPathClient);
          }
          emit?.({
            etape: "transcode",
            statut: "ok",
            detail: await metaTrim(`MP4 OK · ${mp4.bytes.length} octets`),
          });
        };

        if (plan === "fal_source" && crop && sourceUrl) {
          const { startSec, endSec } = crop;
          if (estTrimPlein(startSec, endSec, dureeSourceSec) && sourcePath) {
            emit?.({
              etape: "trim",
              statut: "en_cours",
              detail: "Trim plein — copie MP4 source (sans recodage)…",
            });
            if (sourcePath !== finalVideoPath) {
              finalVideoUrl = await copierOuReuploader(
                supabase,
                sourcePath,
                finalVideoPath,
              );
            } else {
              const pub = supabase.storage
                .from(BUCKET)
                .getPublicUrl(finalVideoPath).data.publicUrl;
              finalVideoUrl = `${pub}?v=${Date.now()}`;
            }
            emit?.({
              etape: "trim",
              statut: "ok",
              detail: await metaTrim("MP4 source copié tel quel"),
            });
          } else {
            emit?.({
              etape: "trim",
              statut: "en_cours",
              detail: `Trim Fal lossless ${startSec.toFixed(1)}s → ${endSec.toFixed(1)}s…`,
            });
            const trimmed = await trimmerVideoFal({
              videoUrl: sourceUrl,
              startSec,
              endSec,
              onProgress: (p) => {
                if (p.detail) {
                  emit?.({
                    etape: "trim",
                    statut: "en_cours",
                    detail: p.detail,
                  });
                }
              },
            });
            finalVideoUrl = await uploader(
              supabase,
              finalVideoPath,
              trimmed.bytes,
              "video/mp4",
            );
            emit?.({
              etape: "trim",
              statut: "ok",
              detail: await metaTrim(`MP4 trimé · ${trimmed.bytes.length} octets`),
            });
          }
        } else if (plan === "client_legacy") {
          finalVideoPath = videoPathClient;
          finalVideoUrl = videoUrlClient;
          await transcodeClientWebmSiBesoin();
        }

        if (!finalVideoUrl) {
          throw new Error("Trim reaction : pas d'URL vidéo finale");
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
        } else if (crop) {
          dureeMs = Math.round(Math.max(0, crop.endSec - crop.startSec) * 1000);
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
