/**
 * Fallback nettoyage via Replicate — `flux-kontext-apps/text-removal`.
 *
 * Secret requis : `REPLICATE_API_TOKEN` (Supabase Edge Function secrets).
 * Même jeton que l’ancien LaMa ; tu peux le mettre à jour via :
 *   npx supabase secrets set REPLICATE_API_TOKEN=r8_... --project-ref <ref>
 * ou Dashboard → Project Settings → Edge Functions → Secrets.
 */

const MODEL = "flux-kontext-apps/text-removal";
const PREDICTIONS_URL =
  `https://api.replicate.com/v1/models/${MODEL}/predictions`;

function replicateToken(): string | null {
  return Deno.env.get("REPLICATE_API_TOKEN") ?? null;
}

function enBase64(bytes: Uint8Array): string {
  let binaire = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binaire += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binaire);
}

export type ReplicateProgress = (info: {
  phase: "submit" | "poll" | "result" | "download";
  predictionId?: string;
  polls?: number;
  statut?: string;
  detail?: string;
}) => void | Promise<void>;

/**
 * Nettoie `imageUrl` via Replicate FLUX Kontext text-removal.
 * Renvoie le JPEG/PNG en base64, ou `null` si le token est absent.
 */
export async function nettoyerViaReplicateTextRemoval(
  imageUrl: string,
  onProgress?: ReplicateProgress,
): Promise<string | null> {
  const token = replicateToken();
  if (!token) return null;

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
      input: {
        input_image: imageUrl,
        aspect_ratio: "match_input_image",
        output_format: "png",
        // 2 = max permissif (stills TikTok / films souvent borderline).
        safety_tolerance: 2,
      },
    }),
  });

  if (!submit.ok) {
    throw new Error(
      `Replicate text-removal submit ${submit.status}: ${(await submit.text()).slice(0, 300)}`,
    );
  }

  let prediction = await submit.json();
  const predictionId = prediction.id as string | undefined;
  const getUrl = prediction?.urls?.get as string | undefined;

  let polls = 0;
  const debut = Date.now();
  // Edge Function ~150 s : laisser de la marge pour download + C2PA + upload.
  const BUDGET = 90_000;

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
    await new Promise((r) => setTimeout(r, 2000));
    const suivi = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!suivi.ok) {
      throw new Error(
        `Replicate text-removal status ${suivi.status}: ${(await suivi.text()).slice(0, 250)}`,
      );
    }
    prediction = await suivi.json();
  }

  if (prediction.status !== "succeeded") {
    throw new Error(
      `Replicate text-removal ${prediction.status}: ${
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
      `Replicate text-removal: aucune image — ${JSON.stringify(prediction.output).slice(0, 200)}`,
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
    throw new Error(`Replicate text-removal: téléchargement résultat ${img.status}`);
  }
  return enBase64(new Uint8Array(await img.arrayBuffer()));
}
