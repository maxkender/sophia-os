/**
 * 24/11 (Adrien) : les sujets de recherche des agents éclaireurs (0853). Depuis l'onglet « Propositions » de la
 * Bible, l'admin donne un sujet (« l'art : tableaux, sculptures, dans toutes les langues ») ; un des trois agents le
 * prend à son réveil, cherche dans le budget du sujet, dépose ses cartes et rend son compte rendu. Sans sujet en
 * attente, chaque agent cherche librement dans son couloir.
 */
import { supabase } from "@/lib/supabase/client";

export type StatutSujet = "en_attente" | "pris" | "fait" | "annule";

export interface SujetRecherche {
  id: string;
  sujet: string;
  consigne: string | null;
  /** Vide : toutes les langues, au choix de l'agent. */
  langues: string[];
  labelNom: string | null;
  budgetUsd: number;
  cartesMax: number;
  /** Premier jour où un agent peut le prendre (AAAA-MM-JJ, heure de Paris). */
  jour: string;
  statut: StatutSujet;
  agent: string | null;
  prisLe: string | null;
  faitLe: string | null;
  compteRendu: string | null;
  creeLe: string;
  /** Ce que le sujet a coûté jusqu'ici (journal des recherches). */
  depenseUsd: number;
  /** Les cartes déposées pour lui (écartés non comptés). */
  cartes: number;
}

export interface BudgetEclaireurs {
  plafondUsd: number;
  depenseUsd: number;
  resteUsd: number;
  sujetsEnAttente: number;
}

export interface NouveauSujet {
  sujet: string;
  consigne: string;
  /** « de, it, tr » : codes séparés par des virgules ou des espaces. */
  langues: string;
  budgetUsd: number | null;
  cartesMax: number | null;
}

const nombre = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);

export async function lireSujets(): Promise<SujetRecherche[]> {
  const { data, error } = await supabase
    .from("sources_sujets")
    .select("id, sujet, consigne, langues, budget_usd, cartes_max, jour, statut, agent, pris_le, fait_le, compte_rendu, created_at, labels(nom), sources_recherches(cout_usd), sources_candidats(statut)")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  type Ligne = Record<string, unknown> & { labels: { nom: string } | null; sources_recherches: { cout_usd: unknown }[] | null; sources_candidats: { statut: string }[] | null };
  return ((data ?? []) as unknown as Ligne[]).map((l) => ({
    id: String(l.id),
    sujet: String(l.sujet),
    consigne: (l.consigne as string | null) ?? null,
    langues: (l.langues as string[] | null) ?? [],
    labelNom: l.labels?.nom ?? null,
    budgetUsd: nombre(l.budget_usd),
    cartesMax: nombre(l.cartes_max),
    jour: String(l.jour),
    statut: l.statut as StatutSujet,
    agent: (l.agent as string | null) ?? null,
    prisLe: (l.pris_le as string | null) ?? null,
    faitLe: (l.fait_le as string | null) ?? null,
    compteRendu: (l.compte_rendu as string | null) ?? null,
    creeLe: String(l.created_at),
    depenseUsd: Math.round((l.sources_recherches ?? []).reduce((s, r) => s + nombre(r.cout_usd), 0) * 100) / 100,
    cartes: (l.sources_candidats ?? []).filter((c) => c.statut !== "ecarte").length,
  }));
}

export async function lireBudgetEclaireurs(): Promise<BudgetEclaireurs> {
  const { data, error } = await supabase.rpc("sources_eclaireur_budget");
  if (error) throw new Error(error.message);
  const b = (data ?? {}) as Record<string, unknown>;
  return { plafondUsd: nombre(b.plafond_usd), depenseUsd: nombre(b.depense_usd), resteUsd: nombre(b.reste_usd), sujetsEnAttente: nombre(b.sujets_en_attente) };
}

/** « DE, it  tr » → ["de", "it", "tr"], sans doublon. */
export function lireLangues(texte: string): string[] {
  return [...new Set(texte.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
}

/** Ce qui empêche d'envoyer le sujet, ou `null` s'il est bon. */
export function erreurSujet(n: NouveauSujet): string | null {
  const s = n.sujet.trim();
  if (s.length < 3) return "Écris le sujet en quelques mots.";
  if (s.length > 200) return "Le sujet tient en 200 caractères : le détail va dans la consigne.";
  if (n.consigne.length > 4000) return "La consigne est trop longue (4 000 caractères au plus).";
  if (n.budgetUsd !== null && !(n.budgetUsd > 0 && n.budgetUsd <= 50)) return "Le budget d'un sujet va de 1 à 50 $.";
  if (n.cartesMax !== null && !(Number.isInteger(n.cartesMax) && n.cartesMax >= 1 && n.cartesMax <= 60)) return "Un sujet rend de 1 à 60 cartes.";
  return null;
}

export async function ajouterSujet(n: NouveauSujet): Promise<void> {
  const erreur = erreurSujet(n);
  if (erreur) throw new Error(erreur);
  const { error } = await supabase.rpc("sources_sujet_ajouter", {
    p_sujet: n.sujet.trim(),
    p_consigne: n.consigne.trim() || null,
    p_langues: lireLangues(n.langues),
    p_budget: n.budgetUsd,
    p_cartes: n.cartesMax,
  });
  if (error) throw new Error(error.message);
}

export async function annulerSujet(id: string): Promise<void> {
  const { error } = await supabase.rpc("sources_sujet_annuler", { p_id: id });
  if (error) throw new Error(error.message);
}

export const LIBELLE_STATUT: Record<StatutSujet, string> = { en_attente: "en attente", pris: "en cours", fait: "fait", annule: "annulé" };

/** Les sujets à montrer : ceux en attente et en cours d'abord, puis les derniers rendus (les annulés ne restent pas). */
export function rangerSujets(tous: SujetRecherche[], faitsMax = 6): { ouverts: SujetRecherche[]; rendus: SujetRecherche[] } {
  const ordre: Record<StatutSujet, number> = { pris: 0, en_attente: 1, fait: 2, annule: 3 };
  const ouverts = tous.filter((s) => s.statut === "pris" || s.statut === "en_attente")
    .sort((a, b) => ordre[a.statut] - ordre[b.statut] || a.creeLe.localeCompare(b.creeLe));
  const rendus = tous.filter((s) => s.statut === "fait")
    .sort((a, b) => (b.faitLe ?? "").localeCompare(a.faitLe ?? ""))
    .slice(0, faitsMax);
  return { ouverts, rendus };
}

/** Ce que les sujets ouverts peuvent encore coûter : à comparer au reste du jour avant d'en ajouter un. */
export const engageUsd = (ouverts: SujetRecherche[]): number =>
  Math.round(ouverts.reduce((s, x) => s + Math.max(x.budgetUsd - x.depenseUsd, 0), 0) * 100) / 100;
