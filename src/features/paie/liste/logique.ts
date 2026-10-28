/**
 * La liste de paie du lundi : équipes, totaux, export. Rien ici ne touche la
 * base. Une ligne retirée par Lucia reste dans son équipe mais ne compte dans
 * aucun total.
 */
import { semaineIso } from "@/features/moteur/cohortes";
import { ajouterJours } from "@/features/onboarding/datesRuul";
import { versCsv } from "@/lib/csv";

import type { ActionPaie, LigneListePaie } from "./api";

/** L'action montrée : « À vérifier » quand il y a des posts mais pas de tarif (jamais « Pay $0 »). */
export type ActionAffichee = ActionPaie | "a_verifier";

export function actionAffichee(l: LigneListePaie): ActionAffichee {
  return l.faits > 0 && l.tarif === null ? "a_verifier" : l.action;
}

/** Les raisons de la ligne, en codes à traduire (plus le texte français de la base). */
export type RaisonPaie = "warmup" | "zero_post" | "tarif_manquant";

export function raisonsLigne(l: LigneListePaie): RaisonPaie[] {
  const r: RaisonPaie[] = [];
  if (l.nb_comptes === 0) r.push("warmup");
  else if (l.faits === 0) r.push("zero_post");
  if (l.faits > 0 && l.tarif === null) r.push("tarif_manquant");
  return r;
}

const usd = (n: number) => `$${Math.round(n * 100) / 100}`;

/**
 * La consigne exacte de la ligne, en anglais comme sur Upwork, à partir de
 * l'action de la semaine payée et de la milestone de la semaine d'après
 * (0369) : « Approve Week 44: $14 · Fund Week 45: $14 ». `semaine` : le lundi
 * de la semaine payée. null : rien à écrire (« À vérifier »).
 */
export function consigne(l: LigneListePaie, semaine: string): string | null {
  const w = semaineIso(semaine);
  const n = semaineIso(ajouterJours(semaine, 7));
  const action = actionAffichee(l);
  if (action === "a_verifier") return null;
  // Warm-up : la 1re semaine de posts est la milestone financée par la HM à l'embauche.
  if (action === "rien" && l.nb_comptes === 0) return `Nothing to pay · Week ${n} funded at hiring`;
  if (action === "annuler") return `Don't approve Week ${w} · Ask for a refund · Don't fund`;
  // Arrêtée avant d'avoir posté (page Cohortes, 0392) : la milestone financée à l'embauche est à rembourser.
  if (action === "kill" && l.faits === 0) return `Nothing to pay · Ask for a refund · End the contract`;
  const approuver = action === "rien" ? "Nothing to pay" : `Approve Week ${w}: ${usd(l.montant)}`;
  if (action === "kill") return `${approuver} · Don't fund · End the contract`;
  const montant = l.suivante_montant === null ? "rate missing" : usd(l.suivante_montant);
  const suite = (() => {
    switch (l.suivante_action) {
      case "financer":
      case "financer_normal":
        return `Fund Week ${n}: ${montant}`;
      case "financer_double":
        return `Fund Week ${n} (${l.suivante_comptes ?? 2} acc): ${montant}`;
      case "ne_pas_financer":
        return "Don't fund";
      case "deja_financee":
        return `Week ${n} already funded`;
      case "a_voir":
        return `Week ${n}: check before funding`;
      default:
        return null;
    }
  })();
  return suite ? `${approuver} · ${suite}` : approuver;
}

/** La case « Payé » sert : il y a une milestone à approuver. */
export function besoinPaye(l: LigneListePaie): boolean {
  const a = actionAffichee(l);
  if (a === "kill") return l.faits > 0;
  return a === "payer" || a === "payer_moins" || a === "modifier";
}

/** La case « Semaine suivante faite » sert : il y a une milestone à financer. */
export function besoinSuivante(l: LigneListePaie): boolean {
  const a = actionAffichee(l);
  if (a === "kill" || a === "annuler" || a === "rien" || a === "a_verifier") return false;
  return l.suivante_action === "financer" || l.suivante_action === "financer_double" || l.suivante_action === "financer_normal";
}

/**
 * « À faire » : ni « Nothing to pay », ni retirée, ni terminée (toutes ses
 * cases utiles cochées).
 */
export function resteAFaire(l: LigneListePaie): boolean {
  if (l.exclu || actionAffichee(l) === "rien") return false;
  // Rien à cocher (À vérifier, remboursement) : reste à faire.
  if (!besoinPaye(l) && !besoinSuivante(l)) return true;
  return (besoinPaye(l) && !l.paye_at) || (besoinSuivante(l) && !l.semaine_suivante_faite_at);
}

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
  /** La HM (décision du 28/10 : groupée par HM) ; null : sans HM. */
  equipe: string | null;
  lignes: LigneListePaie[];
  totaux: TotauxPaie;
}

/** L'ordre dans une équipe : à payer d'abord (actions qui demandent quelque chose), puis payées, puis retirées. */
const RANG_ACTION: Record<ActionAffichee, number> = {
  a_verifier: 0,
  annuler: 1,
  kill: 2,
  modifier: 3,
  payer_moins: 4,
  payer: 5,
  rien: 6,
};

export function trierLignes(lignes: LigneListePaie[]): LigneListePaie[] {
  const rang = (l: LigneListePaie) => (l.exclu ? 2 : l.paye_at ? 1 : 0);
  return [...lignes].sort(
    (a, b) =>
      rang(a) - rang(b) ||
      RANG_ACTION[actionAffichee(a)] - RANG_ACTION[actionAffichee(b)] ||
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
export function csvListe(
  lignes: LigneListePaie[],
  actionTexte: (l: LigneListePaie) => string,
  semaine: string,
): string {
  return versCsv(
    [
      "team", "creator", "upwork_contract_url", "upwork_account", "accounts", "posts_done_per_account", "rate",
      "deduction", "first_week_bonus", "amount_calculated", "amount", "amount_correction_reason", "action",
      "instruction", "paid", "next_week_done", "removed", "removed_reason",
    ],
    trierLignes(lignes).map((l) => [
      l.equipe, l.poster_nom, l.contrat_url, l.upwork_compte, l.nb_comptes, postsParCompte(l), l.tarif, l.retenue,
      l.bonus, l.montant_calcule, l.montant, l.raison_correction, actionTexte(l), consigne(l, semaine),
      Boolean(l.paye_at), Boolean(l.semaine_suivante_faite_at), l.exclu, l.exclu_raison,
    ]),
  );
}

/**
 * La retenue d'un compte pour la semaine (0393, à partir de la semaine du
 * 2 nov.) : 1 post manqué toléré, puis la retenue par post. Même calcul que
 * `paie_calculer_v3` ; 0 post : rien (ni paie ni retenue).
 */
export function retenueCompte(
  attendus: number,
  faits: number,
  r: { manques_toleres: number; retenue_par_post: number },
): number {
  if (faits <= 0) return 0;
  return Math.max(0, attendus - faits - r.manques_toleres) * r.retenue_par_post;
}
