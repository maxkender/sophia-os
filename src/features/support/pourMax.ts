/**
 * 21/11 (Max) : « Pour Max » ne contient que ce qui a vraiment besoin de lui, avec une ligne qui dit ce qu'on attend :
 *  - les décisions qui lui appartiennent (argent hors règles, cas que les bots n'ont pas su régler, action
 *    automatique qui a échoué) ;
 *  - les incidents techniques ouverts depuis plus de 48 h.
 * Ce que l'OS règle seul (un STOP, une relance, une connexion, un warm-up, un post manquant, Slack, une offre de HM)
 * n'y remonte jamais.
 */

const H48 = 48 * 3_600_000;

/** Les catégories réglées par l'OS ou les bots : jamais « Pour Max ». */
export const CATEGORIES_AUTO: ReadonlySet<string> = new Set([
  "stop", "stop_doute", "relance_echec", "login", "tiktok_setup", "zero_post", "slack", "offre_hm_incorrecte",
]);

const LIGNE_PROBLEME: Readonly<Record<string, string>> = {
  paie: "Décide : une question d'argent hors des règles.",
  demande_2e_compte: "Décide : 2e compte, oui ou non.",
  deuxieme_contrat: "Décide : un 2e contrat ouvert sans doublement.",
  hors_plateforme: "Vérifie : un échange hors plateforme.",
  arret_echec: "L'arrêt automatique a échoué : termine-le à la main.",
  bug_dashboard: "Incident technique ouvert depuis plus de 48 h : à régler.",
};

const uneLigne = (t: string, max = 160) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

export interface ProblemePourMax {
  statut: string;
  niveau: string;
  categorie: string;
  created_at: string;
  question?: string | null;
}

/** La ligne « ce qu'on attend de Max » pour un problème, ou null s'il ne le concerne pas. */
export function attenduProbleme(p: ProblemePourMax, maintenant = Date.now()): string | null {
  if (p.statut !== "ouvert") return null;
  if (p.categorie === "arret_echec") return uneLigne(p.question || LIGNE_PROBLEME.arret_echec!);
  if (p.categorie === "bug_dashboard") {
    return maintenant - Date.parse(p.created_at) > H48 ? LIGNE_PROBLEME.bug_dashboard! : null;
  }
  if (p.niveau !== "urgent" || CATEGORIES_AUTO.has(p.categorie)) return null;
  return uneLigne(p.question || LIGNE_PROBLEME[p.categorie] || "Le bot n'a pas su régler : décide ou réponds.");
}

export interface DemandePourMax {
  statut: string;
  niveau: string | null;
  categorie: string | null;
  ticket_at: string | null;
  ticket_regle_at?: string | null;
  action_proposee?: string | null;
}

/** La ligne « ce qu'on attend de Max » pour une demande du support, ou null. */
export function attenduDemande(d: DemandePourMax, maintenant = Date.now()): string | null {
  if (d.statut === "resolu") return null;
  if (d.ticket_at && !d.ticket_regle_at && maintenant - Date.parse(d.ticket_at) > H48) {
    return "Incident technique ouvert depuis plus de 48 h : à régler avec Adrien.";
  }
  if (d.statut !== "ouvert" || d.niveau !== "max") return null;
  if (d.action_proposee?.trim()) return uneLigne(`À faire : ${d.action_proposee}`);
  return d.categorie === "paie" || d.categorie === "paiement"
    ? "Question d'argent : valide ou corrige la réponse proposée."
    : "Le bot n'a pas su : valide ou corrige la réponse proposée.";
}
