import type { TypeCompte } from "./types";

export type { TypeCompte };

export function normaliserTypeCompte(valeur: unknown): TypeCompte {
  return valeur === "cm" ? "cm" : "perso";
}

/**
 * Premier compte à la création d'un login.
 * Un poster n'implique pas un perso : CM si demandé + langue, sinon aucun
 * (login seul). Perso seulement si langue et type ≠ cm / aucun.
 */
export function resoudrePremierCompte(
  type: string | undefined | null,
  langue?: string | null,
): TypeCompte | "aucun" {
  const t = String(type ?? "").trim().toLowerCase();
  if (t === "aucun" || t === "none") return "aucun";
  if (!String(langue ?? "").trim()) return "aucun";
  if (t === "cm") return "cm";
  return "perso";
}

export function estCompteCm(compte: { type_compte?: string | null }): boolean {
  return normaliserTypeCompte(compte.type_compte) === "cm";
}

/** Compte perso (warmup / slideshow / UGC) — le premier s'il y en a plusieurs. */
export function comptePerso<T extends { type_compte?: string | null }>(
  comptes: T[],
): T | undefined {
  return comptes.find((c) => !estCompteCm(c));
}

export function comptesCm<T extends { type_compte?: string | null }>(comptes: T[]): T[] {
  return comptes.filter(estCompteCm);
}

/** Compte affiché par défaut : perso s'il existe, sinon le premier. */
export function comptePrincipal<T extends { type_compte?: string | null }>(
  comptes: T[],
): T | undefined {
  return comptePerso(comptes) ?? comptes[0];
}

export function languesCmPrises(
  comptes: Array<{ type_compte?: string | null; langue: string }>,
): string[] {
  return [...new Set(comptesCm(comptes).map((c) => c.langue).filter(Boolean))];
}

export function languesDisponiblesPourCm(
  proposees: string[],
  prises: string[],
): string[] {
  const occupees = new Set(prises);
  return proposees.filter((l) => !occupees.has(l));
}

/** Langues proposées à l'ajout d'un compte : CM = 1 max par langue, perso = toutes. */
export function languesPourNouveauCompte(
  type: TypeCompte,
  proposees: string[],
  prisesCm: string[],
): string[] {
  return type === "cm" ? languesDisponiblesPourCm(proposees, prisesCm) : proposees;
}

/**
 * Créateurs vers lesquels un HM peut rattacher un compte existant.
 * On ne recrée rien : le compte (2e, 3e, …) reste le même, seul le login change.
 * CM : 1 actif par langue — on écarte les dest qui en ont déjà un.
 */
export function destinationsDeplacementCompte<
  T extends {
    id: string;
    role?: string | null;
    comptes?: Array<{ type_compte?: string | null; langue: string }>;
  },
>(
  compte: { type_compte?: string | null; langue: string },
  sourcePosterId: string,
  posters: T[],
): T[] {
  return posters.filter((p) => {
    if (p.id === sourcePosterId) return false;
    if ((p.role ?? "poster") !== "poster") return false;
    if (!estCompteCm(compte)) return true;
    return !(p.comptes ?? []).some((c) => estCompteCm(c) && c.langue === compte.langue);
  });
}

export function cleCompteActif(userId: string): string {
  return `compte-actif-${userId}`;
}

export function lireCompteActif(userId: string, comptes: Array<{ id: string }>): string | null {
  if (comptes.length === 0) return null;
  try {
    const sauve = localStorage.getItem(cleCompteActif(userId));
    if (sauve && comptes.some((c) => c.id === sauve)) return sauve;
  } catch {
    /* private mode */
  }
  return null;
}

export function ecrireCompteActif(userId: string, compteId: string): void {
  try {
    localStorage.setItem(cleCompteActif(userId), compteId);
  } catch {
    /* private mode */
  }
}
