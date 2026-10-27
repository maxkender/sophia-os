/**
 * Le calendrier « Cette semaine » : une case par jour et par compte. Rien ici
 * ne touche la base.
 */
import { ajouterJours } from "@/features/onboarding/datesRuul";

import type { LigneCalendrier, PostCalendrier } from "./api";

/**
 * L'état d'une case :
 *   - ok : tous les posts prévus du jour sont publiés (vert) ;
 *   - partiel : une partie seulement, jour passé (orange) ;
 *   - rate : aucun, jour passé (rouge) ;
 *   - en_cours : aujourd'hui, pas encore tout publié (gris, encadré) ;
 *   - a_venir : jour à venir (gris) ;
 *   - vide : aucun post prévu ce jour-là.
 */
export type EtatCase = "ok" | "partiel" | "rate" | "en_cours" | "a_venir" | "vide";

export interface CaseJour {
  jour: string;
  etat: EtatCase;
  publies: number;
  prevus: number;
  posts: PostCalendrier[];
  aujourdhui: boolean;
}

/** Les 7 jours de la semaine, du lundi au dimanche. */
export function joursSemaine(lundi: string): string[] {
  return Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));
}

export function caseDuJour(posts: PostCalendrier[], jour: string, aujourdhui: string): CaseJour {
  const duJour = posts.filter((p) => p.jour === jour).sort((a, b) => a.rang - b.rang);
  const prevus = duJour.length;
  const publies = duJour.filter((p) => p.url).length;
  const base = { jour, publies, prevus, posts: duJour, aujourdhui: jour === aujourdhui };
  if (prevus === 0) return { ...base, etat: "vide" };
  if (publies >= prevus) return { ...base, etat: "ok" };
  if (jour > aujourdhui) return { ...base, etat: "a_venir" };
  if (jour === aujourdhui) return { ...base, etat: "en_cours" };
  return { ...base, etat: publies === 0 ? "rate" : "partiel" };
}

export function casesSemaine(l: LigneCalendrier, lundi: string, aujourdhui: string): CaseJour[] {
  return joursSemaine(lundi).map((j) => caseDuJour(l.posts, j, aujourdhui));
}

/** Un problème : un jour passé raté ou incomplet, ou un diagnostic qui n'est pas OK. */
export function aUnProbleme(l: LigneCalendrier, lundi: string, aujourdhui: string): boolean {
  return (
    l.diagnostic.badge !== "ok" ||
    casesSemaine(l, lundi, aujourdhui).some((c) => c.etat === "rate" || c.etat === "partiel")
  );
}

/** Les semaines au choix : celle-ci, puis la précédente. */
export function semainesChoix(lundiCourant: string): string[] {
  return [lundiCourant, ajouterJours(lundiCourant, -7)];
}

export interface Filtres {
  problemesSeulement: boolean;
  /** "" : tous les pays. */
  pays: string;
  /** "" : toutes les HMs (admin et Head of Ops). */
  hm: string;
}

export function filtrerLignes(
  lignes: LigneCalendrier[],
  f: Filtres,
  lundi: string,
  aujourdhui: string,
): LigneCalendrier[] {
  return lignes.filter(
    (l) =>
      (!f.pays || l.pays === f.pays) &&
      (!f.hm || l.hm_id === f.hm) &&
      (!f.problemesSeulement || aUnProbleme(l, lundi, aujourdhui)),
  );
}

/** Les pays présents, triés. */
export function paysPresents(lignes: LigneCalendrier[]): string[] {
  return [...new Set(lignes.map((l) => l.pays).filter((p): p is string => Boolean(p)))].sort();
}

/** Le compte a déjà publié au moins un post (le report de cohorte est alors refusé). */
export function aPublieCalendrier(l: LigneCalendrier): boolean {
  return l.posts.some((p) => p.url);
}
