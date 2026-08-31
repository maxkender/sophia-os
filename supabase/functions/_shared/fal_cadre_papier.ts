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

/** PNG 9:16 embarqué si le bundle n’inclut pas le fichier voisin. */
const CADRE_PNG_B64 =
  "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";

async function bytesCadre(): Promise<Uint8Array> {
  try {
    const url = new URL("./assets/cadre-papier.png", import.meta.url);
    return await Deno.readFile(url);
  } catch {
    const bin = atob(CADRE_PNG_B64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
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
