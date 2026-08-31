/**
 * Fal — karaoke (transcription + incrustation mot à mot).
 *   fal-ai/workflow-utilities/auto-subtitle
 */

import {
  falDownloadBytes,
  falQueueAwaitJson,
  falQueueSubmit,
  type FalQueueProgress,
} from "./fal_queue.ts";
import { urlSansCacheBuster } from "./fal_normaliser_video.ts";

const MODEL = "fal-ai/workflow-utilities/auto-subtitle";

export async function incrusterKaraokeFal(input: {
  videoUrl: string;
  langue: string;
  onProgress?: FalQueueProgress;
}): Promise<{ url: string; bytes: Uint8Array; mime: string }> {
  const video_url = urlSansCacheBuster(input.videoUrl);
  if (!video_url) throw new Error("auto-subtitle: video_url vide");
  const queued = await falQueueSubmit(
    MODEL,
    {
      video_url,
      language: input.langue,
      font_name: "Anton",
      font_size: 64,
      font_weight: "black",
      font_color: "white",
      highlight_color: "white",
      stroke_width: 3,
      stroke_color: "black",
      background_color: "none",
      position: "center",
      y_offset: 0,
      words_per_subtitle: 1,
      enable_animation: false,
    },
    input.onProgress,
  );
  const data = await falQueueAwaitJson(MODEL, queued, input.onProgress, 300_000);
  const payload = (data?.data ?? data) as { video?: { url?: string; content_type?: string } };
  const url = payload?.video?.url;
  if (!url) {
    throw new Error(
      `auto-subtitle: pas de video.url — ${JSON.stringify(data).slice(0, 280)}`,
    );
  }
  const dl = await falDownloadBytes(url, input.onProgress);
  return {
    url: dl.url,
    bytes: dl.bytes,
    mime: payload.video?.content_type?.includes("video") ? payload.video.content_type : "video/mp4",
  };
}
