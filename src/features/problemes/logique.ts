import type { Niveau, Probleme, Proprietaire } from "./api";

export const NIVEAUX: readonly Niveau[] = ["urgent", "aujourdhui", "samedi"];
export const PROPRIETAIRES: readonly Proprietaire[] = ["new_cohort_bot", "control_bot", "pay_bot"];

/** C10 : l'argent n'est jamais exécuté par un bouton, ni validé en lot. */
export const CATEGORIES_ARGENT: readonly string[] = ["paie"];

/** C12 : jamais d'envoi auto pour ces catégories. */
export const JAMAIS_AUTO: readonly string[] = ["stop", "paie", "menace", "hors_plateforme", "suspect", "contrat_hm", "offre_hm_incorrecte"];

/** La dernière ligne de toute réponse sur Upwork (comme les relances). */
export const LIGNE_STOP_UPWORK = "If you don't wish to continue, just reply STOP here.";

export function avecLigneStop(texte: string): string {
  const t = texte.trimEnd();
  return t.endsWith(LIGNE_STOP_UPWORK) ? t : `${t}\n\n${LIGNE_STOP_UPWORK}`;
}

export interface FiltresProblemes {
  proprietaire: string;
  categorie: string;
  hm: string;
}

export const FILTRES_VIDES: FiltresProblemes = { proprietaire: "", categorie: "", hm: "" };

export function filtrer(liste: readonly Probleme[], f: FiltresProblemes): Probleme[] {
  return liste.filter(
    (p) =>
      (!f.proprietaire || p.proprietaire === f.proprietaire) &&
      (!f.categorie || p.categorie === f.categorie) &&
      (!f.hm || (p.hm ?? "—") === f.hm),
  );
}

export function compterParNiveau(liste: readonly Probleme[]): Record<Niveau, number> {
  const n: Record<Niveau, number> = { urgent: 0, aujourdhui: 0, samedi: 0 };
  for (const p of liste) n[p.niveau]++;
  return n;
}

/** Les options des filtres (triées, sans doublon). */
export function options(liste: readonly Probleme[]): { categories: string[]; hms: string[] } {
  return {
    categories: [...new Set(liste.map((p) => p.categorie))].sort(),
    hms: [...new Set(liste.map((p) => p.hm ?? "—"))].sort(),
  };
}

export type GesteValider =
  | { type: "page"; vers: string }
  | { type: "releve"; compte_id: string }
  | { type: "reponse" }
  | { type: "fermer" };

/**
 * Ce que fait « Valider » (C10). L'argent ouvre Payroll ou Who to fund ;
 * recréer, kill, lien de mot de passe et Slack ouvrent la fiche du posteur
 * (formulaires existants) ; relire TikTok relit le compte ; le reste ferme le
 * problème, avec la réponse quand il y en a une.
 */
export function gesteValider(p: Pick<Probleme, "categorie" | "proposition_action" | "proposition_reponse" | "poster_id" | "compte_id">): GesteValider {
  const fiche = p.poster_id ? `/admin/posters?poster=${p.poster_id}` : "/admin/posters";
  if (CATEGORIES_ARGENT.includes(p.categorie) || p.proposition_action === "open_payroll") return { type: "page", vers: "/admin/auto/payroll" };
  if (p.proposition_action === "open_who_to_fund") return { type: "page", vers: "/admin/auto/payroll?onglet=financer" };
  if (["recreate", "kill", "resend_password_link", "relink_slack"].includes(p.proposition_action ?? "")) return { type: "page", vers: fiche };
  if (p.proposition_action === "reread_tiktok" && p.compte_id) return { type: "releve", compte_id: p.compte_id };
  if (p.proposition_reponse?.trim()) return { type: "reponse" };
  return { type: "fermer" };
}

/** « Valider toute la catégorie » : jamais pour l'argent. */
export function peutValiderCategorie(categorie: string): boolean {
  return !CATEGORIES_ARGENT.includes(categorie);
}

/** Le début du jour à Paris (ISO), pour « une réponse par conversation et par jour ». */
export function debutJourParis(maintenant = new Date()): string {
  const jour = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(maintenant);
  const decalage = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "shortOffset" })
    .formatToParts(maintenant)
    .find((x) => x.type === "timeZoneName")?.value.replace("GMT", "") || "+0";
  const [h, m] = decalage.split(":");
  const signe = h!.startsWith("-") ? "-" : "+";
  const hh = String(Math.abs(Number(h))).padStart(2, "0");
  return new Date(`${jour}T00:00:00${signe}${hh}:${(m ?? "00").padStart(2, "0")}`).toISOString();
}
