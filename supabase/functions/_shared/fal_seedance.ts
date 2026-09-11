/**
 * Fal — Seedance 2.0 Fast image-to-video (clips papier).
 *   bytedance/seedance-2.0/fast/image-to-video
 * Durée 4–15 s, 9:16, sans audio (voix = phase 3).
 */

import {
  falDownloadBytes,
  falQueueAwaitJson,
  falQueueSubmit,
  type FalQueueProgress,
} from "./fal_queue.ts";
import { urlSansCacheBuster } from "./fal_normaliser_video.ts";
import { bornerDureeClip, type DureeCibleClip } from "./papier_script_core.ts";

export const SEEDANCE_I2V = "bytedance/seedance-2.0/fast/image-to-video";

export type SeedanceQueued = {
  request_id?: string;
  status_url?: string;
  response_url?: string;
  status?: string;
};

export function extraireVideoFalUrl(data: Record<string, unknown>): string | null {
  const payload = (data?.data ?? data) as {
    video?: { url?: string };
    videos?: Array<{ url?: string }>;
  };
  return payload?.video?.url ?? payload?.videos?.[0]?.url ?? null;
}

export async function soumettreSeedanceI2V(input: {
  prompt: string;
  imageUrl: string;
  duree: DureeCibleClip;
  onProgress?: FalQueueProgress;
}): Promise<SeedanceQueued> {
  const image_url = urlSansCacheBuster(input.imageUrl);
  if (!image_url) throw new Error("Seedance: image_url vide");
  const queued = await falQueueSubmit(
    SEEDANCE_I2V,
    {
      prompt: input.prompt,
      image_url,
      duration: String(bornerDureeClip(input.duree)),
      aspect_ratio: "9:16",
      resolution: "720p",
      generate_audio: false,
    },
    input.onProgress,
  );
  return queued as SeedanceQueued;
}

/** Poll jusqu'à COMPLETED ou timeout (ne jette pas si budget épuisé). */
export async function attendreSeedanceI2V(
  queued: SeedanceQueued,
  onProgress?: FalQueueProgress,
  budgetMs = 40_000,
): Promise<{ done: false } | { done: true; url: string; bytes: Uint8Array; mime: string }> {
  try {
    const data = await falQueueAwaitJson(
      SEEDANCE_I2V,
      queued as Record<string, unknown>,
      onProgress,
      budgetMs,
    );
    const url = extraireVideoFalUrl(data);
    if (!url) {
      throw new Error(
        `Seedance: pas de video.url — ${JSON.stringify(data).slice(0, 280)}`,
      );
    }
    const file = await falDownloadBytes(url, onProgress);
    return {
      done: true,
      url: file.url,
      bytes: file.bytes,
      mime: file.mime.includes("video") ? file.mime : "video/mp4",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/timeout|dernier=/i.test(msg)) return { done: false };
    throw error;
  }
}
