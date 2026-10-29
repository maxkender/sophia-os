import type { CasNeedsYou, Categorie, Urgence } from "./api";

/** Prompt 21, U5 : les filtres de « Needs you ». Vide = tous. */
export interface Filtres {
  cohorte: string;
  hm: string;
  pays: string;
  categorie: Categorie | "";
  urgence: Urgence | "";
  /** Ancienneté : moins de 24 h, moins de 3 jours, plus de 7 jours. */
  anciennete: "" | "24h" | "3j" | "7j";
  recherche: string;
}

export const FILTRES_VIDES: Filtres = { cohorte: "", hm: "", pays: "", categorie: "", urgence: "", anciennete: "", recherche: "" };

const HEURE = 3_600_000;

export function filtrer(cas: CasNeedsYou[], f: Filtres, maintenant = Date.now()): CasNeedsYou[] {
  const q = f.recherche.trim().toLowerCase();
  return cas.filter((c) => {
    if (f.cohorte && c.cohorte !== f.cohorte) return false;
    if (f.hm && c.hm !== f.hm) return false;
    if (f.pays && c.pays !== f.pays) return false;
    if (f.categorie && c.categorie !== f.categorie) return false;
    if (f.urgence && c.urgence !== f.urgence) return false;
    const age = maintenant - new Date(c.cree_at).getTime();
    if (f.anciennete === "24h" && age > 24 * HEURE) return false;
    if (f.anciennete === "3j" && age > 72 * HEURE) return false;
    if (f.anciennete === "7j" && age < 7 * 24 * HEURE) return false;
    if (q && !`${c.nom ?? ""} ${c.vu ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/** U5 : ce qui bloque lundi ou la paie d'abord, puis le plus ancien. */
export function trier(cas: CasNeedsYou[]): CasNeedsYou[] {
  return [...cas].sort((a, b) => a.rang - b.rang || new Date(a.cree_at).getTime() - new Date(b.cree_at).getTime());
}

/** Les valeurs proposées dans les filtres (triées, sans vide). */
export function options(cas: CasNeedsYou[]): { cohortes: string[]; hms: string[]; pays: string[] } {
  const u = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort();
  return { cohortes: u(cas.map((c) => c.cohorte)).reverse(), hms: u(cas.map((c) => c.hm)), pays: u(cas.map((c) => c.pays)) };
}

export function parCategorie(cas: CasNeedsYou[]): Record<Categorie, number> {
  const r: Record<Categorie, number> = { pas_pu_repondre: 0, bloque: 0, pas_sur: 0, a_la_main: 0 };
  for (const c of cas) r[c.categorie]++;
  return r;
}

/** Un lien interne de l'OS (ouvert dans l'onglet) ou externe (TikTok, Slack). */
export const estInterne = (lien: string) => lien.startsWith("/");
