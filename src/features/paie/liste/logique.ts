/**
 * La liste de paie du lundi : équipes, totaux, export. Rien ici ne touche la
 * base. Une ligne retirée par Lucia reste dans son équipe mais ne compte dans
 * aucun total.
 */
import { versCsv } from "@/lib/csv";

import type { ActionPaie, LigneListePaie } from "./api";

export interface TotauxPaie {
  /** Somme à payer (lignes non retirées). */
  total: number;
  /** Pas encore payé. */
  reste: number;
  lignes: number;
  payees: number;
}

export function totauxPaie(lignes: LigneListePaie[]): TotauxPaie {
  const actives = lignes.filter((l) => !l.exclu);
  const somme = (ls: LigneListePaie[]) => Math.round(ls.reduce((n, l) => n + l.montant, 0) * 100) / 100;
  return {
    total: somme(actives),
    reste: somme(actives.filter((l) => !l.paye_at)),
    lignes: actives.length,
    payees: actives.filter((l) => l.paye_at).length,
  };
}

export interface EquipePaie {
  /** L'équipe Upwork de la HM, ou son nom ; null : sans HM. */
  equipe: string | null;
  lignes: LigneListePaie[];
  totaux: TotauxPaie;
}

/** L'ordre dans une équipe : à payer d'abord (actions qui demandent quelque chose), puis payées, puis retirées. */
const RANG_ACTION: Record<ActionPaie, number> = { annuler: 0, kill: 1, modifier: 2, payer_moins: 3, payer: 4, rien: 5 };

export function trierLignes(lignes: LigneListePaie[]): LigneListePaie[] {
  const rang = (l: LigneListePaie) => (l.exclu ? 2 : l.paye_at ? 1 : 0);
  return [...lignes].sort(
    (a, b) =>
      rang(a) - rang(b) ||
      RANG_ACTION[a.action] - RANG_ACTION[b.action] ||
      (a.poster_nom ?? "").localeCompare(b.poster_nom ?? ""),
  );
}

export function parEquipe(lignes: LigneListePaie[]): EquipePaie[] {
  const groupes = new Map<string | null, LigneListePaie[]>();
  for (const l of lignes) groupes.set(l.equipe, [...(groupes.get(l.equipe) ?? []), l]);
  return [...groupes.entries()]
    .map(([equipe, ls]) => ({ equipe, lignes: trierLignes(ls), totaux: totauxPaie(ls) }))
    .sort((a, b) => (a.equipe === null ? 1 : b.equipe === null ? -1 : a.equipe.localeCompare(b.equipe)));
}

/** « p1 10/14 · p1b 8/14 » : les posts faits sur attendus, compte par compte. */
export function postsParCompte(l: LigneListePaie): string {
  return l.detail_comptes
    .filter((c) => !c.warmup)
    .map((c) => `${c.handle ? `@${c.handle} ` : ""}${c.faits}/${c.attendus}`)
    .join(" · ");
}

/** Le CSV de la liste (tout, ou une équipe). */
export function csvListe(lignes: LigneListePaie[], actionTexte: (l: LigneListePaie) => string): string {
  return versCsv(
    [
      "team", "creator", "upwork_contract_url", "accounts", "posts_done_per_account", "rate", "deduction",
      "amount_calculated", "amount", "amount_correction_reason", "action", "paid", "next_week_done", "removed",
      "removed_reason",
    ],
    trierLignes(lignes).map((l) => [
      l.equipe, l.poster_nom, l.contrat_url, l.nb_comptes, postsParCompte(l), l.tarif, l.retenue,
      l.montant_calcule, l.montant, l.raison_correction, actionTexte(l), Boolean(l.paye_at),
      Boolean(l.semaine_suivante_faite_at), l.exclu, l.exclu_raison,
    ]),
  );
}
