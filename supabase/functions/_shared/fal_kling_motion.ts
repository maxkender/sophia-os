/**
 * Fal — Kling Video v2.6 Standard Motion Control
 *   fal-ai/kling-video/v2.6/standard/motion-control
 *
 * image_url + video_url → vidéo où le perso de l'image reprend le motion.
 *
 * Les WebM MediaRecorder (reactions admin) sont refusés (« Video format is
 * invalid ») : on normalise toujours en MP4 H.264 avant l'appel.
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

const MODEL = "fal-ai/kling-video/v2.6/standard/motion-control";

const NEGATIVE_DEFAUT =
  "identity change, different face, face morphing, warping, distortion, extra fingers, deformed hands, model look, glamour, studio lighting, soft flattering light, airbrushed skin, dewy, glossy, creamy bokeh, watermark, text, logo, cartoon, 3D render";

export async function klingMotionControl(input: {
  imageUrl: string;
  videoUrl: string;
  prompt?: string;
  negativePrompt?: string;
  characterOrientation?: "image" | "video";
  keepOriginalSound?: boolean;
  /** Si false : ne re-encode pas (déjà MP4 Fal). Défaut true. */
  normaliserVideo?: boolean;
  onProgress?: FalQueueProgress;
}): Promise<{ url: string; bytes: Uint8Array; mime: string }> {
  const image_url = urlSansCacheBuster(input.imageUrl);
  let video_url = urlSansCacheBuster(input.videoUrl);
  if (!image_url || !video_url) {
    throw new Error("Kling motion-control: image_url et video_url requis");
  }

  if (input.normaliserVideo !== false) {
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

  const body: Record<string, unknown> = {
    image_url,
    video_url,
    character_orientation: input.characterOrientation ?? "video",
    keep_original_sound: input.keepOriginalSound !== false,
    negative_prompt: (input.negativePrompt ?? NEGATIVE_DEFAUT).trim(),
  };
  const prompt = String(input.prompt ?? "").trim();
  if (prompt) body.prompt = prompt;

  const queued = await falQueueSubmit(MODEL, body, input.onProgress);
  const data = await falQueueAwaitJson(MODEL, queued, input.onProgress, 600_000);
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
