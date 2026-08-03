/**
 * Fal AI — Nano Banana Pro (génération + edit).
 *   generate : fal-ai/nano-banana-pro
 *   edit     : fal-ai/nano-banana-pro/edit
 *
 * Secret : FAL_KEY | FAL_API_KEY
 */

const MODEL_GEN = "fal-ai/nano-banana-pro";
const MODEL_EDIT = "fal-ai/nano-banana-pro/edit";
const QUEUE_GEN = `https://queue.fal.run/${MODEL_GEN}`;
const QUEUE_EDIT = `https://queue.fal.run/${MODEL_EDIT}`;

function falKey(): string | null {
  return Deno.env.get("FAL_KEY") ?? Deno.env.get("FAL_API_KEY") ?? null;
}

function authHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
  };
}

export type FalNanoProgress = (info: {
  phase: "submit" | "poll" | "result" | "download";
  requestId?: string;
  polls?: number;
  statut?: string;
  detail?: string;
}) => void | Promise<void>;

async function attendreResultat(
  key: string,
  queueBase: string,
  queued: Record<string, unknown>,
  onProgress?: FalNanoProgress,
  budgetMs = 120_000,
): Promise<{ url: string; bytes: Uint8Array; mime: string }> {
  const requestId = queued.request_id as string | undefined;
  const statusUrl =
    (queued.status_url as string | undefined) ??
    (requestId ? `${queueBase}/requests/${requestId}/status` : null);
  const resultUrl =
    (queued.response_url as string | undefined) ??
    (requestId ? `${queueBase}/requests/${requestId}` : null);

  if (!statusUrl || !resultUrl) {
    throw new Error(`Fal nano-banana: queue invalide ${JSON.stringify(queued).slice(0, 200)}`);
  }

  const debut = Date.now();
  let statut = queued.status as string | undefined;
  let polls = 0;

  while (Date.now() - debut < budgetMs) {
    polls += 1;
    const st = await fetch(`${statusUrl}?logs=0`, { headers: authHeaders(key) });
    if (!st.ok) {
      throw new Error(`Fal nano-banana status ${st.status}: ${(await st.text()).slice(0, 250)}`);
    }
    const body = await st.json();
    statut = body.status as string;
    await onProgress?.({
      phase: "poll",
      requestId,
      polls,
      statut,
      detail: `poll #${polls} → ${statut}`,
    });

    if (statut === "COMPLETED") break;
    if (statut === "FAILED" || statut === "CANCELLED") {
      throw new Error(
        `Fal nano-banana ${statut}: ${JSON.stringify(body.error ?? body).slice(0, 250)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (statut !== "COMPLETED") {
    throw new Error(
      `Fal nano-banana: timeout (${budgetMs / 1000}s), dernier statut=${statut}, polls=${polls}`,
    );
  }

  await onProgress?.({ phase: "result", requestId, polls, statut });
  const res = await fetch(resultUrl, { headers: authHeaders(key) });
  const texte = await res.text();
  if (!res.ok) {
    throw new Error(`Fal nano-banana result ${res.status}: ${texte.slice(0, 250)}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(texte);
  } catch {
    throw new Error(`Fal nano-banana: JSON invalide ${texte.slice(0, 200)}`);
  }
  const payload = (data?.data ?? data) as {
    images?: Array<{ url?: string; content_type?: string }>;
  };
  const url = payload?.images?.[0]?.url;
  if (!url) {
    throw new Error(`Fal nano-banana: aucune image — ${texte.slice(0, 250)}`);
  }

  await onProgress?.({ phase: "download", requestId, polls, detail: "téléchargement" });
  const img = await fetch(url);
  if (!img.ok) throw new Error(`Fal nano-banana download ${img.status}`);
  const mime = img.headers.get("content-type") ?? payload.images?.[0]?.content_type ?? "image/png";
  const bytes = new Uint8Array(await img.arrayBuffer());
  return { url, bytes, mime };
}

/** Génère un portrait 9:16 depuis un prompt texte. */
export async function genererNanoBananaPro(
  prompt: string,
  onProgress?: FalNanoProgress,
): Promise<{ url: string; bytes: Uint8Array; mime: string }> {
  const key = falKey();
  if (!key) throw new Error("FAL_KEY manquant");

  await onProgress?.({ phase: "submit", detail: `modèle=${MODEL_GEN}` });
  const submit = await fetch(QUEUE_GEN, {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify({
      prompt,
      num_images: 1,
      aspect_ratio: "9:16",
      output_format: "png",
      resolution: "1K",
      safety_tolerance: "6",
      limit_generations: true,
    }),
  });
  if (!submit.ok) {
    throw new Error(`Fal nano-banana submit ${submit.status}: ${(await submit.text()).slice(0, 300)}`);
  }
  const queued = await submit.json();
  return attendreResultat(key, QUEUE_GEN, queued, onProgress);
}

/** Ratios Fal supportés (edit) — `auto` = dimensions de l’image d’entrée. */
export const FAL_ASPECT_RATIOS = [
  "auto",
  "21:9",
  "16:9",
  "3:2",
  "4:3",
  "5:4",
  "1:1",
  "4:5",
  "3:4",
  "2:3",
  "9:16",
] as const;

export type FalAspectRatio = (typeof FAL_ASPECT_RATIOS)[number];

/** Mappe w×h vers le ratio Fal le plus proche (hors `auto`). */
export function aspectRatioProche(w: number, h: number): Exclude<FalAspectRatio, "auto"> {
  if (!(w > 0 && h > 0)) return "9:16";
  const r = w / h;
  const options: Array<[Exclude<FalAspectRatio, "auto">, number]> = [
    ["21:9", 21 / 9],
    ["16:9", 16 / 9],
    ["3:2", 3 / 2],
    ["4:3", 4 / 3],
    ["5:4", 5 / 4],
    ["1:1", 1],
    ["4:5", 4 / 5],
    ["3:4", 3 / 4],
    ["2:3", 2 / 3],
    ["9:16", 9 / 16],
  ];
  let best: Exclude<FalAspectRatio, "auto"> = "9:16";
  let bestDiff = Infinity;
  for (const [name, val] of options) {
    const d = Math.abs(r - val);
    if (d < bestDiff) {
      bestDiff = d;
      best = name;
    }
  }
  return best;
}

/** Edit Nano Banana Pro — 1..N images de référence (`image_urls`).
 *  Défaut `auto` : même ratio que l’image d’entrée (Figure 1). */
export async function editerNanoBananaPro(
  imageUrlOrUrls: string | string[],
  prompt: string,
  onProgress?: FalNanoProgress,
  opts?: { aspectRatio?: string },
): Promise<{ url: string; bytes: Uint8Array; mime: string }> {
  const key = falKey();
  if (!key) throw new Error("FAL_KEY manquant");

  const image_urls = (Array.isArray(imageUrlOrUrls) ? imageUrlOrUrls : [imageUrlOrUrls])
    .map((u) => String(u ?? "").trim())
    .filter(Boolean);
  if (image_urls.length === 0) throw new Error("Fal nano-banana edit: image_urls vide");

  // Défaut auto (= taille de la ref), plus de 9:16 forcé.
  const aspect_ratio = opts?.aspectRatio ?? "auto";
  await onProgress?.({
    phase: "submit",
    detail: `modèle=${MODEL_EDIT} refs=${image_urls.length} aspect=${aspect_ratio}`,
  });
  const submit = await fetch(QUEUE_EDIT, {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify({
      prompt,
      image_urls,
      num_images: 1,
      aspect_ratio,
      output_format: "png",
      resolution: "1K",
      safety_tolerance: "6",
    }),
  });
  if (!submit.ok) {
    throw new Error(
      `Fal nano-banana edit submit ${submit.status}: ${(await submit.text()).slice(0, 300)}`,
    );
  }
  const queued = await submit.json();
  return attendreResultat(key, QUEUE_EDIT, queued, onProgress);
}
