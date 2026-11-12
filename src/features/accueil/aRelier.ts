import type { Accueil } from "./api";

/** 0493 : Contracts to link : seulement les recrues VIk Studios, jamais une ligne classée ni une autre équipe. */
export function estARelier(a: Accueil): boolean {
  return a.statut === "a_relier" && !a.classement && (!a.equipe || a.equipe === "VIk Studios");
}

/** 12/11 (Max) : la raison posée par l'OS pour un pays fermé (supabase/functions/_shared/accueil.ts). */
export const RAISON_PAYS_FERME = "pays fermé";

/** 12/11 : la langue principale d'un pays (jumeau de LANGUE_DU_PAYS côté serveur). */
export const LANGUE_DU_PAYS: Readonly<Record<string, string>> = {
  FR: "fr", BE: "fr", DE: "de", AT: "de", CH: "de", IT: "it", ES: "es", PT: "pt", BR: "pt-BR", CZ: "cs", NL: "nl", GR: "el",
  HU: "hu", PL: "pl", RO: "ro", SE: "sv", TR: "tr", DK: "da", NO: "no", HR: "hr", SI: "sl", SK: "sk", RS: "sr", IL: "he",
  FI: "fi", EE: "et", BG: "bg", LT: "lt", LV: "lv", JP: "ja", KR: "ko",
};

/** 12/11 : la question à poser pour un contrat à relier. */
export function questionARelier(a: Pick<Accueil, "raison" | "pays">): "ferme" | "pays" {
  return a.raison?.startsWith(RAISON_PAYS_FERME) && a.pays ? "ferme" : "pays";
}
