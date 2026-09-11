/**
 * Composition finale Papier : canvas 1080×1920 noir, fenêtre 1:1 832×832
 * centrée (x=124, y=544), clipping coins arrondis 56px. Le mix 9:16 est
 * d'abord réduit à 80 % sur fond noir (sinon le trou du masque recadre).
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
  PAPIER_SCALE,
  alphaMasquePapier,
} from "./papier_compose.ts";
import { bytesNoirPapierMp4 } from "./papier_noir_mp4.ts";
import { serviceClient } from "./supabase.ts";

const COMPOSE = "fal-ai/ffmpeg-api/compose";
const OVERLAY = "fal-ai/workflow-utilities/overlay-video";
const MASQUE_PATH = "papiers/_assets/masque-1x1-s832-r56.png";
const NOIR_PNG_PATH = "papiers/_assets/noir-1080x1920.png";
/** 2 s suffisent : overlay `shortest: false` fige la dernière frame noire. */
const NOIR_VIDEO_PATH = "papiers/_assets/noir-1080x1920-2s.mp4";

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

async function pngRgba(alphaAt: (x: number, y: number) => number): Promise<Uint8Array> {
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
      raw[i + 3] = alphaAt(x + 0.5, y + 0.5);
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

/** PNG 1080×1920 : noir opaque hors fenêtre, transparent dans le carré arrondi. */
export async function pngMasquePapier(): Promise<Uint8Array> {
  return pngRgba((x, y) => alphaMasquePapier(x, y));
}

/** PNG 1080×1920 noir opaque — canvas TikTok sous le mix réduit. */
export async function pngNoirPapier(): Promise<Uint8Array> {
  return pngRgba(() => 255);
}

async function uploaderPng(
  supabase: Supabase,
  path: string,
  bytes: Uint8Array,
): Promise<string> {
  const { error } = await supabase.storage.from("medias").upload(path, bytes, {
    contentType: "image/png",
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw new Error(`Upload ${path}: ${error.message}`);
  return supabase.storage.from("medias").getPublicUrl(path).data.publicUrl;
}

async function urlPubliqueSiPresente(supabase: Supabase, path: string): Promise<string | null> {
  const parts = path.split("/");
  const name = parts.pop();
  const dir = parts.join("/");
  if (!name || !dir) return null;
  const { data, error } = await supabase.storage.from("medias").list(dir, {
    search: name,
    limit: 50,
  });
  const hit = (data ?? []).some((f) => f.name === name && Number(f.metadata?.size ?? 1) > 0);
  if (error || !hit) return null;
  return supabase.storage.from("medias").getPublicUrl(path).data.publicUrl;
}

export async function assurerMasquePapierUrl(supabase: Supabase): Promise<string> {
  const deja = await urlPubliqueSiPresente(supabase, MASQUE_PATH);
  if (deja) return deja;
  return uploaderPng(supabase, MASQUE_PATH, await pngMasquePapier());
}

export async function assurerNoirPngUrl(supabase: Supabase): Promise<string> {
  const deja = await urlPubliqueSiPresente(supabase, NOIR_PNG_PATH);
  if (deja) return deja;
  return uploaderPng(supabase, NOIR_PNG_PATH, await pngNoirPapier());
}

/** Vidéo noire 9:16 courte, bytes du repo — jamais un compose Fal. */
export async function assurerNoirVideoUrl(
  supabase: Supabase,
  _onProgress?: FalQueueProgress,
  _timeoutMs?: number,
): Promise<{ url: string; cree: boolean }> {
  const deja = await urlPubliqueSiPresente(supabase, NOIR_VIDEO_PATH);
  if (deja) return { url: deja, cree: false };
  const bytes = bytesNoirPapierMp4();
  const { error } = await supabase.storage.from("medias").upload(NOIR_VIDEO_PATH, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw new Error(`Upload noir papier: ${error.message}`);
  return {
    url: supabase.storage.from("medias").getPublicUrl(NOIR_VIDEO_PATH).data.publicUrl,
    cree: true,
  };
}

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

/** Place le mix 9:16 à 80 % au centre d'un canvas noir (marges TikTok, sans recadrer). */
export async function reduireVideoPapierTikTok(input: {
  videoUrl: string;
  supabase: Supabase;
  noirUrl?: string;
  onProgress?: FalQueueProgress;
  timeoutMs?: number;
}): Promise<{ url: string; bytes: Uint8Array; mime: string }> {
  const video_url = urlSansCacheBuster(input.videoUrl);
  if (!video_url) throw new Error("pad papier: video_url vide");
  const noirUrl = urlSansCacheBuster(
    input.noirUrl ??
      (await assurerNoirVideoUrl(input.supabase, input.onProgress, input.timeoutMs)).url,
  );
  const queued = await falQueueSubmit(
    OVERLAY,
    {
      main_video_url: noirUrl,
      overlay_video_url: video_url,
      x_percent: 50,
      y_percent: 50,
      scale_percent: Math.round(PAPIER_SCALE * 100),
      opacity: 1,
      blend_mode: "normal",
      shortest: false,
      audio_source: "overlay",
    },
    input.onProgress,
  );
  const data = await falQueueAwaitJson(OVERLAY, queued, input.onProgress, input.timeoutMs ?? 300_000);
  const url = videoUrlDepuisFal(data);
  if (!url) {
    throw new Error(`pad papier: pas de video.url — ${JSON.stringify(data).slice(0, 280)}`);
  }
  const dl = await falDownloadBytes(url, input.onProgress);
  return { url: dl.url, bytes: dl.bytes, mime: mimeVideoFal(data) };
}

export async function composerFinalePapier(input: {
  videoUrl: string;
  supabase: Supabase;
  dureeSec?: number;
  onProgress?: FalQueueProgress;
  timeoutMs?: number;
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
  const data = await falQueueAwaitJson(COMPOSE, queued, input.onProgress, input.timeoutMs ?? 300_000);
  const url = videoUrlDepuisFal(data);
  if (!url) {
    throw new Error(`compose papier: pas de video.url — ${JSON.stringify(data).slice(0, 280)}`);
  }
  const dl = await falDownloadBytes(url, input.onProgress);
  return { url: dl.url, bytes: dl.bytes, mime: mimeVideoFal(data) };
}
