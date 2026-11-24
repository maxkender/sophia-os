/**
 * 0848 (24/11) : le journal du pont Hub ↔ OS (`hub_pont_appels`) et la règle
 * de l'alerte. Cette nuit-là, « zones » a renvoyé 500 de 01:17 à ~08:00 UTC
 * sans que personne ne le voie.
 *
 * Un appel est RÉUSSI quand le pont a répondu (code < 500) : un 4xx est un refus
 * métier (pays fermé, rejeu en cours…), le pont fonctionne. Un 5xx est un échec.
 *
 * Règle (par action) : le pont est EN PANNE quand son premier échec depuis le
 * dernier succès date de plus de 15 min. Autrement dit il échoue sans
 * interruption depuis plus de 15 min. La même règle est écrite en SQL
 * (`hub_pont_pannes`, 0848) : les deux doivent rester d'accord.
 */

export const SEUIL_PANNE_MIN = 15;
export const ERREUR_MAX = 300;
const ACTION_MAX = 40;

export interface AppelPont {
  action: string;
  ok: boolean;
  code: number;
  erreur: string | null;
  cree_at: string;
}

export interface PannePont {
  action: string;
  /** Premier échec depuis le dernier succès. */
  depuis: string;
  dernier_echec_at: string;
  derniere_erreur: string | null;
  echecs: number;
}

/** Le pont a-t-il répondu ? (un 4xx est un refus, pas une panne). */
export const appelReussi = (code: number): boolean => code < 500;

/** Le nom d'action noté au journal (jamais le corps) : court, et « ? » si absent. */
export function actionPourJournal(action: unknown): string {
  if (typeof action !== "string" || !action.trim()) return "?";
  return action.trim().slice(0, ACTION_MAX);
}

/** L'erreur notée au journal, tronquée à 300 caractères. */
export function erreurPourJournal(erreur: unknown): string | null {
  if (erreur === null || erreur === undefined) return null;
  const texte = (typeof erreur === "string" ? erreur : JSON.stringify(erreur) ?? "").trim();
  return texte ? texte.slice(0, ERREUR_MAX) : null;
}

/** Les actions en panne à `maintenant` : premier échec depuis le dernier succès il y a plus de `seuilMin`. */
export function pannesPont(appels: AppelPont[], maintenant = new Date(), seuilMin = SEUIL_PANNE_MIN): PannePont[] {
  const limite = maintenant.getTime() - seuilMin * 60_000;
  const parAction = new Map<string, AppelPont[]>();
  for (const a of appels) {
    const l = parAction.get(a.action) ?? [];
    l.push(a);
    parAction.set(a.action, l);
  }
  const pannes: PannePont[] = [];
  for (const [action, liste] of parAction) {
    const tries = [...liste].sort((x, y) => Date.parse(x.cree_at) - Date.parse(y.cree_at));
    let dernierOk = -Infinity;
    for (const a of tries) if (a.ok) dernierOk = Math.max(dernierOk, Date.parse(a.cree_at));
    const echecs = tries.filter((a) => !a.ok && Date.parse(a.cree_at) > dernierOk);
    if (!echecs.length) continue;
    const premier = echecs[0]!;
    const dernier = echecs[echecs.length - 1]!;
    if (Date.parse(premier.cree_at) > limite) continue;
    pannes.push({
      action,
      depuis: premier.cree_at,
      dernier_echec_at: dernier.cree_at,
      derniere_erreur: dernier.erreur ?? `HTTP ${dernier.code}`,
      echecs: echecs.length,
    });
  }
  return pannes.sort((x, y) => Date.parse(x.depuis) - Date.parse(y.depuis));
}
