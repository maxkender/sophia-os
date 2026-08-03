/**
 * Vidéos AI — reactions :
 *   { action: "import_tiktok", url, stream? }
 *   { action: "ocr_frame", imageUrl, stream? }
 *   { action: "finalize", id, titre?, crop?, videoPath, videoUrl,
 *                         firstFramePath, firstFrameUrl, videoText? }
 *   { action: "list" }
 *   { action: "delete", id }
 */

import { downloadMedia, scrapeVideoPost } from "../_shared/apify.ts";
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

function normaliserLienTikTok(raw: string): string {
  const u = raw.trim();
  if (!u) throw new Error("URL TikTok requise");
  if (!/tiktok\.com\//i.test(u) && !/vm\.tiktok\.com\//i.test(u)) {
    throw new Error("Lien TikTok invalide");
  }
  return u.split("?")[0] ?? u;
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
      const { error } = await supabase.from("ugc_reactions").delete().eq("id", id);
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
        emit?.({ etape: "ready", statut: "ok", ...payload, detail: videoText || "(aucun texte)" });
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
            .select("id")
            .eq("source_url", sourceUrl)
            .maybeSingle();
          const id = (existant?.id as string | undefined) ?? crypto.randomUUID();

          emit?.({
            etape: "download",
            statut: "en_cours",
            detail: "Téléchargement fichier vidéo…",
          });
          const bytes = await downloadMedia(scraped.videoUrl);
          const path = `ugc/reactions/${id}/source.mp4`;
          emit?.({ etape: "upload", statut: "en_cours", detail: "Upload storage…" });
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
        return json({ error: "vidéo cropée requise (videoPath / videoUrl)" }, 400);
      }
      if (!firstFramePath || !firstFrameUrl) {
        return json({ error: "first_frame_reference requise" }, 400);
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
            detail: "OCR first_frame_reference…",
          });
          videoText = await ocrFrame(firstFrameUrl);
        }

        const patch: Record<string, unknown> = {
          video_path: videoPath,
          video_url: videoUrl,
          first_frame_reference_path: firstFramePath,
          first_frame_reference_url: firstFrameUrl,
          video_text: videoText,
          crop: body.crop ?? null,
          statut: "pret",
          updated_at: new Date().toISOString(),
        };
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
          detail: "Reaction enregistrée",
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
