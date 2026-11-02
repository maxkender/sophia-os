import type { Accueil } from "./api";

/** 0493 : Contracts to link : seulement les recrues VIk Studios, jamais une ligne classée ni une autre équipe. */
export function estARelier(a: Accueil): boolean {
  return a.statut === "a_relier" && !a.classement && (!a.equipe || a.equipe === "VIk Studios");
}
