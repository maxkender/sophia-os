/**
 * Fal AI — OpenRouter Vision (`openrouter/router/vision`).
 * Détection visage humain au premier plan (réponse YES/NO courte).
 *
 * Secret : FAL_KEY | FAL_API_KEY
 * Modèle (pas cher) : FAL_VISION_MODEL (défaut google/gemini-2.5-flash-lite)
 */

const MODEL_ENDPOINT = "openrouter/router/vision";
const RUN_URL = `https://fal.run/${MODEL_ENDPOINT}`;
const QUEUE_URL = `https://queue.fal.run/${MODEL_ENDPOINT}`;

/** Flash-lite : très peu cher en tokens ; fallback flash documenté Fal. */
const MODEL_DEFAUT = "google/gemini-2.5-flash-lite";
const MODEL_FALLBACK = "google/gemini-2.5-flash";

const PROMPT = `Is there a clearly visible human face in the FOREGROUND of this photo (main subject, close or prominent)?
Answer YES only if a real human face is a primary subject in the foreground.
Answer NO for animals, cartoons, distant/tiny background faces, partial blurry faces, or no face.
Answer with exactly one word: YES or NO.`;

const SYSTEM =
  "Answer with only YES or NO. No punctuation, no explanation, no markdown.";

function falKey(): string | null {
  return Deno.env.get("FAL_KEY") ?? Deno.env.get("FAL_API_KEY") ?? null;
}

function visionModel(): string {
  return Deno.env.get("FAL_VISION_MODEL")?.trim() || MODEL_DEFAUT;
}

function authHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Key ${key}`,
    "Content-Type": "application/json",
  };
}

function payload(imageUrl: string, model: string) {
  return {
    image_urls: [imageUrl],
    prompt: PROMPT,
    system_prompt: SYSTEM,
    model,
    temperature: 0,
    reasoning: false,
  };
}

function extraireTexte(data: unknown): string {
  if (typeof data === "string") return data;
  if (!data || typeof data !== "object") return "";
  const o = data as Record<string, unknown>;
  if (typeof o.output === "string") return o.output;
  if (typeof o.text === "string") return o.text;
  if (typeof o.response === "string") return o.response;
  const nested = o.data;
  if (nested && typeof nested === "object") {
    const d = nested as Record<string, unknown>;
    if (typeof d.output === "string") return d.output;
    if (typeof d.text === "string") return d.text;
  }
  // OpenAI-style choices
  const choices = o.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const msg = (choices[0] as { message?: { content?: string } }).message;
    if (typeof msg?.content === "string") return msg.content;
  }
  return JSON.stringify(o).slice(0, 200);
}

/** Parse YES/NO (ou OUI/NON) depuis la réponse modèle. */
export function parserVisagePremierPlan(texte: string): boolean {
  const t = texte.trim().toUpperCase().replace(/[^A-ZÀÂÄÉÈÊËÏÎÔÙÛÜŒÆ]/g, " ");
  const premier = t.split(/\s+/).find(Boolean) ?? "";
  if (["YES", "Y", "OUI", "TRUE", "1"].includes(premier)) return true;
  if (["NO", "N", "NON", "FALSE", "0"].includes(premier)) return false;
  if (/\bYES\b|\bOUI\b/.test(t)) return true;
  if (/\bNO\b|\bNON\b/.test(t)) return false;
  throw new Error(`Réponse vision illisible: ${texte.slice(0, 80)}`);
}

async function attendreQueue(
  key: string,
  queued: Record<string, unknown>,
  budgetMs = 60_000,
): Promise<unknown> {
  const requestId = queued.request_id as string | undefined;
  const statusUrl =
    (queued.status_url as string | undefined) ??
    (requestId ? `${QUEUE_URL}/requests/${requestId}/status` : null);
  const resultUrl =
    (queued.response_url as string | undefined) ??
    (requestId ? `${QUEUE_URL}/requests/${requestId}` : null);
  if (!statusUrl || !resultUrl) {
    throw new Error(`Fal vision queue invalide ${JSON.stringify(queued).slice(0, 200)}`);
  }

  const debut = Date.now();
  let statut = queued.status as string | undefined;
  while (Date.now() - debut < budgetMs) {
    const st = await fetch(`${statusUrl}?logs=0`, { headers: authHeaders(key) });
    if (!st.ok) {
      throw new Error(`Fal vision status ${st.status}: ${(await st.text()).slice(0, 200)}`);
    }
    const body = await st.json();
    statut = body.status as string;
    if (statut === "COMPLETED") break;
    if (statut === "FAILED" || statut === "CANCELLED") {
      throw new Error(`Fal vision ${statut}: ${JSON.stringify(body.error ?? body).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  if (statut !== "COMPLETED") {
    throw new Error(`Fal vision timeout, dernier statut=${statut}`);
  }
  const res = await fetch(resultUrl, { headers: authHeaders(key) });
  const texte = await res.text();
  if (!res.ok) throw new Error(`Fal vision result ${res.status}: ${texte.slice(0, 250)}`);
  try {
    return JSON.parse(texte);
  } catch {
    return texte;
  }
}

async function appelerVision(
  key: string,
  imageUrl: string,
  model: string,
): Promise<string> {
  // Sync d'abord (réponses courtes) — sinon file d'attente.
  const sync = await fetch(RUN_URL, {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify(payload(imageUrl, model)),
  });
  const syncTexte = await sync.text();
  if (sync.ok) {
    try {
      return extraireTexte(JSON.parse(syncTexte));
    } catch {
      return syncTexte;
    }
  }
  // 404/422 modèle inconnu → laisser l'appelant retry avec fallback
  if (sync.status === 404 || sync.status === 422) {
    throw new Error(`MODEL_REJECTED:${sync.status}:${syncTexte.slice(0, 180)}`);
  }

  const queue = await fetch(QUEUE_URL, {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify(payload(imageUrl, model)),
  });
  if (!queue.ok) {
    throw new Error(
      `Fal vision submit ${queue.status}: ${(await queue.text()).slice(0, 250)}`,
    );
  }
  const queued = await queue.json();
  return extraireTexte(await attendreQueue(key, queued));
}

/**
 * Indique si l'image a un visage humain au premier plan.
 * Utilise un VLM cheap via fal openrouter/router/vision.
 */
export async function detecterVisagePremierPlan(
  imageUrl: string,
): Promise<{ visage: boolean; brut: string; model: string }> {
  const key = falKey();
  if (!key) throw new Error("FAL_KEY manquant");

  const models = [visionModel()];
  if (!models.includes(MODEL_FALLBACK)) models.push(MODEL_FALLBACK);

  let dernier: Error | null = null;
  for (const model of models) {
    try {
      const brut = await appelerVision(key, imageUrl, model);
      return { visage: parserVisagePremierPlan(brut), brut, model };
    } catch (e) {
      dernier = e instanceof Error ? e : new Error(String(e));
      if (!dernier.message.startsWith("MODEL_REJECTED:")) break;
    }
  }
  throw dernier ?? new Error("Fal vision échec");
}
