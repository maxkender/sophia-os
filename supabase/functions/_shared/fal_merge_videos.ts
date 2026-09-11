/**
 * Fal — ffmpeg merge-videos
 *   fal-ai/ffmpeg-api/merge-videos
 *
 * Sans `target_fps`, Fal prend le FPS le plus bas des inputs (Kling ~24 fps)
 * et y ramène aussi l'utilisation (souvent 30). Sans résolution explicite,
 * Fal prend le min(largeur, hauteur) → 720p si Kling Standard est 720p.
 */

import {
  falDownloadBytes,
  falQueueAwaitJson,
  falQueueSubmit,
  type FalQueueProgress,
} from "./fal_queue.ts";

const MODEL = "fal-ai/ffmpeg-api/merge-videos";

/** Sortie TikTok 9:16. */
export const MERGE_UGC_WIDTH = 1080;
export const MERGE_UGC_HEIGHT = 1920;
/** Plancher TikTok ; Kling 24 fps est interpolé, l'utilisation reste fluide. */
export const MERGE_UGC_FPS = 30;

export async function mergerVideosFal(input: {
  videoUrls: string[];
  onProgress?: FalQueueProgress;
  timeoutMs?: number;
}): Promise<{ url: string; bytes: Uint8Array; mime: string }> {
  const video_urls = (input.videoUrls ?? [])
    .map((u) => String(u ?? "").trim())
    .filter(Boolean);
  if (video_urls.length < 2) {
    throw new Error("merge-videos: au moins 2 URLs requises");
  }

  const queued = await falQueueSubmit(
    MODEL,
    {
      video_urls,
      target_fps: MERGE_UGC_FPS,
      resolution: { width: MERGE_UGC_WIDTH, height: MERGE_UGC_HEIGHT },
    },
    input.onProgress,
  );
  const data = await falQueueAwaitJson(MODEL, queued, input.onProgress, input.timeoutMs ?? 300_000);
  const payload = (data?.data ?? data) as {
    video?: { url?: string; content_type?: string };
  };
  const url = payload?.video?.url;
  if (!url) {
    throw new Error(
      `merge-videos: pas de video.url — ${JSON.stringify(data).slice(0, 300)}`,
    );
  }
  const dl = await falDownloadBytes(url, input.onProgress);
  return {
    url: dl.url,
    bytes: dl.bytes,
    mime: payload.video?.content_type ?? dl.mime ?? "video/mp4",
  };
}
