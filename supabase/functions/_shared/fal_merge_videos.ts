/**
 * Fal — ffmpeg merge-videos
 *   fal-ai/ffmpeg-api/merge-videos
 */

import {
  falDownloadBytes,
  falQueueAwaitJson,
  falQueueSubmit,
  type FalQueueProgress,
} from "./fal_queue.ts";

const MODEL = "fal-ai/ffmpeg-api/merge-videos";

export async function mergerVideosFal(input: {
  videoUrls: string[];
  onProgress?: FalQueueProgress;
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
      // 9:16 vertical — résolution type TikTok
      resolution: { width: 720, height: 1280 },
    },
    input.onProgress,
  );
  const data = await falQueueAwaitJson(MODEL, queued, input.onProgress, 300_000);
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
