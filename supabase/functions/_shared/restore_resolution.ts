/**
 * Fal / Flux Kontext text-removal sortent ~1 MP (ex. 1080×1920 → ~752×1392).
 * On restaure la résolution source via Recraft Crisp (Replicate) après clean.
 */

import { dimensionsImage } from "./inpaint.ts";
import { upscaleViaRecraftCrisp } from "./replicate_crisp_upscale.ts";
import { serviceClient } from "./supabase.ts";

function deBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function enBase64(bytes: Uint8Array): string {
  let binaire = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binaire += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binaire);
}

function mimeDepuisOctets(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return "image/png";
}

async function dimsDepuisUrl(
  url: string,
): Promise<{ w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return dimensionsImage(bytes);
  } catch {
    return null;
  }
}

/** Upload temporaire public pour donner une URL à Replicate. */
async function uploadTempPublic(
  bytes: Uint8Array,
  mime: string,
): Promise<{ url: string; path: string } | null> {
  try {
    const sb = serviceClient();
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
    const path = `tmp/restore/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from("medias").upload(path, bytes, {
      contentType: mime,
      upsert: true,
      cacheControl: "60",
    });
    if (error) return null;
    const publicUrl = sb.storage.from("medias").getPublicUrl(path).data.publicUrl;
    return { url: publicUrl, path };
  } catch {
    return null;
  }
}

async function supprimerTemp(path: string): Promise<void> {
  try {
    const sb = serviceClient();
    await sb.storage.from("medias").remove([path]);
  } catch {
    // best-effort
  }
}

export type RestoreProgress = (info: {
  detail: string;
  saute?: boolean;
  ok?: boolean;
}) => void | Promise<void>;

/**
 * Si le résultat clean est nettement plus petit que la source TikTok,
 * upscale Recraft Crisp pour retrouver une résolution utilisable.
 * Renvoie base64 + mime (inchangés si pas besoin / échec soft).
 */
export async function restaurerResolutionSiBesoin(
  base64: string,
  sourceUrl: string,
  onProgress?: RestoreProgress,
): Promise<{ base64: string; mime: string; restaure: boolean }> {
  const outBytes = deBase64(base64);
  const outMime = mimeDepuisOctets(outBytes);
  const outDims = dimensionsImage(outBytes);
  const srcDims = await dimsDepuisUrl(sourceUrl);

  if (!outDims || !srcDims) {
    await onProgress?.({
      detail: "③ Restore résolution SAUTÉ — dims illisibles",
      saute: true,
    });
    return { base64, mime: outMime, restaure: false };
  }

  const ratioW = outDims.w / srcDims.w;
  const ratioH = outDims.h / srcDims.h;
  // Flux Kontext ~1 MP : typiquement 0.6–0.8× sur du 1080p.
  if (ratioW >= 0.92 && ratioH >= 0.92) {
    await onProgress?.({
      detail: `③ Résolution OK ${outDims.w}×${outDims.h} (source ${srcDims.w}×${srcDims.h})`,
      saute: true,
    });
    return { base64, mime: outMime, restaure: false };
  }

  await onProgress?.({
    detail: `③ Downscale détecté ${outDims.w}×${outDims.h} ← source ${srcDims.w}×${srcDims.h} — Recraft Crisp…`,
  });

  const temp = await uploadTempPublic(outBytes, outMime);
  if (!temp) {
    await onProgress?.({
      detail: "③ Restore ÉCHEC — upload temp impossible (image livrée en basse rés.)",
      ok: false,
    });
    return { base64, mime: outMime, restaure: false };
  }

  try {
    const up = await upscaleViaRecraftCrisp(temp.url);
    if (!up) {
      await onProgress?.({
        detail: "③ Restore SAUTÉ — REPLICATE_API_TOKEN absent",
        saute: true,
      });
      return { base64, mime: outMime, restaure: false };
    }
    const upBytes = deBase64(up.base64);
    const upDims = dimensionsImage(upBytes);
    await onProgress?.({
      detail: upDims
        ? `③ Restore OK → ${upDims.w}×${upDims.h} (était ${outDims.w}×${outDims.h})`
        : `③ Restore OK (dims inconnues, était ${outDims.w}×${outDims.h})`,
      ok: true,
    });
    return { base64: up.base64, mime: up.mime, restaure: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await onProgress?.({
      detail: `③ Restore ÉCHEC: ${msg.slice(0, 180)} — image livrée en basse rés.`,
      ok: false,
    });
    return { base64, mime: outMime, restaure: false };
  } finally {
    await supprimerTemp(temp.path);
  }
}
