import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

/**
 * Bloc C (2/11) : la page « Problèmes » (remplace Needs you). Tout vient de
 * problemes_liste() (0517) ; les gestes passent par probleme_agir(). Rien
 * n'est envoyé en mode test ; l'argent n'est jamais exécuté ici.
 */
export type Niveau = "urgent" | "aujourdhui" | "samedi";
export type Proprietaire = "new_cohort_bot" | "control_bot" | "pay_bot";
export type StatutProbleme = "ouvert" | "valide" | "ignore" | "ferme_auto";
/** v4 (3/11) : onboarding = jamais posté ; nouveaux_actifs = 1er post il y a moins de 14 jours ; actifs = les autres. */
export type Groupe = "onboarding" | "nouveaux_actifs" | "actifs";

export interface SourceProbleme {
  type: string;
  ref: string;
  at?: string;
  texte?: string;
  lien?: string;
  canal?: string;
  par?: string;
}

/** 0520 : ce que l'OS sait du posteur, calculé à chaque lecture (probleme_situation). */
export interface Situation {
  actif: boolean;
  pays: string | null;
  comptes: number;
  lundi: string;
  posts: number;
  attendus: number;
  devrait_poster: boolean;
  bloque: boolean;
  etapes: { login: boolean; slack: boolean; tiktok: boolean; warmup: boolean };
  paie_passee: { semaine: string; montant: number | null; paye_at: string | null; action: string | null; api: string | null; ligne: boolean };
  paye_passee: boolean;
  attendu_semaine: number | null;
  finances: { nom: string | null; montant: number | null; etat: string }[];
  finance_ok: boolean;
  jalons_lus_at: string | null;
  contrat_id: string | null;
  contrat_actif: boolean | null;
  message: { at: string; canal: "upwork" | "slack"; texte: string | null; lien: string | null; repondu_at: string | null } | null;
  a_ecrit: boolean;
  /** v4 (0522) */
  premier_post_at?: string | null;
  dernier_post_at?: string | null;
  nb_reports?: number;
  groupe?: Groupe;
}

export interface Probleme {
  id: string;
  poster_id: string | null;
  contrat_id: string | null;
  nom: string | null;
  hm: string | null;
  cohorte: string | null;
  actif: boolean | null;
  categorie: string;
  niveau: Niveau;
  resume: string;
  sources: SourceProbleme[];
  proprietaire: Proprietaire;
  proposition_reponse: string | null;
  canal_reponse: "upwork" | "slack" | null;
  proposition_action: string | null;
  propose_par: string | null;
  propose_at: string | null;
  statut: StatutProbleme;
  ferme_raison: string | null;
  ferme_at: string | null;
  created_at: string;
  maj_at: string;
  slack_relie: boolean;
  compte_id: string | null;
  situation?: Situation | null;
  /** v4 (0522) : le groupe (recalculé à chaque passage), le diagnostic du bot (300 car.), son groupe suggéré. */
  groupe?: Groupe | null;
  diagnostic?: string | null;
  /** 0524 : « os » (diagnostic écrit par l'OS à chaque passage) ou le bot qui l'a écrit. */
  diagnostic_par?: string | null;
  groupe_suggere?: Groupe | null;
  /** 0528 : une question posée à Max (2 à 4 options, la 1re recommandée) ; le choix fait. */
  question?: string | null;
  options?: OptionDecision[] | null;
  decision_choisie?: number | null;
  decision_at?: string | null;
  /** 0528 : la carte concerne un posteur, une HM ou une offre Upwork ; à qui part la réponse. */
  sujet?: "posteur" | "hm" | "offre";
  hm_id?: string | null;
  hm_nom?: string | null;
  offre_lien?: string | null;
  destinataire?: "posteur" | "hm";
  /** 0530 : Kill samedi préparé (le lundi de la semaine de ce samedi). */
  kill_samedi_lundi?: string | null;
  kill_samedi_at?: string | null;
}

/** 0530 : Kill samedi : rien n'est exécuté, la décision va à la revue du samedi ; annuler remet Keep. */
export async function killSamedi(id: string, annuler = false): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("probleme_kill_samedi", { p_id: id, p_annuler: annuler });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

/** 0528 : une option d'une carte « décision ». « paie » : le bouton ouvre le contrat Upwork, l'OS ne paie jamais. */
export interface OptionDecision {
  libelle: string;
  reponse?: string;
  action?: string;
  paie?: boolean;
  lien?: string;
  recommande?: boolean;
}

