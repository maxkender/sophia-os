// Constantes du pod 10 et appels à la fonction Edge `pods` de l'OS, avec le
// jeton du pod (POD_JETON). Le jeton ne s'écrit jamais dans un fichier : il
// vient de l'environnement.

export const POD = "remakes_yasmine";
/** Le compte refait : « that girl / studytok », gros succès de la rentrée de juillet. */
export const COMPTE_SOURCE = "yasminespixels";
/** Les langues livrées : le français, puis l'espagnol, l'allemand et le turc (langues de micabo, 23/10). */
export const LANGUES = ["fr", "es", "de", "tr"] as const;
/** La langue du deck de base déposé (l'OS l'exige dans `decks`). */
export const LANGUE_SOURCE = "fr";

const URL_DEFAUT = "https://mbikecieskoobeizixig.supabase.co";

export async function appelPod<T = Record<string, unknown>>(corps: Record<string, unknown>, fonction = "pods"): Promise<T & { ok: boolean; error?: string }> {
  const jeton = process.env.POD_JETON;
  if (!jeton) throw new Error("POD_JETON manquant");
  const r = await fetch(`${process.env.SUPABASE_URL ?? URL_DEFAUT}/functions/v1/${fonction}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pod-jeton": jeton },
    body: JSON.stringify({ pod: POD, ...corps }),
  });
  const json = (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as T & { ok: boolean; error?: string };
  if (!r.ok && json.ok !== false) return { ...json, ok: false, error: `HTTP ${r.status}` };
  return json;
}

/** Repères de la veille (`npm run veille`) : un post qui vaut preuve dans la niche. */
export const PREUVE_VUES_MIN = 200_000;
export const PREUVE_JOURS_MAX = 30;
export const aujourdhui = () => new Date().toISOString().slice(0, 10);
export const jours = (debut: string, fin: string) =>
  Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000);
