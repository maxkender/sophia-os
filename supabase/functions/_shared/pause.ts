/**
 * Prompt 22, partie 2 : le grand interrupteur « Deactivate automatic actions
 * with API » (réglage `automation_pause`, 0412). LE contrôle unique, appelé par
 * tout ce qui agit vers l'extérieur : écritures Upwork (upwork/ecrire),
 * messages Slack aux posteurs (slack_posteur), réponses du bot FAQ, et en tête
 * des tâches automatiques (recrues-check, accueil, arrêts, paie, ckd).
 * La lecture continue. Chaque action bloquée est notée (actions_bloquees,
 * motif « paused »), une fois par jour, action et posteur.
 */

/** L'erreur rendue par une action bloquée. */
export const PAUSE = "paused";

// deno-lint-ignore no-explicit-any
type Db = { rpc: (fn: string, args?: Record<string, unknown>) => any };

// Une lecture par client et par minute : une fonction qui envoie 50 messages ne relit pas 50 fois.
const cache = new WeakMap<object, { pause: boolean; at: number }>();

export async function automationEnPause(db: Db): Promise<boolean> {
  const vu = cache.get(db);
  if (vu && Date.now() - vu.at < 60_000) return vu.pause;
  const { data, error } = await db.rpc("automation_en_pause");
  // Lecture impossible : prudence, on bloque (rien ne part sans savoir).
  const pause = error ? true : data === true;
  cache.set(db, { pause, at: Date.now() });
  return pause;
}

export interface ActionBloquee {
  fonction: string;
  action: string;
  poster_id?: string | null;
  cible?: string | null;
  detail?: Record<string, unknown> | null;
}

export async function noterBloquee(db: Db, a: ActionBloquee): Promise<void> {
  try {
    await db.rpc("noter_action_bloquee", {
      p_fonction: a.fonction,
      p_action: a.action,
      p_poster: a.poster_id ?? null,
      p_cible: a.cible ?? null,
      p_detail: a.detail ?? null,
    });
  } catch {
    // Le journal ne doit jamais faire échouer la tâche.
  }
}

/** Bloquée par la pause ? Si oui, notée. */
export async function bloquer(db: Db, a: ActionBloquee): Promise<boolean> {
  if (!(await automationEnPause(db))) return false;
  await noterBloquee(db, a);
  return true;
}

/** Pour les tests : oublier la lecture en cache d'un client. */
export function oublierPause(db: object): void {
  cache.delete(db);
}