/** 0528 : Max choisit une option : la carte se ferme (ou revient samedi), le choix va dans bot_feedback. */
export async function deciderProbleme(id: string, index: number, envoye: boolean): Promise<OptionDecision> {
  const { data, error } = await supabase.rpc("probleme_decider", { p_id: id, p_index: index, p_envoye: envoye });
  if (error) throw error;
  return data as OptionDecision;
}

export interface Archive {
  type: string;
  ref: string;
  poster_id: string | null;
  nom: string | null;
  texte: string | null;
  recu_at: string | null;
  raison: string | null;
}

export interface CompteProblemes {
  urgent: number;
  aujourdhui: number;
  samedi: number;
  total: number;
}

export async function lireProblemes(vue: "ouverts" | "fermes" = "ouverts"): Promise<Probleme[]> {
  const { data, error } = await supabase.rpc("problemes_liste", { p_vue: vue });
  if (error) throw error;
  return (data ?? []) as Probleme[];
}

export async function lireArchives(): Promise<Archive[]> {
  const { data, error } = await supabase.rpc("problemes_archives_liste", { p_limite: 200 });
  if (error) throw error;
  return (data ?? []) as Archive[];
}

export async function lireCompteProblemes(): Promise<CompteProblemes> {
  const { data, error } = await supabase.rpc("problemes_compte");
  if (error) throw error;
  return (data ?? { urgent: 0, aujourdhui: 0, samedi: 0, total: 0 }) as CompteProblemes;
}

export type ModeProblemes = "test" | "on";

/** Le mode de la page (0517 : « test » par défaut ; rien n'est envoyé tant qu'il n'est pas « on »). */
export async function lireModeProblemes(): Promise<ModeProblemes> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "problemes_mode").maybeSingle();
  if (error) throw error;
  return data?.valeur === "on" ? "on" : "test";
}

export async function agirProbleme(id: string, action: "modifier" | "samedi" | "ignorer" | "valider" | "fermer", valeur?: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc("probleme_agir", { p_id: id, p_action: action, p_valeur: valeur ?? null });
  if (error) throw error;
}

export async function validerCategorie(niveau: Niveau, categorie: string): Promise<number> {
  const { data, error } = await supabase.rpc("problemes_valider_categorie", { p_niveau: niveau, p_categorie: categorie });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * 3/11 : avant d'afficher, relire Upwork (milestones des contrats des cartes
 * ouvertes, lecture seule), puis collecter et recalculer (fermetures, niveaux).
 * Aussi toutes les 30 min par les crons. Une relecture Upwork ratée n'empêche
 * pas le recalcul (il garde la dernière lecture).
 */
export async function passerMaintenant(): Promise<Record<string, unknown>> {
  let upwork: unknown = null;
  try {
    upwork = await invoke("upwork", { action: "jalons_problemes" });
  } catch (e) {
    upwork = { ok: false, error: (e as Error).message };
  }
  const { data, error } = await supabase.rpc("problemes_actualiser");
  if (error) throw error;
  return { upwork, ...((data ?? {}) as Record<string, unknown>) };
}

/** Mode « on » seulement : la réponse part sur Upwork (quota du compte géré par l'envoi). */
export async function envoyerUpwork(posterId: string, texte: string): Promise<void> {
  const r = await invoke<{ ok: boolean; error?: string }>("upwork", { action: "message_posteur", poster_id: posterId, texte, type: "probleme" });
  if (!r.ok) throw new Error(r.error ?? "envoi Upwork impossible");
}

