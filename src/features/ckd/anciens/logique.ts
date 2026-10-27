/**
 * « Anciens posteurs » : les problèmes de chaque compte, du plus grave au
 * moins grave. Les jours sont ceux du calendrier « Cette semaine » (rouge :
 * rien publié, orange : incomplet). Rien ici ne touche la base.
 */
import { ajouterJours } from "@/features/onboarding/datesRuul";

import { caseDuJour, type CaseJour } from "../calendrier/logique";
import type { LigneAncien } from "./api";

/** Du plus grave au moins grave : un compte est rangé sous le premier. */
export const PROBLEMES = ["shadowban", "vues_basses", "irregulier", "liens_manquants", "baisse"] as const;
export type Probleme = (typeof PROBLEMES)[number];

/** Jours rouges (rien publié) sur 7 jours à partir desquels un posteur est irrégulier. */
export const JOURS_RATES_IRREGULIER = 2;

/** Les 14 derniers jours, aujourd'hui compris, du plus ancien au plus récent. */
export function joursHistorique(aujourdhui: string): string[] {
  return Array.from({ length: 14 }, (_, i) => ajouterJours(aujourdhui, i - 13));
}

export function historique(l: LigneAncien, aujourdhui: string): CaseJour[] {
  return joursHistorique(aujourdhui).map((j) => caseDuJour(l.posts, j, aujourdhui));
}

function publiesEntre(l: LigneAncien, de: string, a: string): number {
  return l.posts.filter((p) => p.jour >= de && p.jour <= a && p.url).length;
}

export interface FaitsAncien {
  /** Jours rouges sur les 7 derniers jours (hier compris). */
  joursRates: number;
  /** Jours orange (des posts sans lien un jour où il a publié). */
  joursIncomplets: number;
  publies7: number;
  publiesAvant: number;
}

export function faitsAncien(l: LigneAncien, aujourdhui: string): FaitsAncien {
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(aujourdhui, i - 7));
  const cases = jours.map((j) => caseDuJour(l.posts, j, aujourdhui));
  return {
    joursRates: cases.filter((c) => c.etat === "rate").length,
    joursIncomplets: cases.filter((c) => c.etat === "partiel").length,
    publies7: publiesEntre(l, ajouterJours(aujourdhui, -7), ajouterJours(aujourdhui, -1)),
    publiesAvant: publiesEntre(l, ajouterJours(aujourdhui, -14), ajouterJours(aujourdhui, -8)),
  };
}

/**
 * Les problèmes d'un compte, du plus grave au moins grave :
 *   - shadowban probable : signalé, ou ses 4 derniers posts mesurés sous le seuil mort ;
 *   - vues basses : médiane des 7 jours sous 20 % de celle du pays ;
 *   - irrégulier : 2 jours ou plus sans aucun post publié sur 7 jours ;
 *   - liens manquants : des posts sans lien un jour où il a publié ;
 *   - baisse : moins de posts publiés que les 7 jours d'avant.
 */
export function problemesAncien(l: LigneAncien, aujourdhui: string): Probleme[] {
  const f = faitsAncien(l, aujourdhui);
  const d = l.diagnostic;
  const vuesBasses =
    d.vues_basses ?? (d.mediane !== null && d.mediane_ref !== null && d.mediane_ref > 0 && d.mediane < 0.2 * d.mediane_ref);
  const oui: Record<Probleme, boolean> = {
    shadowban: d.shadowban,
    vues_basses: Boolean(vuesBasses),
    irregulier: f.joursRates >= JOURS_RATES_IRREGULIER,
    liens_manquants: f.joursIncomplets > 0,
    baisse: f.publies7 < f.publiesAvant,
  };
  return PROBLEMES.filter((p) => oui[p]);
}

export interface GroupeAnciens {
  /** null : les comptes sans problème (« Tout afficher »). */
  probleme: Probleme | null;
  lignes: { ligne: LigneAncien; problemes: Probleme[] }[];
}

/** Les comptes rangés sous leur problème le plus grave, dans l'ordre de gravité. */
export function grouperAnciens(
  lignes: LigneAncien[],
  aujourdhui: string,
  toutAfficher: boolean,
  nom: (l: LigneAncien) => string = (l) => l.handle ?? "",
): GroupeAnciens[] {
  const avec = lignes
    .map((ligne) => ({ ligne, problemes: problemesAncien(ligne, aujourdhui) }))
    .sort((a, b) => nom(a.ligne).localeCompare(nom(b.ligne)));
  const groupes: GroupeAnciens[] = PROBLEMES.map((p) => ({
    probleme: p,
    lignes: avec.filter((x) => x.problemes[0] === p),
  })).filter((g) => g.lignes.length > 0);
  if (toutAfficher) {
    const ok = avec.filter((x) => x.problemes.length === 0);
    if (ok.length > 0) groupes.push({ probleme: null, lignes: ok });
  }
  return groupes;
}
