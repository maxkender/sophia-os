/**
 * 18/11 (Max) : la page « Paie Ruul ». Une lecture (0752 ruul_paie_page) et la logique d'affichage, testée à part.
 */
import { supabase } from "@/lib/supabase/client";

export type CategoriePaie = "paye" | "dans_lot" | "pas_pret" | "exclu";

export interface LignePaieRuul {
  poster_id: string;
  semaine: string;
  nom: string;
  pays: string | null;
  ruul_onboarding: string | null;
  montant: number;
  bonus: number | null;
  retenue: number | null;
  faits: number | null;
  prevus: number | null;
  nb_comptes: number | null;
  rattrapage: boolean | null;
  ruul_statut: string | null;
  ruul_echec: string | null;
  paye_at: string | null;
  categorie: CategoriePaie;
  raison: string | null;
}

export interface LotPaieRuul {
  statut: "prepare" | "saisi" | "paye" | "rapproche";
  ruul_statut: string | null;
  total: number | null;
  nb: number | null;
  facture: string | null;
  ruul_batch_id: number | null;
  ruul_env: string | null;
  a_virer: number | null;
  devise: string | null;
  reference: string | null;
  prepare_at: string | null;
  cree_at: string | null;
  paye_at: string | null;
  rapproche_at: string | null;
  lu_at: string | null;
}

export interface LotHistorique {
  semaine: string;
  statut: LotPaieRuul["statut"] | null;
  ruul_statut: string | null;
  total: number | null;
  nb: number | null;
  paye_at: string | null;
  cree_at: string | null;
  lignes: number;
  payes: number;
  exclus: number;
}

export interface PagePaieRuulData {
  semaine: string | null;
  lot: LotPaieRuul | null;
  lignes: LignePaieRuul[];
  historique: LotHistorique[];
}

export async function lirePagePaieRuul(semaine?: string | null): Promise<PagePaieRuulData> {
  const { data, error } = await supabase.rpc("ruul_paie_page", semaine ? { p_semaine: semaine } : {});
  if (error) throw new Error(error.message);
  return data as PagePaieRuulData;
}

export const CATEGORIES: readonly CategoriePaie[] = ["dans_lot", "paye", "pas_pret", "exclu"];

export const LIBELLE_CATEGORIE: Record<CategoriePaie, string> = {
  dans_lot: "Dans le lot",
  paye: "Payés",
  pas_pret: "Pas prêts",
  exclu: "Exclus",
};

export const AIDE_CATEGORIE: Record<CategoriePaie, string> = {
  dans_lot: "Prêts chez Ruul et inclus dans le lot : ils sont payés quand le virement arrive chez Ruul.",
  paye: "Paiement confirmé par Ruul.",
  pas_pret: "Montant gardé, pas encore prêts chez Ruul : ils partent dans le premier lot une fois prêts.",
  exclu: "Rien à payer cette semaine, avec la raison.",
};

/** Le statut d'un lot chez Ruul, en clair. */
export function libelleStatutRuul(s: string | null | undefined): { texte: string; ton: "attente" | "ok" | "alerte" | "neutre" } {
  switch ((s ?? "").toUpperCase()) {
    case "": return { texte: "Pas encore créé chez Ruul", ton: "neutre" };
    case "DRAFT": return { texte: "Brouillon chez Ruul", ton: "neutre" };
    case "AWAITING_FUNDING": return { texte: "En attente du virement", ton: "attente" };
    case "FUNDED":
    case "PROCESSING":
    case "IN_PROGRESS": return { texte: "Virement reçu, paiements en cours", ton: "attente" };
    case "COMPLETED":
    case "PAID":
    case "SUCCEEDED": return { texte: "Payé par Ruul", ton: "ok" };
    case "PARTIALLY_COMPLETED": return { texte: "Payé en partie", ton: "alerte" };
    case "FAILED":
    case "CANCELLED":
    case "CANCELED": return { texte: s === "FAILED" ? "Échec chez Ruul" : "Annulé chez Ruul", ton: "alerte" };
    default: return { texte: s!, ton: "neutre" };
  }
}

/** Les 4 étapes d'un lot, avec la date de chacune (null : pas encore). */
export function etapesLot(lot: LotPaieRuul | null): { cle: string; libelle: string; le: string | null; fait: boolean }[] {
  const paye = lot ? ["paye", "rapproche"].includes(lot.statut) || ["COMPLETED", "PAID", "SUCCEEDED"].includes((lot.ruul_statut ?? "").toUpperCase()) : false;
  return [
    { cle: "prepare", libelle: "Lot préparé", le: lot?.prepare_at ?? null, fait: Boolean(lot) },
    { cle: "cree", libelle: "Créé chez Ruul", le: lot?.cree_at ?? null, fait: Boolean(lot?.cree_at || lot?.ruul_batch_id) },
    { cle: "paye", libelle: "Payé", le: lot?.paye_at ?? null, fait: paye },
    { cle: "rapproche", libelle: "Rapproché", le: lot?.rapproche_at ?? null, fait: lot?.statut === "rapproche" },
  ];
}

/** Les lignes d'une catégorie regroupées par raison (les plus nombreuses d'abord). */
export function grouperParRaison(lignes: LignePaieRuul[]): { raison: string; lignes: LignePaieRuul[]; total: number }[] {
  const m = new Map<string, LignePaieRuul[]>();
  for (const l of lignes) {
    const r = l.raison ?? "Sans raison notée";
    m.set(r, [...(m.get(r) ?? []), l]);
  }
  return [...m.entries()]
    .map(([raison, ls]) => ({ raison, lignes: ls, total: ls.reduce((t, l) => t + montantLigne(l), 0) }))
    .sort((a, b) => b.lignes.length - a.lignes.length || a.raison.localeCompare(b.raison));
}

export const montantLigne = (l: Pick<LignePaieRuul, "montant" | "bonus">): number => Number(l.montant ?? 0) + Number(l.bonus ?? 0);

export function compter(lignes: LignePaieRuul[]): Record<CategoriePaie, { nb: number; total: number }> {
  const r = Object.fromEntries(CATEGORIES.map((c) => [c, { nb: 0, total: 0 }])) as Record<CategoriePaie, { nb: number; total: number }>;
  for (const l of lignes) {
    r[l.categorie].nb += 1;
    r[l.categorie].total += montantLigne(l);
  }
  return r;
}

const ONBOARDING: Record<string, string> = {
  READY: "Prêt",
  NOT_REGISTERED: "Pas inscrit",
  PENDING_KYC: "Identité à vérifier",
  PENDING_COLLECTION_ACCOUNT: "Banque à ajouter",
  PENDING_AGREEMENTS: "Contrat à accepter",
};
export const libelleOnboarding = (s: string | null): string => (s ? ONBOARDING[s] ?? s : "Pas inscrit");

/** « 9 – 15 nov. » : la semaine (lundi) en clair. */
export function libelleSemaine(lundi: string): string {
  const d = new Date(`${lundi}T12:00:00Z`);
  const fin = new Date(d.getTime() + 6 * 86_400_000);
  const jour = (x: Date) => x.toLocaleDateString("fr-FR", { day: "numeric", timeZone: "UTC" });
  const mois = (x: Date) => x.toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" });
  return mois(d) === mois(fin) ? `${jour(d)} – ${jour(fin)} ${mois(fin)}` : `${jour(d)} ${mois(d)} – ${jour(fin)} ${mois(fin)}`;
}

export const dollars = (n: number | null | undefined): string =>
  `${Number(n ?? 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} $`;
