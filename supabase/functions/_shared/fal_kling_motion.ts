/**
 * Fal — Kling Video Motion Control
 *   fal-ai/kling-video/v2.6/standard/motion-control (défaut)
 *   fal-ai/kling-video/v2.6/pro/motion-control (retry qualité / durée)
 *
 * image_url + video_url → vidéo où le perso de l'image reprend le motion.
 * Pas de param `duration` : la sortie doit suivre la durée de la vidéo
 * référence (max 30s en character_orientation=video).
 *
 * Les WebM MediaRecorder (reactions admin) sont refusés (« Video format is
 * invalid ») : on normalise alors en MP4 H.264. Les MP4 propres ne sont
 * PAS re-encodés (le scale-video peut dégrader l'extraction de motion).
 */

import {
  falDownloadBytes,
  falQueueAwaitJson,
  falQueueSubmit,
  type FalQueueProgress,
} from "./fal_queue.ts";
import {
  normaliserVideoMp4PourKling,
  urlSansCacheBuster,
} from "./fal_normaliser_video.ts";

const MODEL_STANDARD = "fal-ai/kling-video/v2.6/standard/motion-control";
const MODEL_PRO = "fal-ai/kling-video/v2.6/pro/motion-control";

export async function klingMotionControl(input: {
  imageUrl: string;
  videoUrl: string;
  prompt?: string;
  characterOrientation?: "image" | "video";
  keepOriginalSound?: boolean;
  /** Si true : re-encode MP4. Défaut false — n'activer que pour WebM. */
  normaliserVideo?: boolean;
  /** standard (défaut) ou pro (meilleure tenue de durée / qualité). */
  qualite?: "standard" | "pro";
  onProgress?: FalQueueProgress;
}): Promise<{ url: string; bytes: Uint8Array; mime: string }> {
  const image_url = urlSansCacheBuster(input.imageUrl);
  let video_url = urlSansCacheBuster(input.videoUrl);
  if (!image_url || !video_url) {
    throw new Error("Kling motion-control: image_url et video_url requis");
  }

  if (input.normaliserVideo) {
    await input.onProgress?.({
      phase: "submit",
      detail: "pré-normalisation vidéo → MP4 H.264 (Kling)",
    });
    const norm = await normaliserVideoMp4PourKling(video_url, input.onProgress);
    video_url = norm.url;
    await input.onProgress?.({
      phase: "submit",
      detail: `vidéo normalisée OK · ${video_url.slice(-56)}`,
    });
  }

  // Schema motion-control : pas de negative_prompt ni duration.
  // character_orientation=video → durée sortie = durée référence (≤30s).
  const body: Record<string, unknown> = {
    image_url,
    video_url,
    character_orientation: input.characterOrientation ?? "video",
    keep_original_sound: input.keepOriginalSound !== false,
  };
  const prompt = String(input.prompt ?? "").trim();
  if (prompt) body.prompt = prompt;

  const model = input.qualite === "pro" ? MODEL_PRO : MODEL_STANDARD;
  const queued = await falQueueSubmit(model, body, input.onProgress);
  const data = await falQueueAwaitJson(model, queued, input.onProgress, 600_000);
  const payload = (data?.data ?? data) as {
    video?: { url?: string; content_type?: string };
  };
  const url = payload?.video?.url;
  if (!url) {
    throw new Error(
      `Kling motion-control: pas de video.url — ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  const dl = await falDownloadBytes(url, input.onProgress);
  return {
    url: dl.url,
    bytes: dl.bytes,
    mime: payload.video?.content_type ?? dl.mime ?? "video/mp4",
  };
}
