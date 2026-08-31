/**
 * Incruste le cadre 1:1 ondulé (PNG fixe) sur la vidéo assemblée.
 * Le format ne bouge jamais : seules les transitions entre plans changent le contenu.
 */

import {
  falDownloadBytes,
  falQueueAwaitJson,
  falQueueSubmit,
  type FalQueueProgress,
} from "./fal_queue.ts";
import { sonderVideoMeta, urlSansCacheBuster } from "./fal_normaliser_video.ts";
import { serviceClient } from "./supabase.ts";

const COMPOSE = "fal-ai/ffmpeg-api/compose";
const CADRE_PATH = "papiers/_assets/cadre-papier-1x1.png";

type Supabase = ReturnType<typeof serviceClient>;

async function bytesCadre(): Promise<Uint8Array> {
  const url = new URL("./assets/cadre-papier.png", import.meta.url);
  return await Deno.readFile(url);
}

export async function assurerCadrePapierUrl(supabase: Supabase): Promise<string> {
  const pub = supabase.storage.from("medias").getPublicUrl(CADRE_PATH).data.publicUrl;
  const probe = await fetch(pub, { method: "HEAD" });
  if (probe.ok) return pub;
  const bytes = await bytesCadre();
  const { error } = await supabase.storage.from("medias").upload(CADRE_PATH, bytes, {
    contentType: "image/png",
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw new Error(`Upload cadre papier: ${error.message}`);
  return supabase.storage.from("medias").getPublicUrl(CADRE_PATH).data.publicUrl;
}

export async function incrusterCadrePapier(input: {
  videoUrl: string;
  cadreUrl: string;
  dureeSec?: number;
  onProgress?: FalQueueProgress;
}): Promise<{ url: string; bytes: Uint8Array; mime: string }> {
  const video_url = urlSansCacheBuster(input.videoUrl);
  if (!video_url) throw new Error("cadre papier: video_url vide");
  let duree = input.dureeSec ?? 0;
  if (!(duree > 0.3)) {
    const meta = await sonderVideoMeta(video_url, input.onProgress);
    duree = meta.durationSec ?? 0;
  }
  if (!(duree > 0.3)) duree = 8;
  const durMs = Math.round(duree * 1000);
  const queued = await falQueueSubmit(
    COMPOSE,
    {
      tracks: [
        {
          id: "video",
          type: "video",
          keyframes: [{ url: video_url, timestamp: 0, duration: durMs }],
        },
        {
          id: "cadre",
          type: "image",
          keyframes: [{ url: urlSansCacheBuster(input.cadreUrl), timestamp: 0, duration: durMs }],
        },
      ],
    },
    input.onProgress,
  );
  const data = await falQueueAwaitJson(COMPOSE, queued, input.onProgress, 300_000);
  const payload = (data?.data ?? data) as {
    video_url?: string;
    video?: { url?: string; content_type?: string };
  };
  const url = payload.video_url || payload.video?.url;
  if (!url) {
    throw new Error(`cadre papier: pas de video.url — ${JSON.stringify(data).slice(0, 280)}`);
  }
  const dl = await falDownloadBytes(url, input.onProgress);
  return {
    url: dl.url,
    bytes: dl.bytes,
    mime: payload.video?.content_type?.includes("video") ? payload.video.content_type : "video/mp4",
  };
}
