/**
 * 3/11 : le Kill depuis la page Problèmes, branché sur Upwork. Rien ici ne
 * touche la base ni le réseau : la décision et les textes.
 *
 * Fermer le contrat (endContractByClient, sans avis public) rend le milestone
 * financé et non payé : vérifié le 3/11 dans les transactions de VIk Studios
 * (« Credit for ended contract … » puis « Refund to Mastercard … »), et sur le
 * contrat de test 44801175 (Week 45 : « Closed (not funded) », payé 0 $).
 *
 * Jamais : une autre organisation que VIk Studios, un autre compte que celui
 * de Max, un contrat partagé avec un autre profil actif, ni un contrat dont
 * la semaine passée n'est pas encore payée (le kill attend la paie du lundi).
 */
import type { JalonUpwork } from "./paiement.ts";
import { ETATS_FINANCES } from "./upwork.ts";

export type DecisionKill = "fermer" | "deja_ferme" | "attendre" | "a_la_main";

export interface SemainePassee {
  semaine: string;
  /** Montant dû (corrigé s'il l'a été) ; null : pas de ligne de paie. */
  montant: number | null;
  /** Payée (à la main ou par l'API), exclue, ou rien à payer. */
  payee: boolean;
}

export interface EntreeKill {
  contrat_id: string | null;
  /** L'organisation du contrat est-elle VIk Studios ? */
  vik: boolean;
  /** Le compte Upwork connecté est-il celui de Max ? */
  compte_max: boolean;
  /** Un autre profil actif utilise ce contrat. */
  partage: boolean;
  /** Le statut lu chez Upwork (null : illisible). */
  statut: string | null;
  ferme: boolean;
  /** Les milestones lues chez Upwork (null : illisibles). */
  jalons: JalonUpwork[] | null;
  semaine_passee: SemainePassee | null;
}

export interface PlanKill {
  decision: DecisionKill;
  raison: string | null;
  /** Financé et pas payé : ce qui doit revenir à la fermeture. */
  montant: number;
  /** Le milestone en cours (financé, sinon le prochain à financer). */
  en_cours: { nom: string; depot: number | null; etat: string } | null;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Financé et pas payé, en dollars. */
export function financeNonPaye(jalons: readonly JalonUpwork[]): number {
  return arrondi(jalons.filter((j) => ETATS_FINANCES.includes(j.etat)).reduce((n, j) => n + Math.max(0, (j.depot ?? 0) - (j.paye ?? 0)), 0));
}

export function milestoneEnCours(jalons: readonly JalonUpwork[]): PlanKill["en_cours"] {
  const tri = [...jalons].sort((a, b) => a.sequence - b.sequence);
  const j = tri.find((x) => ETATS_FINANCES.includes(x.etat)) ?? tri.find((x) => x.etat === "NotFunded") ?? null;
  return j ? { nom: j.nom || j.id, depot: j.depot, etat: j.etat } : null;
}

export function planKill(e: EntreeKill): PlanKill {
  const jalons = e.jalons ?? [];
  const base = { montant: financeNonPaye(jalons), en_cours: milestoneEnCours(jalons) };
  const aLaMain = (raison: string): PlanKill => ({ ...base, decision: "a_la_main", raison });
  if (!e.contrat_id) return aLaMain("contrat Upwork non relié");
  if (!e.vik) return aLaMain("contrat hors VIk Studios : jamais touché par l'OS");
  if (!e.compte_max) return aLaMain("Upwork n'est pas connecté avec le compte de Maximilien Kender");
  if (e.partage) return aLaMain("contrat partagé avec un autre profil actif du posteur");
  if (e.statut === null || e.jalons === null) return aLaMain("contrat introuvable ou illisible chez Upwork");
  if (e.ferme) return { ...base, decision: "deja_ferme", raison: `déjà fermé chez Upwork (${e.statut})` };
  const s = e.semaine_passee;
  if (s && !s.payee && (s.montant ?? 0) > 0) {
    return { ...base, decision: "attendre", raison: `semaine du ${s.semaine} pas encore payée (${s.montant} $) : le kill attend la paie du lundi` };
  }
  return { ...base, decision: "fermer", raison: null };
}

const dollars = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} $`;

/** Ce qui s'est passé, écrit dans la carte. */
export function texteKill(o: { desactive: boolean; contrat: string | null; plan: PlanKill | null; ferme: boolean; rendu: number | null; erreur: string | null; case_cochee: boolean; test?: boolean }): string {
  const morceaux: string[] = [];
  if (o.desactive) morceaux.push("Compte désactivé");
  if (!o.case_cochee) {
    morceaux.push(`Contrat ${o.contrat ?? "?"} laissé ouvert (case décochée)`);
  } else if (o.test) {
    morceaux.push(`Mode test : contrat ${o.contrat ?? "?"} pas fermé (${dollars(o.plan?.montant ?? 0)} seraient revenus)`);
  } else if (o.ferme) {
    morceaux.push(`Contrat ${o.contrat} fermé`);
    morceaux.push(`${dollars(o.rendu ?? 0)} en retour`);
  } else if (o.plan?.decision === "deja_ferme") {
    morceaux.push(`Contrat ${o.contrat} déjà fermé`);
  } else if (o.plan?.decision === "attendre") {
    morceaux.push(`Contrat ${o.contrat} à fermer après la paie (${o.plan.raison})`);
  } else {
    morceaux.push(`Contrat à fermer à la main (erreur : ${o.erreur ?? o.plan?.raison ?? "inconnue"})`);
  }
  return morceaux.join(" · ");
}
