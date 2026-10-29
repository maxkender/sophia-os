// BLEO — section de l'OS (/admin/bleo), en lecture seule.
// Tables et vues des migrations 0600 à 0607 : la nuit (`bleo_nuits`), les
// plans (`bleo_runs`, `bleo_plan_ui`), les familles d'accroche
// (`bleo_familles_ui`, `bleo_contenus_ui`), la boîte et la jauge des podz
// (`bleo_boite`, `bleo_jauge`) et `reglages.bleo`. Rien ici n'écrit.

import { supabase } from "@/lib/supabase/client";

export const TAILLE_PAGE = 50;

export type VerdictFamille = "gagnante" | "en_attente" | "non_gagnante";
export type VerdictContenu = "gagnant" | "en_attente" | "non_gagnant";
export type EtatBleo = "a_juger" | "en_test" | "juge";

export interface ResumeNuit {
  jour?: string;
  duree_s?: number;
  etats?: Partial<Record<EtatBleo, number>>;
  juges?: number;
  valeurs?: number;
  rattaches?: number;
  r_calcules?: number;
  familles_changees?: number;
  verdicts_familles?: Partial<Record<VerdictFamille, number>>;
  contenus_verdict_change?: number;
  familles_closes?: number;
  releve_fini?: boolean;
}

export interface NuitBleo {
  jour: string;
  demarre_le: string;
  fini_le: string | null;
  resume: ResumeNuit | null;
  erreur: string | null;
}

export interface RapportPlan {
  jour?: string;
  portes?: Record<string, boolean | number>;
  mix_reel?: Record<string, number>;
  infractions?: Record<string, number>;
  valeur_plan?: number;
  valeur_reel?: number;
  passages_plan?: number;
  passages_reel?: number;
  comptes_compares?: number;
  reel_sans_valeur?: number;
  couples_identiques?: number;
  calcule_le?: string;
}

export interface ResumePlan {
  mode?: string;
  comptes?: number;
  creneaux?: number;
  creneaux_vides?: number;
  comptes_complets?: number;
  duree_s?: number;
  par_file?: Record<string, number>;
  par_categorie?: Record<string, number>;
  par_appli?: Record<string, number>;
  relaches?: Record<string, number>;
  tests_places?: number;
  tests_a_placer?: number;
  testables_recents?: number;
  testables_recents_complets?: number;
  labels_file_juger?: Record<string, { utilise: number; capacite: number }>;
  rapport?: RapportPlan;
}

export interface RunBleo {
  id: string;
  jour_vise: string;
  mode: string;
  demarre_le: string;
  fini_le: string | null;
  resume: ResumePlan | null;
  erreur: string | null;
}

export interface LignePlan {
  id: string;
  run_id: string;
  jour_vise: string;
  compte_id: string;
  handle_tiktok: string | null;
  creneau: number;
  contenu_id: string | null;
  titre: string | null;
  famille_id: string | null;
  accroche: string | null;
  langue: string;
  application: string | null;
  label_id: string | null;
  label: string | null;
  file_bleo: string | null;
  categorie: string | null;
  valeur_tirage: number | null;
  relache: string | null;
  etat_bleo: EtatBleo | null;
  verdict: VerdictContenu | null;
  reel_titres: string | null;
  identique_au_reel: boolean;
}

export interface FamilleBleo {
  id: string;
  label_id: string | null;
  label: string | null;
  label_nom: string | null;
  voie: number | null;
  accroche: string | null;
  racine_contenu_id: string | null;
  racine_titre: string | null;
  verdict: VerdictFamille;
  verdict_le: string | null;
  close: boolean;
  close_le: string | null;
  created_at: string;
  n_contenus: number;
  gen_max: number;
  n_passages: number;
  vues_max: number | null;
  vues_total: number | null;
  r_median: number | null;
  dernier_passage: string | null;
  /** r moyen des passages publiés, chaque r plafonné à 20 (la mesure qui ferme une famille, D36). */
  r_moyen: number | null;
}

export interface ContenuBleo {
  id: string;
  titre: string | null;
  famille_id: string;
  generation: number | null;
  parent_bleo_id: string | null;
  type_bleo: string | null;
  classe_defaut: string | null;
  etat_bleo: EtatBleo | null;
  verdict: VerdictContenu | null;
  statut: string;
  created_at: string;
  juge_le: string | null;
  pod: string | null;
  source_url: string | null;
  langue_source: string | null;
  n_passages: number;
  vues_max: number | null;
  vues_moyenne: number | null;
  r_median: number | null;
  dernier_passage: string | null;
  valeur_max: number | null;
  n_langues: number;
  r_moyen: number | null;
}

