/**
 * Upscale via Replicate — `juergengunz/real-esrgan-v2`.
 *
 * Secret : `REPLICATE_API_TOKEN` (même jeton que text-removal).
 * Input : `{ image: <url publique>, scale: number }`
 * Output : URL fichier (png/jpeg).
 */

const MODEL_VERSION =
  "e4265d21c4770b339080060fab33e452d77b8ef3ee9781fec9cae81d1973a2cf";
const MODEL_LABEL = "juergengunz/real-esrgan-v2";
const PREDICTIONS_URL = "https://api.replicate.com/v1/predictions";

/** Facteur d’agrandissement — défaut = exemple Replicate (`scale: 1`). */
const SCALE_DEFAUT = 1;

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
  /** Octets bruts — pas de base64 (évite OOM Edge sur gros upscales). */
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

function urlDepuisOutput(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const first = output[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "url" in first) {
      const u = (first as { url: unknown }).url;
      if (typeof u === "string") return u;
    }
  }
  if (output && typeof output === "object" && "url" in output) {
    const u = (output as { url: unknown }).url;
    if (typeof u === "string") return u;
  }
  return null;
}

/**
 * Upscale `imageUrl` via Real-ESRGAN v2. Renvoie octets + mime, ou `null`
 * si le token est absent.
 */
export async function upscaleViaRealEsrgan(
  imageUrl: string,
  onProgress?: UpscaleProgress,
  scale: number = SCALE_DEFAUT,
): Promise<UpscaleResultat | null> {
  const token = replicateToken();
  if (!token) return null;

  await onProgress?.({
    phase: "submit",
    detail: `modèle=${MODEL_LABEL} scale=${scale}`,
  });

  const submit = await fetch(PREDICTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({
      version: MODEL_VERSION,
      input: {
        image: imageUrl,
        scale,
      },
    }),
  });

  if (!submit.ok) {
    throw new Error(
      `Real-ESRGAN submit ${submit.status}: ${(await submit.text()).slice(0, 300)}`,
    );
  }

  let prediction = await submit.json();
  const predictionId = prediction.id as string | undefined;
  const getUrl = prediction?.urls?.get as string | undefined;

  let polls = 0;
  const debut = Date.now();
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
        `Real-ESRGAN status ${suivi.status}: ${(await suivi.text()).slice(0, 250)}`,
      );
    }
    prediction = await suivi.json();
  }

  if (prediction.status !== "succeeded") {
    throw new Error(
      `Real-ESRGAN ${prediction.status}: ${
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

  const url = urlDepuisOutput(prediction.output);
  if (!url) {
    throw new Error(
      `Real-ESRGAN: aucune image — ${JSON.stringify(prediction.output).slice(0, 200)}`,
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
    throw new Error(`Real-ESRGAN: téléchargement résultat ${img.status}`);
  }
  const bytes = new Uint8Array(await img.arrayBuffer());
  return { bytes, mime: mimeDepuisOctets(bytes) };
}
