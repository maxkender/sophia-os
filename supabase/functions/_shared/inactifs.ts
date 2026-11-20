/**
 * 20/11 (Max) : le kill automatique des inactifs, chaque samedi, sans validation (0797).
 *   A. jamais connecté : contrat signé depuis 14 jours ou plus, jamais connecté à l'OS ;
 *   B. connecté mais n'a jamais posté : démarrage prévu il y a 14 jours ou plus, des posts donnés, aucun publié ;
 *   alerte « bug d'assignation » : un compte sorti du warm-up sans aucun post prévu (pas arrêté, assignation relancée).
 * Pour chaque inactif, dans l'ordre : le message de fin (sa langue), Upwork (message puis fin du contrat, sans
 * paiement) ou Ruul (email + page de fin), l'OS (posteur et comptes désactivés), Slack (retiré), ses tickets fermés.
 * Une étape en échec est refaite le lendemain ; Max n'est prévenu qu'au 2e échec.
 * Ici : les textes, l'état des étapes et la ligne du rapport (rien ne touche la base ni le réseau).
 */

/** Le message de fin d'un inactif (anglais, traduit ensuite) : rien sur la paie, aucune raison. */
export const TEXTE_FIN_INACTIF = "Hi {prenom}, we're ending our collaboration today. Thank you for your understanding.";

/** L'objet de l'email de fin (Ruul). */
export const OBJET_FIN_INACTIF = "Your collaboration with Vik Studios";

/** Le texte (déjà traduit, avec {prenom}) pour ce posteur. */
export function texteFinInactif(modele: string, prenom: string | null | undefined): string {
  const p = String(prenom ?? "").trim().split(/\s+/)[0] ?? "";
  if (p) return modele.replaceAll("{prenom}", p);
  // Sans prénom : « Hi, … » (jamais un « {prenom} » laissé au posteur).
  return modele.replace(/\s*\{prenom\}\s*,?/g, ",");
}

export type ActionInactif = "message" | "upwork" | "ruul" | "os" | "slack" | "tickets";
export type StatutEtape = "fait" | "erreur" | "sans_objet" | "a_la_main";

export interface EtapeInactif {
  action: ActionInactif;
  statut: StatutEtape;
  detail: string | null;
  at: string;
}

/** L'ordre demandé par Max. */
export const ORDRE_ETAPES: ActionInactif[] = ["message", "upwork", "ruul", "os", "slack", "tickets"];

/** La dernière issue de chaque étape. */
export function derniereEtape(etapes: readonly EtapeInactif[], action: ActionInactif): EtapeInactif | null {
  for (let i = etapes.length - 1; i >= 0; i--) if (etapes[i]!.action === action) return etapes[i]!;
  return null;
}

/** L'étape est-elle encore à faire (jamais tentée, ou en échec) ? */
export function aFaire(etapes: readonly EtapeInactif[], action: ActionInactif): boolean {
  const e = derniereEtape(etapes, action);
  return !e || e.statut === "erreur";
}

/** Les étapes en échec (dernière issue). */
export function etapesEnEchec(etapes: readonly EtapeInactif[]): EtapeInactif[] {
  return ORDRE_ETAPES.map((a) => derniereEtape(etapes, a)).filter((e): e is EtapeInactif => e?.statut === "erreur");
}

/** Le statut de la ligne : fait (plus rien à refaire) ou erreur. */
export function statutInactif(etapes: readonly EtapeInactif[]): "fait" | "erreur" {
  return ORDRE_ETAPES.every((a) => !aFaire(etapes, a)) ? "fait" : "erreur";
}

/** Max n'est prévenu qu'au 2e échec (le passage du samedi, puis la reprise du dimanche). */
export function prevenirMax(tentatives: number, etapes: readonly EtapeInactif[]): boolean {
  return tentatives >= 2 && etapesEnEchec(etapes).length > 0;
}

export interface RapportInactifs {
  arretes: number;
  jamais_connectes: number;
  jamais_postes: number;
  en_cours: number;
  alertes: number;
}

/** « Inactifs arrêtés automatiquement : 12 (8 jamais connectés, 4 jamais postés) · 2 alertes bug d'assignation ». */
export function ligneRapportInactifs(r: RapportInactifs): string {
  const s = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
  let l = `Inactifs arrêtés automatiquement : ${r.arretes} (${s(r.jamais_connectes, "jamais connecté")}, ${s(r.jamais_postes, "jamais posté")})`;
  if (r.en_cours > 0) l += ` · ${r.en_cours} en cours (reprise demain)`;
  l += ` · ${s(r.alertes, "alerte")} bug d'assignation`;
  return l;
}
