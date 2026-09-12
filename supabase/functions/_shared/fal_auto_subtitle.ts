/**
 * Fal — karaoke Papier.
 *   fal-ai/workflow-utilities/add-subtitles-to-video  (timings TTS déjà connus)
 *   Pas de auto-subtitle STT (coût + désync).
 */

import {
  falDownloadBytes,
  falQueueAwaitJson,
  falQueueSubmit,
  type FalQueueProgress,
} from "./fal_queue.ts";
import { urlSansCacheBuster } from "./fal_normaliser_video.ts";
import type { PapierSousTitre } from "./papier_locales_core.ts";

const BURN = "fal-ai/workflow-utilities/add-subtitles-to-video";

const STYLE = {
  font_name: "Anton",
  font_size: 56,
  font_weight: "black" as const,
  font_color: "white" as const,
  stroke_width: 3,
  stroke_color: "black" as const,
  background_color: "none" as const,
  position: "bottom" as const,
  y_offset: 48,
};

function videoUrlDepuisFal(data: Record<string, unknown> | null | undefined): string | undefined {
  const root = (data ?? {}) as Record<string, unknown>;
  const inner = (root.data ?? root) as {
    video_url?: string;
    video?: { url?: string; content_type?: string };
  };
  return inner.video_url || inner.video?.url;
}

function mimeVideoFal(data: Record<string, unknown> | null | undefined): string {
  const root = (data ?? {}) as Record<string, unknown>;
  const inner = (root.data ?? root) as { video?: { content_type?: string } };
  return inner.video?.content_type?.includes("video") ? inner.video.content_type : "video/mp4";
}

export async function incrusterKaraokeFal(input: {
  videoUrl: string;
  langue: string;
  subtitles?: PapierSousTitre[];
  onProgress?: FalQueueProgress;
  timeoutMs?: number;
}): Promise<{ url: string; bytes: Uint8Array; mime: string }> {
  const video_url = urlSansCacheBuster(input.videoUrl);
  if (!video_url) throw new Error("auto-subtitle: video_url vide");
  const timeoutMs = input.timeoutMs ?? 130_000;
  const segments = (input.subtitles ?? []).filter(
    (s) => s.text.trim() && s.end > s.start && s.start >= 0,
  );
  if (!segments.length) {
    throw new Error("karaoke papier: timings TTS absents — pas de re-STT (coût)");
  }

  const queued = await falQueueSubmit(
    BURN,
    {
      video_url,
      subtitles: segments.map((s) => ({
        text: s.text,
        start: s.start,
        end: s.end,
      })),
      ...STYLE,
    },
    input.onProgress,
  );

  const data = await falQueueAwaitJson(BURN, queued, input.onProgress, timeoutMs);
  const url = videoUrlDepuisFal(data);
  if (!url) {
    throw new Error(`karaoke papier: pas de video.url — ${JSON.stringify(data).slice(0, 280)}`);
  }
  const dl = await falDownloadBytes(url, input.onProgress);
  return { url: dl.url, bytes: dl.bytes, mime: mimeVideoFal(data) };
}
