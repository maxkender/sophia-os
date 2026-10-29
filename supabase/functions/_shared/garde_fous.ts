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
