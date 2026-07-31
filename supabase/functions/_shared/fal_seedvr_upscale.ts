/**
 * Upscale via Fal — `fal-ai/seedvr/upscale/image` (SeedVR2).
 *
 * Secret : `FAL_KEY` (même clé que text-removal).
 * Tarif typique : ~$0.001 / mégapixel de sortie.
 *
 * Sortie JPEG (pas PNG) : les PNG ×2 saturent la mémoire Edge
 * (WORKER_RESOURCE_LIMIT) au téléchargement + strip C2PA.
 */

import type { UpscaleProgress, UpscaleResultat } from "./replicate_realesrgan_upscale.ts";

const MODEL = "fal-ai/seedvr/upscale/image";
const QUEUE = `https://queue.fal.run/${MODEL}`;
/** Au-delà, l’Edge risque l’OOM même en JPEG — message clair côté admin. */
const MAX_OCTETS = 12 * 1024 * 1024;

function falKey(): string | null {
  return Deno.env.get("FAL_KEY") ?? Deno.env.get("FAL_API_KEY") ?? null;
}

function authHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
  };
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
  return "application/octet-stream";
}

/**
 * Upscale `imageUrl` via SeedVR2. Renvoie octets + mime, ou `null` si clé absente.
 * Défaut : factor ×2, sortie JPEG (léger pour Edge).
 */
export async function upscaleViaSeedVr(
  imageUrl: string,
  onProgress?: UpscaleProgress,
  upscaleFactor = 2,
): Promise<UpscaleResultat | null> {
  const key = falKey();
  if (!key) return null;

  await onProgress?.({
    phase: "submit",
    detail: `modèle=${MODEL} factor=${upscaleFactor} format=jpg`,
  });

  const submit = await fetch(QUEUE, {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify({
      image_url: imageUrl,
      upscale_mode: "factor",
      upscale_factor: upscaleFactor,
      noise_scale: 0.1,
      // JPEG ≪ PNG en RAM Edge (évite WORKER_RESOURCE_LIMIT).
      output_format: "jpg",
    }),
  });

  if (!submit.ok) {
    throw new Error(
      `SeedVR submit ${submit.status}: ${(await submit.text()).slice(0, 300)}`,
    );
  }

  const queued = await submit.json();
  const requestId = queued.request_id as string | undefined;
  const statusUrl =
    (queued.status_url as string | undefined) ??
    (requestId ? `${QUEUE}/requests/${requestId}/status` : null);
  const resultUrl =
    (queued.response_url as string | undefined) ??
    (requestId ? `${QUEUE}/requests/${requestId}` : null);

  if (!statusUrl || !resultUrl) {
    throw new Error(
      `SeedVR: réponse queue invalide ${JSON.stringify(queued).slice(0, 200)}`,
    );
  }

  const debut = Date.now();
  // Avec stream NDJSON (keepalive), l’idle 150s ne coupe plus — budget large.
  const BUDGET = 280_000;
  let statut = queued.status as string | undefined;
  let polls = 0;

  while (Date.now() - debut < BUDGET) {
    polls += 1;
    const st = await fetch(`${statusUrl}?logs=0`, { headers: authHeaders(key) });
    if (!st.ok) {
      throw new Error(
        `SeedVR status ${st.status}: ${(await st.text()).slice(0, 250)}`,
      );
    }
    const body = await st.json();
    statut = body.status as string;
    const elapsed = Math.round((Date.now() - debut) / 1000);
    await onProgress?.({
      phase: "poll",
      predictionId: requestId,
      polls,
      statut,
      detail: `SeedVR poll #${polls} → ${statut} (${elapsed}s)`,
    });

    if (statut === "COMPLETED") break;
    if (statut === "FAILED" || statut === "CANCELLED") {
      throw new Error(
        `SeedVR ${statut}: ${JSON.stringify(body.error ?? body).slice(0, 250)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (statut !== "COMPLETED") {
    throw new Error(
      `SeedVR: timeout (${BUDGET / 1000}s), dernier statut=${statut}, polls=${polls}`,
    );
  }

  await onProgress?.({
    phase: "result",
    predictionId: requestId,
    polls,
    statut: "succeeded",
  });

  const res = await fetch(resultUrl, { headers: authHeaders(key) });
  const texte = await res.text();
  if (!res.ok) {
    throw new Error(`SeedVR result ${res.status}: ${texte.slice(0, 250)}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(texte);
  } catch {
    throw new Error(`SeedVR: JSON invalide ${texte.slice(0, 200)}`);
  }
  const payload = (data?.data ?? data) as {
    image?: { url?: string };
  };
  const url = payload?.image?.url;
  if (!url) {
    throw new Error(`SeedVR: aucune image — ${texte.slice(0, 250)}`);
  }

  await onProgress?.({
    phase: "download",
    predictionId: requestId,
    polls,
    detail: "téléchargement résultat",
  });
  const img = await fetch(url);
  if (!img.ok) {
    throw new Error(`SeedVR: téléchargement résultat ${img.status}`);
  }
  const lenHdr = Number(img.headers.get("content-length") ?? 0);
  if (lenHdr > MAX_OCTETS) {
    throw new Error(
      `SeedVR: résultat trop gros (${Math.round(lenHdr / 1024 / 1024)} Mo) pour Edge — utilise Real-ESRGAN ou ×1.`,
    );
  }
  const bytes = new Uint8Array(await img.arrayBuffer());
  if (bytes.length > MAX_OCTETS) {
    throw new Error(
      `SeedVR: résultat trop gros (${Math.round(bytes.length / 1024 / 1024)} Mo) pour Edge — utilise Real-ESRGAN ou ×1.`,
    );
  }
  return { bytes, mime: mimeDepuisOctets(bytes) };
}