export interface PassageFamille {
  id: string;
  contenu_id: string;
  compte_id: string;
  langue: string;
  date_publication_prevue: string;
  statut: string;
  vues: number | null;
  r: number | null;
  publie_at: string | null;
  publie_url: string | null;
  file_bleo: string | null;
  est_rappel: boolean | null;
  comptes: { handle_tiktok: string | null } | null;
}

export interface LigneJauge {
  label_id: string;
  pod: string;
  familles_en_boite: number;
  par_jour: number;
  semaines: number | null;
  part_full_test: number | null;
}

export interface LigneBoite {
  label_id: string;
  famille_id: string;
  accroche: string | null;
  sorte: "g1" | "g2";
  parent_contenu_id: string;
  faites: number;
  verdict_le: string | null;
  au_budget: boolean;
  rang: number;
  accroche_attendue: "identique" | "reformulee";
}

export interface LabelBleo {
  id: string;
  slug: string;
  nom: string;
  voie: number | null;
}

export type ReglagesBleo = Record<string, unknown>;

export async function lireReglagesBleo(): Promise<ReglagesBleo | null> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "bleo").maybeSingle();
  if (error) throw error;
  return (data?.valeur as ReglagesBleo | undefined) ?? null;
}

export async function listerNuits(limite = 7): Promise<NuitBleo[]> {
  const { data, error } = await supabase
    .from("bleo_nuits")
    .select("jour, demarre_le, fini_le, resume, erreur")
    .order("jour", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as NuitBleo[];
}

export async function listerRuns(limite = 10): Promise<RunBleo[]> {
  const { data, error } = await supabase
    .from("bleo_runs")
    .select("id, jour_vise, mode, demarre_le, fini_le, resume, erreur")
    .order("demarre_le", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as RunBleo[];
}

/** Le plan officiel : le dernier tirage fini sans erreur (les essais manuels portent une erreur). */
export function runOfficiel(runs: RunBleo[]): RunBleo | null {
  return runs.find((r) => r.fini_le && !r.erreur) ?? null;
}

export interface FiltresPlan {
  categorie?: string;
  label?: string;
  compte?: string;
  page?: number;
}

export async function listerPlan(runId: string, filtres: FiltresPlan = {}): Promise<{ lignes: LignePlan[]; total: number }> {
  const page = filtres.page ?? 0;
  let q = supabase.from("bleo_plan_ui").select("*", { count: "exact" }).eq("run_id", runId);
  if (filtres.categorie) q = q.eq("categorie", filtres.categorie);
  if (filtres.label) q = q.eq("label", filtres.label);
  if (filtres.compte) q = q.ilike("handle_tiktok", `%${filtres.compte}%`);
  const { data, error, count } = await q
    .order("handle_tiktok", { ascending: true })
    .order("creneau", { ascending: true })
    .range(page * TAILLE_PAGE * 2, (page + 1) * TAILLE_PAGE * 2 - 1);
  if (error) throw error;
  return { lignes: (data ?? []) as LignePlan[], total: count ?? 0 };
}

export type FiltreVerdict = "toutes" | VerdictFamille | "closes";
export type TriFamilles = "vues" | "verdict" | "passages" | "recentes";

export interface FiltresFamilles {
  labelId?: string;
  verdict?: FiltreVerdict;
  recherche?: string;
  tri?: TriFamilles;
  page?: number;
}

const COLONNE_TRI: Record<TriFamilles, string> = {
  vues: "vues_max",
  verdict: "verdict_le",
  passages: "n_passages",
  recentes: "created_at",
};

export async function listerFamilles(f: FiltresFamilles = {}): Promise<{ familles: FamilleBleo[]; total: number }> {
  const page = f.page ?? 0;
  let q = supabase.from("bleo_familles_ui").select("*", { count: "exact" });
  if (f.labelId) q = q.eq("label_id", f.labelId);
  if (f.verdict === "closes") q = q.eq("close", true);
  else if (f.verdict && f.verdict !== "toutes") q = q.eq("verdict", f.verdict);
  const recherche = f.recherche?.trim();
  if (recherche) q = q.ilike("accroche", `%${recherche}%`);
  const { data, error, count } = await q
    .order(COLONNE_TRI[f.tri ?? "vues"], { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(page * TAILLE_PAGE, (page + 1) * TAILLE_PAGE - 1);
  if (error) throw error;
  return { familles: (data ?? []) as FamilleBleo[], total: count ?? 0 };
}

export async function lireFamille(id: string): Promise<FamilleBleo | null> {
  const { data, error } = await supabase.from("bleo_familles_ui").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as FamilleBleo | null) ?? null;
}

export async function listerContenusFamille(familleId: string): Promise<ContenuBleo[]> {
  const { data, error } = await supabase
    .from("bleo_contenus_ui")
    .select("*")
    .eq("famille_id", familleId)
    .order("generation", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ContenuBleo[];
}

export async function listerPassagesFamille(contenuIds: string[], limite = 100): Promise<PassageFamille[]> {
  if (contenuIds.length === 0) return [];
  const { data, error } = await supabase
    .from("passages")
    .select(
      "id, contenu_id, compte_id, langue, date_publication_prevue, statut, vues, r, publie_at, publie_url, file_bleo, est_rappel, comptes(handle_tiktok)",
    )
    .in("contenu_id", contenuIds)
    .order("date_publication_prevue", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as unknown as PassageFamille[];
}

/** A5 : la valeur d'un contenu dans une langue, avec ce qui la compose (forme × fatigues × âge). */
export interface ValeurLangue {
  contenu_id: string;
  langue: string;
  forme: number;
  n_post: number;
  n_accroche: number;
  facteur_age: number;
  valeur: number;
  calcule_le: string;
}

/** Les valeurs de la dernière nuit pour ces contenus, langue par langue (les couples à 0 ne sont plus candidats). */
export async function listerValeursFamille(contenuIds: string[]): Promise<ValeurLangue[]> {
  if (contenuIds.length === 0) return [];
  const { data, error } = await supabase
    .from("bleo_valeurs")
    .select("contenu_id, langue, forme, n_post, n_accroche, facteur_age, valeur, calcule_le")
    .in("contenu_id", contenuIds)
    .gt("valeur", 0);
  if (error) throw error;
  return ((data ?? []) as ValeurLangue[]).map((v) => ({
    ...v,
    forme: Number(v.forme),
    facteur_age: Number(v.facteur_age),
    valeur: Number(v.valeur),
  }));
}

export async function listerJauge(): Promise<LigneJauge[]> {
  const { data, error } = await supabase.from("bleo_jauge").select("*").order("semaines", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as LigneJauge[];
}

export async function listerBoite(labelId: string, limite = 200): Promise<LigneBoite[]> {
  const { data, error } = await supabase
    .from("bleo_boite")
    .select("*")
    .eq("label_id", labelId)
    .order("rang", { ascending: true })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as LigneBoite[];
}

/** Une slide du post parent, telle que postée (D37). */
export interface SlidePostBoite {
  position: number;
  texte: string | null;
  appli: boolean;
  image: string | null;
  inspiration: string | null;
}

export interface PassageBoite {
  langue: string;
  vues: number | null;
  r: number | null;
  url: string | null;
}

/** Une ligne de la boîte avec le post parent complet (`bleo_boite_posts`, 0609). */
export interface LigneBoitePost {
  rang: number;
  sorte: "g1" | "g2";
  accroche_attendue: "identique" | "reformulee";
  accroche: string | null;
  famille_id: string;
  parent_contenu_id: string;
  faites: number;
  au_budget: boolean;
  verdict_le: string | null;
  parent: { titre: string | null; langue_source: string | null; generation: number | null; source_url: string | null } | null;
  post: (PassageBoite & { slides: SlidePostBoite[] }) | null;
  passages: PassageBoite[];
}

export async function listerBoitePosts(labelId: string, limite = 50): Promise<LigneBoitePost[]> {
  const { data, error } = await supabase.rpc("bleo_boite_posts", { p_label_id: labelId, p_limite: limite });
  if (error) throw error;
  return (data ?? []) as LigneBoitePost[];
}

export async function listerLabelsBleo(): Promise<LabelBleo[]> {
  const { data, error } = await supabase.from("labels").select("id, slug, nom, voie").order("nom", { ascending: true });
  if (error) throw error;
  return (data ?? []) as LabelBleo[];
}
