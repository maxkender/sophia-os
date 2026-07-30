/**
 * Upscale via Replicate — `recraft-ai/recraft-crisp-upscale`.
 *
 * Secret : `REPLICATE_API_TOKEN` (même jeton que text-removal).
 * Input : `{ image: <url publique> }`
 * Output : octets image (souvent webp) — pas de base64 pour limiter la RAM Edge.
 */

const MODEL = "recraft-ai/recraft-crisp-upscale";
const PREDICTIONS_URL =
  `https://api.replicate.com/v1/models/${MODEL}/predictions`;

function replicateToken(): string | null {
  return Deno.env.get("REPLICATE_API_TOKEN") ?? null;
}

export type UpscaleProgress = (info: {
  phase: "submit" | "poll" | "result" | "download";
  predictionId?: string;
  polls?: number;
  statut?: string;
  detail?: string;
}) => void | Promise<void>;

export interface UpscaleResultat {
  bytes: Uint8Array;
  /** image/webp | image/png | image/jpeg */
  mime: string;
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
  // RIFF....WEBP
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
 * Upscale `imageUrl` via Recraft Crisp. Renvoie octets + mime, ou `null`
 * si le token est absent.
 */
export async function upscaleViaRecraftCrisp(
  imageUrl: string,
  onProgress?: UpscaleProgress,
): Promise<UpscaleResultat | null> {
  const token = replicateToken();
  if (!token) return null;

  // Cache-bust `?v=` OK pour Replicate ; on garde l'URL telle quelle.
  await onProgress?.({
    phase: "submit",
    detail: `modèle=${MODEL}`,
  });

  const submit = await fetch(PREDICTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      input: { image: imageUrl },
    }),
  });

  if (!submit.ok) {
    throw new Error(
      `Recraft upscale submit ${submit.status}: ${(await submit.text()).slice(0, 300)}`,
    );
  }

  let prediction = await submit.json();
  const predictionId = prediction.id as string | undefined;
  const getUrl = prediction?.urls?.get as string | undefined;

  let polls = 0;
  const debut = Date.now();
  // Edge ~150 s : marge pour download + C2PA + upload.
  const BUDGET = 100_000;

  while (
    (prediction.status === "starting" || prediction.status === "processing") &&
    Date.now() - debut < BUDGET
  ) {
    if (!getUrl) break;
    polls += 1;
    await onProgress?.({
      phase: "poll",
      predictionId,
      polls,
      statut: prediction.status,
      detail: `poll #${polls} → ${prediction.status}`,
    });
    await new Promise((r) => setTimeout(r, 1500));
    const suivi = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!suivi.ok) {
      throw new Error(
        `Recraft upscale status ${suivi.status}: ${(await suivi.text()).slice(0, 250)}`,
      );
    }
    prediction = await suivi.json();
  }

  if (prediction.status !== "succeeded") {
    throw new Error(
      `Recraft upscale ${prediction.status}: ${
        JSON.stringify(prediction.error ?? prediction).slice(0, 250)
      } (${polls} polls)`,
    );
  }

  await onProgress?.({
    phase: "result",
    predictionId,
    polls,
    statut: "succeeded",
  });

  const sortie = Array.isArray(prediction.output)
    ? prediction.output[0]
    : prediction.output;
  const url =
    typeof sortie === "string"
      ? sortie
      : typeof sortie?.url === "function"
        ? String(sortie.url())
        : typeof sortie?.url === "string"
          ? sortie.url
          : null;
  if (!url) {
    throw new Error(
      `Recraft upscale: aucune image — ${JSON.stringify(prediction.output).slice(0, 200)}`,
    );
  }

  await onProgress?.({
    phase: "download",
    predictionId,
    polls,
    detail: "téléchargement résultat",
  });
  const img = await fetch(url);
  if (!img.ok) {
    throw new Error(`Recraft upscale: téléchargement résultat ${img.status}`);
  }
  const bytes = new Uint8Array(await img.arrayBuffer());
  return { bytes, mime: mimeDepuisOctets(bytes) };
}
