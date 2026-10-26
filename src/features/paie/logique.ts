/**
 * Paie du lundi (0362) : ce qui se calcule sans la base.
 */
import { semaineIso } from "@/features/moteur/cohortes";
import { lundiDe } from "@/features/moteur/semaines";
import { ajouterJours } from "@/features/onboarding/datesRuul";

import type { LignePaie } from "./api";

/** La semaine à payer : celle qui vient de finir (le lundi, celle d'avant). */
export function semaineAPayer(aujourdhui: string): string {
  return ajouterJours(lundiDe(aujourdhui), -7);
}

/** « Week 44 », ou « Week 44 (2 acc) » quand 2 comptes sont payés. */
export function milestone(semaine: string, comptesPayes: number): string {
  const base = `Week ${semaineIso(semaine)}`;
  return comptesPayes >= 2 ? `${base} (${comptesPayes} acc)` : base;
}

export function nomPosteur(l: LignePaie): string {
  const p = l.poster;
  if (!p) return "—";
  return [p.prenom, p.nom].filter(Boolean).join(" ") || p.email || "—";
}

export interface Totaux {
  /** Somme des montants de la semaine. */
  total: number;
  /** Ce qui reste à payer (lignes non payées). */
  resteAPayer: number;
  /** Lignes non payées avec un montant. */
  aPayer: number;
  payees: number;
}

export function totaux(lignes: LignePaie[]): Totaux {
  let total = 0;
  let resteAPayer = 0;
  let aPayer = 0;
  let payees = 0;
  for (const l of lignes) {
    total += l.montant;
    if (l.paye_at) payees += 1;
    else if (l.montant > 0) {
      resteAPayer += l.montant;
      aPayer += 1;
    }
  }
  return { total, resteAPayer, aPayer, payees };
}

/** Les lignes par HM, les HMs avec le plus à payer d'abord, sans HM en dernier. */
export function parHm(lignes: LignePaie[]): { hmId: string | null; lignes: LignePaie[]; totaux: Totaux }[] {
  const groupes = new Map<string | null, LignePaie[]>();
  for (const l of lignes) {
    const hm = l.poster?.manager_id ?? null;
    groupes.set(hm, [...(groupes.get(hm) ?? []), l]);
  }
  return [...groupes.entries()]
    .map(([hmId, ls]) => ({ hmId, lignes: trier(ls), totaux: totaux(ls) }))
    .sort((a, b) => {
      if (a.hmId === null) return 1;
      if (b.hmId === null) return -1;
      return b.totaux.total - a.totaux.total;
    });
}

/** À voir d'abord, puis à payer, puis payées ; par nom. */
export function trier(lignes: LignePaie[]): LignePaie[] {
  const rang = (l: LignePaie) => (l.paye_at ? 2 : l.statut === "a_voir" ? 0 : 1);
  return [...lignes].sort((a, b) => rang(a) - rang(b) || nomPosteur(a).localeCompare(nomPosteur(b)));
}

/** Format dollars : 14 → « 14 $ », 12.5 → « 12,5 $ » selon la langue. */
export function dollars(n: number, langue: string): string {
  return `${new Intl.NumberFormat(langue, { maximumFractionDigits: 2 }).format(n)} $`;
}