/** Une réponse par conversation et par jour : déjà écrit aujourd'hui depuis cette page ? */
export async function dejaEcritAujourdhui(posterId: string, depuis: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("nudges")
    .select("id", { count: "exact", head: true })
    .eq("poster_id", posterId)
    .eq("type", "probleme_upwork")
    .gte("envoye_at", depuis);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** v4 : la barre d'onboarding (0522, problemes_onboarding) : cohorte en cours et suivante. */
export type EtapeOnboarding = "offre" | "accueil" | "login" | "slack" | "tiktok" | "warmup" | "abonnements" | "pret";

export interface RecrueBloquee {
  poster_id?: string;
  contrat_id?: string;
  nom: string | null;
  pays: string | null;
  hm?: string | null;
  reports: number;
}

export interface CohorteOnboarding {
  lundi: string;
  total: number;
  a_poste: number;
  reports: { un: number; deux_plus: number };
  etapes: { cle: EtapeOnboarding; faits: number; bloques: RecrueBloquee[] }[];
}

export async function lireOnboarding(): Promise<CohorteOnboarding[]> {
  const { data, error } = await supabase.rpc("problemes_onboarding");
  if (error) throw error;
  return (data ?? []) as CohorteOnboarding[];
}

/** Mode « on » seulement : le lien personnel de mot de passe part (Slack si relié, sinon Upwork). */
export async function envoyerLienMotDePasse(posterId: string): Promise<void> {
  const r = await invoke<{ ok: boolean; error?: string }>("recrues-check", { action: "lien_mot_de_passe_envoyer", poster_id: posterId });
  if (!r.ok) throw new Error(r.error ?? "envoi du lien impossible");
}

// ---------------------------------------------------------------------------
// 3/11 : le feedback aux bots et leurs règles (0523).
// ---------------------------------------------------------------------------
export type Verdict = "juste" | "pas_un_probleme" | "mauvais_diagnostic" | "mauvaise_action";

export interface BotFeedback {
  id: string;
  probleme_id: string | null;
  bot: Proprietaire;
  categorie: string | null;
  groupe: string | null;
  verdict: Verdict;
  raison: string | null;
  diagnostic_du_bot: string | null;
  action_du_bot: string | null;
  created_at: string;
  nom: string | null;
  en_regle: boolean;
}

export type BotRegle = Proprietaire | "tous";

export interface RegleBot {
  id: string;
  bot: BotRegle;
  regle: string;
  exemple: string | null;
  source_feedback_ids: string[];
  active: boolean;
  created_at: string;
}

export interface StatBot {
  bot: Proprietaire;
  total: number;
  justes: number;
  erreurs: { categorie: string; n: number }[];
}

export async function donnerFeedback(problemeId: string, verdict: Verdict, raison: string | null): Promise<BotFeedback> {
  const { data, error } = await supabase.rpc("bot_feedback_donner", { p_probleme: problemeId, p_verdict: verdict, p_raison: raison });
  if (error) throw error;
  return data as BotFeedback;
}

export async function lireFeedbacks(jours = 30): Promise<BotFeedback[]> {
  const { data, error } = await supabase.rpc("bot_feedback_liste", { p_jours: jours });
  if (error) throw error;
  return (data ?? []) as BotFeedback[];
}

export async function lireRegles(): Promise<RegleBot[]> {
  const { data, error } = await supabase.rpc("regles_bots_liste");
  if (error) throw error;
  return (data ?? []) as RegleBot[];
}

export async function enregistrerRegle(r: { id: string | null; bot: BotRegle; regle: string; exemple: string | null; sources: string[]; active: boolean }): Promise<RegleBot> {
  const { data, error } = await supabase.rpc("regle_bot_enregistrer", {
    p_id: r.id, p_bot: r.bot, p_regle: r.regle, p_exemple: r.exemple, p_sources: r.sources, p_active: r.active,
  });
  if (error) throw error;
  return data as RegleBot;
}

export async function activerRegle(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.rpc("regle_bot_activer", { p_id: id, p_active: active });
  if (error) throw error;
}

export async function lireStatsBots(): Promise<StatBot[]> {
  const { data, error } = await supabase.rpc("bots_stats");
  if (error) throw error;
  return (data ?? []) as StatBot[];
}

// ---------------------------------------------------------------------------
// 3/11 : Kill depuis la page Problèmes, branché sur Upwork (fonction upwork, 0527).
// ---------------------------------------------------------------------------
export interface PlanKill {
  decision: "fermer" | "deja_ferme" | "attendre" | "a_la_main";
  raison: string | null;
  montant: number;
  en_cours: { nom: string; depot: number | null; etat: string } | null;
}

export interface InfoKill {
  contrat_id: string | null;
  titre: string | null;
  organisation: string | null;
  statut: string | null;
  jalons: { nom: string; etat: string; depot: number | null; paye: number | null }[];
  plan: PlanKill;
  mode?: "test" | "on";
  texte?: string;
  test?: boolean;
}

/** Ce que le Kill fera : le contrat lié, relu chez Upwork (lecture seule). */
export async function apercuKill(problemeId: string): Promise<InfoKill> {
  const r = await invoke<{ ok: boolean; error?: string } & InfoKill>("upwork", { action: "kill_probleme", probleme_id: problemeId, executer: false });
  if (!r.ok) throw new Error(r.error ?? "aperçu du Kill impossible");
  return r;
}

/** Le Kill : compte désactivé, kill noté, et (case cochée) contrat fermé sans avis. Jamais en mode test. */
export async function executerKill(problemeId: string, fermerContrat: boolean): Promise<InfoKill> {
  const r = await invoke<{ ok: boolean; error?: string } & InfoKill>("upwork", { action: "kill_probleme", probleme_id: problemeId, executer: true, fermer_contrat: fermerContrat });
  if (!r.ok) throw new Error(r.error ?? "Kill impossible");
  return r;
}
