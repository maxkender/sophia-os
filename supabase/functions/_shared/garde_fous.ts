/**
 * Messages automatiques : les garde-fous (0432). Rien ici ne touche la base
 * ni le réseau.
 *
 * - Pas de rattrapage : quand un interrupteur passe sur « on », un message qui
 *   était dû avant reste « en attente » ; il ne part qu'après « Send » (validé),
 *   et peu à peu (`cap` par passage). La liste du jeudi est toujours validée.
 * - Un seul message par personne : deux profils sur le même contrat ou le même
 *   Slack ne reçoivent qu'une fois le même message (même type, même période).
 */

export type DecisionRattrapage = "envoyer" | "attendre";

export function decisionRattrapage(o: {
  /** Quand le message est devenu dû. */
  du: Date | null;
  /** Depuis quand l'interrupteur est sur « on » (null : pas de rattrapage possible). */
  onDepuis: Date | null;
  /** La liste du jeudi : toujours validée avant l'envoi. */
  toujoursValider?: boolean;
  /** L'admin a cliqué « Send » pour ce message. */
  valide: boolean;
  /** Messages validés déjà partis à ce passage. */
  partisCeTour: number;
  cap: number;
}): DecisionRattrapage {
  const enAttente = o.toujoursValider === true || (o.onDepuis !== null && o.du !== null && o.du.getTime() < o.onDepuis.getTime());
  if (!enAttente) return "envoyer";
  if (!o.valide) return "attendre";
  return o.partisCeTour < o.cap ? "envoyer" : "attendre";
}

export type Canal = "slack" | "upwork";

/** La clé d'un envoi déjà fait : un canal (Slack ou contrat), un type, une période. */
export const cleServi = (type: string, periode: string, canal: Canal, id: string) => `${type}|${periode}|${canal}:${id}`;

/**
 * Les canaux où ce message peut encore partir : Slack (s'il est relié) et Upwork
 * (s'il y a un contrat), sauf si un autre profil sur le même Slack ou le même
 * contrat l'a déjà reçu.
 */
export function canauxRestants(
  p: { slack_user_id: string | null; contrat_id: string | null },
  type: string,
  periode: string,
  servis: ReadonlySet<string>,
): Canal[] {
  const c: Canal[] = [];
  if (p.slack_user_id && !servis.has(cleServi(type, periode, "slack", p.slack_user_id))) c.push("slack");
  if (p.contrat_id && !servis.has(cleServi(type, periode, "upwork", p.contrat_id))) c.push("upwork");
  return c;
}

/** Le plus bas nombre de posts avec lien parmi les comptes du posteur (null : aucun compte cette semaine). */
export function postsMinParCompte(comptes: readonly { posts_lien: number }[]): number | null {
  return comptes.length ? Math.min(...comptes.map((c) => c.posts_lien)) : null;
}

/** Prompt 25 : les clés d'une personne (son Slack et son contrat) pour un message. */
export function clesPersonne(p: { slack_user_id: string | null; contrat_id: string | null }, type: string, periode: string): string[] {
  return [
    ...(p.slack_user_id ? [cleServi(type, periode, "slack", p.slack_user_id)] : []),
    ...(p.contrat_id ? [cleServi(type, periode, "upwork", p.contrat_id)] : []),
  ];
}

/**
 * Prompt 25 : un seul canal, Slack d'abord, Upwork seulement si la personne
 * n'est pas sur Slack (jamais les deux). `doublon` : un autre profil sur le même
 * Slack ou le même contrat a déjà reçu (ou va recevoir) ce message.
 */
export function canalUnique(
  p: { slack_user_id: string | null; contrat_id: string | null },
  type: string,
  periode: string,
  servis: ReadonlySet<string>,
): { canal: Canal | null; doublon: boolean } {
  if (clesPersonne(p, type, periode).some((k) => servis.has(k))) return { canal: null, doublon: true };
  return { canal: p.slack_user_id ? "slack" : p.contrat_id ? "upwork" : null, doublon: false };
}

/**
 * Prompt 25 v4 : les canaux d'un message, le même texte sur Slack (s'il y est)
 * ET sur Upwork (s'il y a un contrat et que `upwork` le permet : plafond par
 * recrue, budget). `doublon` comme pour `canalUnique`.
 */
export function canauxMessage(
  p: { slack_user_id: string | null; contrat_id: string | null },
  type: string,
  periode: string,
  servis: ReadonlySet<string>,
  o: { slack?: boolean; upwork: boolean },
): { canaux: Canal[]; doublon: boolean } {
  if (clesPersonne(p, type, periode).some((k) => servis.has(k))) return { canaux: [], doublon: true };
  const canaux: Canal[] = [];
  if (o.slack !== false && p.slack_user_id) canaux.push("slack");
  if (o.upwork && p.contrat_id) canaux.push("upwork");
  return { canaux, doublon: false };
}

/**
 * Prompt 25 v4 : l'ordre d'Upwork. 0 la bienvenue, 1 les relances (et nudges)
 * de ceux qui ne sont pas sur Slack, 2 les autres relances et nudges, 3 le
 * message du lundi, 4 le lundi 20 h.
 */
export function prioriteUpwork(type: string, surSlack: boolean): number {
  if (type === "accueil") return 0;
  if (type === "relance" || type === "jeudi") return surSlack ? 2 : 1;
  if (type === "lundi") return 3;
  return 4;
}

/**
 * La file dans l'ordre : ce qui reste d'avant (Upwork plein hier) part
 * d'abord, puis par priorité, puis le plus ancien.
 */
export function trierFile<T extends { type: string; periode: string; premier_at: string; surSlack: boolean }>(lignes: readonly T[], aujourdhui: string): T[] {
  return [...lignes].sort((a, b) =>
    Number(a.periode >= aujourdhui) - Number(b.periode >= aujourdhui) ||
    prioriteUpwork(a.type, a.surSlack) - prioriteUpwork(b.type, b.surSlack) ||
    a.periode.localeCompare(b.periode) ||
    a.premier_at.localeCompare(b.premier_at)
  );
}

/**
 * Upwork pour ce message, dans le budget du jour ? Une conversation déjà écrite
 * aujourd'hui ne compte pas une 2e fois. La bienvenue peut prendre la réserve ;
 * une relance d'une recrue pas sur Slack prend ce qui reste ; les autres
 * (sur Slack, lundi, lundi 20 h) laissent la place à celles qui attendent.
 */
export function upworkAccorde(o: {
  priorite: number;
  deja: boolean;
  limite: boolean;
  /** Conversations encore possibles hors réserve. */
  restant: number;
  /** Conversations encore possibles, réserve comprise. */
  restantPrioritaire: number;
  /** Messages plus prioritaires (0 et 1) encore dans la file. */
  attentePrioritaire: number;
}): boolean {
  if (o.limite) return false;
  if (o.deja) return true;
  if (o.priorite === 0) return o.restantPrioritaire > 0;
  if (o.priorite === 1) return o.restant > 0;
  return o.restant - o.attentePrioritaire > 0;
}

/** L'erreur d'Upwork quand la limite du jour est atteinte. */
export const estLimiteUpwork = (erreur: string | null | undefined) => /maximum number of rooms/i.test(erreur ?? "");
