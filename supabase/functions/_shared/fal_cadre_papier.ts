/**
 * Composition finale Papier : canvas 1080×1920 noir, fenêtre 1:1 1040×1040
 * centrée (x=20, y=440), clipping coins arrondis 48px. Pas de cadre décoratif.
 */

import {
  falDownloadBytes,
  falQueueAwaitJson,
  falQueueSubmit,
  type FalQueueProgress,
} from "./fal_queue.ts";
import { sonderVideoMeta, urlSansCacheBuster } from "./fal_normaliser_video.ts";
import {
  PAPIER_CANVAS_H,
  PAPIER_CANVAS_W,
  alphaMasquePapier,
} from "./papier_compose.ts";
import { serviceClient } from "./supabase.ts";

const COMPOSE = "fal-ai/ffmpeg-api/compose";
const MASQUE_PATH = "papiers/_assets/masque-1x1-r48.png";

type Supabase = ReturnType<typeof serviceClient>;

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcSrc = out.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcSrc));
  return out;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  await writer.write(data);
  await writer.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

/** PNG 1080×1920 : noir opaque hors fenêtre, transparent dans le carré arrondi. */
export async function pngMasquePapier(): Promise<Uint8Array> {
  const w = PAPIER_CANVAS_W;
  const h = PAPIER_CANVAS_H;
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const i = row + 1 + x * 4;
      raw[i] = 0;
      raw[i + 1] = 0;
      raw[i + 2] = 0;
      raw[i + 3] = alphaMasquePapier(x + 0.5, y + 0.5);
    }
  }
  const zipped = await deflateRaw(raw);
  const ihdr = new Uint8Array(13);
  const iv = new DataView(ihdr.buffer);
  iv.setUint32(0, w);
  iv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", zipped), pngChunk("IEND", new Uint8Array())];
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export async function assurerMasquePapierUrl(supabase: Supabase): Promise<string> {
  const pub = supabase.storage.from("medias").getPublicUrl(MASQUE_PATH).data.publicUrl;
  const probe = await fetch(pub, { method: "HEAD" });
  if (probe.ok) return pub;
  const bytes = await pngMasquePapier();
  const { error } = await supabase.storage.from("medias").upload(MASQUE_PATH, bytes, {
    contentType: "image/png",
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw new Error(`Upload masque papier: ${error.message}`);
  return supabase.storage.from("medias").getPublicUrl(MASQUE_PATH).data.publicUrl;
}

export async function composerFinalePapier(input: {
  videoUrl: string;
  supabase: Supabase;
  dureeSec?: number;
  onProgress?: FalQueueProgress;
}): Promise<{ url: string; bytes: Uint8Array; mime: string }> {
  const video_url = urlSansCacheBuster(input.videoUrl);
  if (!video_url) throw new Error("compose papier: video_url vide");
  let duree = input.dureeSec ?? 0;
  if (!(duree > 0.3)) {
    const meta = await sonderVideoMeta(video_url, input.onProgress);
    duree = meta.durationSec ?? 0;
  }
  if (!(duree > 0.3)) duree = 8;
  const durMs = Math.round(duree * 1000);
  const masqueUrl = await assurerMasquePapierUrl(input.supabase);
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
          id: "masque",
          type: "image",
          keyframes: [{ url: urlSansCacheBuster(masqueUrl), timestamp: 0, duration: durMs }],
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
    throw new Error(`compose papier: pas de video.url — ${JSON.stringify(data).slice(0, 280)}`);
  }
  const dl = await falDownloadBytes(url, input.onProgress);
  return {
    url: dl.url,
    bytes: dl.bytes,
    mime: payload.video?.content_type?.includes("video") ? payload.video.content_type : "video/mp4",
  };
}
