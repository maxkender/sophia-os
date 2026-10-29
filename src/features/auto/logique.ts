import type { LigneJournal, Semaine } from "./api";

/**
 * Prompt 22, partie 3 : « This week », la semaine en une ligne. Lundi (paie
 * et messages), jeudi (nudge), samedi (décisions), dimanche (Kill) ; chaque
 * jour est à venir, fait, ou a encore quelque chose à finir.
 */
export type JourSemaine = "lundi" | "jeudi" | "samedi" | "dimanche";
export type EtatJour = "a_venir" | "fait" | "a_finir";

export interface Jour {
  jour: JourSemaine;
  date: string;
  etat: EtatJour;
  /** Ce qui est fait, et sur combien (pour la phrase). */
  fait: number;
  total: number;
}

export function ajouterJours(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function joursSemaine(s: Semaine): Jour[] {
  const quand = (n: number) => ajouterJours(s.lundi, n);
  const passe = (date: string) => s.aujourdhui >= date;
  const etat = (date: string, fini: boolean): EtatJour => (!passe(date) ? "a_venir" : fini ? "fait" : "a_finir");
  const paieFinie = s.paie?.statut === "fini" || (s.paie_lignes > 0 && s.paie_payees >= s.paie_lignes);
  return [
    { jour: "lundi", date: quand(0), etat: etat(quand(0), paieFinie), fait: s.paie_payees, total: s.paie_lignes },
    { jour: "jeudi", date: quand(3), etat: etat(quand(3), Boolean(s.jeudi_lance_at)), fait: s.jeudi_nudges, total: s.jeudi_nudges },
    {
      jour: "samedi",
      date: quand(5),
      etat: etat(quand(5), Boolean(s.samedi_lance_at) && s.samedi_decides >= s.samedi_total),
      fait: s.samedi_decides,
      total: s.samedi_total,
    },
    {
      jour: "dimanche",
      date: quand(6),
      etat: etat(quand(6), s.kills_envoyes >= s.kills_a_envoyer),
      fait: s.kills_envoyes,
      total: s.kills_a_envoyer,
    },
  ];
}

/** Partie 10 : l'export CSV des Logs (séparateur « , », guillemets doublés). */
export const COLONNES_CSV = ["at", "source", "action", "auteur", "poster_nom", "canal", "resultat", "detail"] as const;

export function versCsv(lignes: readonly LigneJournal[]): string {
  const cellule = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [COLONNES_CSV.join(","), ...lignes.map((l) => COLONNES_CSV.map((c) => cellule(l[c])).join(","))].join("\n");
}

/** Le filtre par action (lien depuis Today) : une action exacte, ou plusieurs séparées par des virgules. */
export function filtrerActions(lignes: readonly LigneJournal[], actions: string): LigneJournal[] {
  const liste = actions.split(",").map((a) => a.trim()).filter(Boolean);
  return liste.length === 0 ? [...lignes] : lignes.filter((l) => liste.includes(l.action));
}

/** Le jour à Paris (AAAA-MM-JJ). */
export function jourParis(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Partie 4 (Recruits) : le lundi de cohorte affiché par défaut, le prochain
 * (s'il a des cartes) ; sinon toutes les cohortes (« »).
 */
export function cohorteParDefautRecruits(lundis: readonly string[], aujourdhui: string): string {
  return [...new Set(lundis)].filter((l) => l > aujourdhui).sort()[0] ?? "";
}
