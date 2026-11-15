// Constantes du pod 11 et appels à la fonction Edge `pods` de l'OS, avec le
// jeton du pod (POD_JETON). Le jeton ne s'écrit jamais dans un fichier : il
// vient de l'environnement.

export const POD = "remakes_fathom";
/** Le compte refait : Fathomly, l'appli concurrente de Sophia, et ses listes sur fond blanc. */
export const COMPTE_SOURCE = "fathom0g";
/** Les langues livrées : l'anglais d'abord (décision du 23/10), puis les grandes langues de Sophia. Déclarées à l'OS (0654) : l'attribution des comptes les lit, n'y mets que ce que tu sais vraiment faire. */
export const LANGUES = ["en", "fr", "es", "de", "it", "pt", "pt-BR", "es-419"] as const;
/** La langue du deck de base déposé (l'OS l'exige dans `decks`). */
export const LANGUE_SOURCE = "en";

const URL_DEFAUT = "https://mbikecieskoobeizixig.supabase.co";

export async function appelPod<T = Record<string, unknown>>(corps: Record<string, unknown>): Promise<T & { ok: boolean; error?: string }> {
  const jeton = process.env.POD_JETON;
  if (!jeton) throw new Error("POD_JETON manquant");
  const r = await fetch(`${process.env.SUPABASE_URL ?? URL_DEFAUT}/functions/v1/pods`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pod-jeton": jeton },
    body: JSON.stringify({ pod: POD, ...corps }),
  });
  const json = (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as T & { ok: boolean; error?: string };
  if (!r.ok && json.ok !== false) return { ...json, ok: false, error: `HTTP ${r.status}` };
  return json;
}

/**
 * Les langues du podz vues par l'OS (0654). Il déclare `LANGUES` (l'attribution
 * des comptes la lit) et l'OS rend celles à livrer : les langues où le label a
 * un compte actif. `null` sans jeton (essai) ou si l'OS ne répond pas : on
 * livre alors `LANGUES` comme avant.
 */
export async function languesDuLabel(): Promise<{ a_livrer: string[] | null; comptes: Record<string, number> } | null> {
  if (!process.env.POD_JETON) return null;
  try {
    const r = await appelPod<{ a_livrer?: string[] | null; comptes?: Record<string, number> }>({ action: "langues", langues: [...LANGUES] });
    if (!r.ok) throw new Error(r.error);
    return { a_livrer: r.a_livrer ?? null, comptes: r.comptes ?? {} };
  } catch (e) {
    console.warn(`langues de l'OS indisponibles (${e instanceof Error ? e.message : String(e)}) : toutes les langues de LANGUES`);
    return null;
  }
}

/** Repères de la veille (`npm run veille`) : un post qui vaut preuve dans la niche. */
export const PREUVE_VUES_MIN = 200_000;
export const PREUVE_JOURS_MAX = 30;
export const aujourdhui = () => new Date().toISOString().slice(0, 10);
export const jours = (debut: string, fin: string) =>
  Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000);
