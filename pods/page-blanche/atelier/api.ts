// Constantes du podz 1 (page blanche) et appels à la fonction Edge `pods` de
// l'OS, avec le jeton du podz (POD_JETON). Le jeton ne s'écrit jamais dans un
// fichier : il vient de l'environnement.

export const POD = "page_blanche";
/**
 * Les langues que le podz sait livrer (polices et captures de l'atelier,
 * traductions écrites par l'agent). Déclarées à l'OS (0654) : l'attribution des
 * comptes les lit, n'y mets que ce que tu sais vraiment faire. « es » sert
 * aussi les comptes « es-419 ».
 */
export const LANGUES = ["fr", "en", "es", "de", "it", "tr", "hu"] as const;

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
 * livre alors les langues demandées comme avant.
 */
export async function languesDuLabel(): Promise<{ a_livrer: string[] | null; comptes: Record<string, number> } | null> {
  if (!process.env.POD_JETON) return null;
  try {
    const r = await appelPod<{ a_livrer?: string[] | null; comptes?: Record<string, number> }>({ action: "langues", langues: [...LANGUES] });
    if (!r.ok) throw new Error(r.error);
    return { a_livrer: r.a_livrer ?? null, comptes: r.comptes ?? {} };
  } catch (e) {
    console.warn(`langues de l'OS indisponibles (${e instanceof Error ? e.message : String(e)}) : langues demandées gardées`);
    return null;
  }
}
