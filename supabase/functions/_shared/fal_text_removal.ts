/**
 * Nettoyage d'image via Fal AI — `fal-ai/image-editing/text-removal`.
 *
 * Spécialisé retrait de texte (captions / overlays), ~$0.04/image.
 * Remplace Seedream Pro Edit, trop lourd / cher pour ce job.
 *
 * Secret requis : `FAL_KEY` (Supabase Edge Function secrets).
 */

const MODEL = "fal-ai/image-editing/text-removal";
const QUEUE = `https://queue.fal.run/${MODEL}`;

function falKey(): string | null {
  return Deno.env.get("FAL_KEY") ?? Deno.env.get("FAL_API_KEY") ?? null;
}

function enBase64(bytes: Uint8Array): string {
  let binaire = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binaire += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binaire);
}

function authHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
  };
}

/**
 * Nettoie `imageUrl` via Fal text-removal. Renvoie le JPEG en base64, ou
 * `null` si `FAL_KEY` n'est pas configuré.
 */
export async function nettoyerViaFalTextRemoval(
  imageUrl: string,
): Promise<string | null> {
  const key = falKey();
  if (!key) return null;

  const submit = await fetch(QUEUE, {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify({
      image_url: imageUrl,
      output_format: "jpeg",
      // 6 = le plus permissif (photos TikTok souvent borderline).
      safety_tolerance: "6",
    }),
  });

  if (!submit.ok) {
    throw new Error(
      `Fal text-removal submit ${submit.status}: ${(await submit.text()).slice(0, 300)}`,
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
      `Fal text-removal: réponse queue invalide ${JSON.stringify(queued).slice(0, 200)}`,
    );
  }

  const debut = Date.now();
  const BUDGET = 140_000;
  let statut = queued.status as string | undefined;

  while (Date.now() - debut < BUDGET) {
    const st = await fetch(`${statusUrl}?logs=0`, { headers: authHeaders(key) });
    if (!st.ok) {
      throw new Error(
        `Fal text-removal status ${st.status}: ${(await st.text()).slice(0, 250)}`,
      );
    }
    const body = await st.json();
    statut = body.status as string;

    if (statut === "COMPLETED") break;
    if (statut === "FAILED" || statut === "CANCELLED") {
      throw new Error(
        `Fal text-removal ${statut}: ${JSON.stringify(body.error ?? body).slice(0, 250)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (statut !== "COMPLETED") {
    throw new Error(
      `Fal text-removal: timeout (${BUDGET / 1000}s), dernier statut=${statut}`,
    );
  }

  const res = await fetch(resultUrl, { headers: authHeaders(key) });
  const texte = await res.text();
  if (!res.ok) {
    throw new Error(`Fal text-removal result ${res.status}: ${texte.slice(0, 250)}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(texte);
  } catch {
    throw new Error(`Fal text-removal: JSON invalide ${texte.slice(0, 200)}`);
  }
  const payload = (data?.data ?? data) as {
    images?: Array<{ url?: string }>;
  };
  const url = payload?.images?.[0]?.url;
  if (!url) {
    throw new Error(`Fal text-removal: aucune image — ${texte.slice(0, 250)}`);
  }

  const img = await fetch(url);
  if (!img.ok) {
    throw new Error(`Fal text-removal: téléchargement résultat ${img.status}`);
  }
  return enBase64(new Uint8Array(await img.arrayBuffer()));
}
