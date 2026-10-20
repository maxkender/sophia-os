import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

/**
 * Check, Kill or Double (migrations 0326 à 0328). Le calcul vit en SQL : le
 * jeudi 6 h (nudges des nouveaux comptes) et le samedi 6 h (kill, recréer,
 * doubler), le cron enregistre les propositions. La page les lit, relance un
 * calcul, règle les seuils et décide ; Recréer, Doubler et l'envoi aux HMs
 * passent par la fonction Edge `ckd`.
 */

export type TypeControle = "jeudi" | "samedi";
export type RegleCkd = "jeudi" | "premiere_semaine" | "anciens" | "doubler" | "absent";
export type ActionCkd = "nudge" | "recreer" | "ne_pas_renouveler" | "doubler";
export type DecisionCkd = ActionCkd | "garder" | "pas_maintenant" | "rien";
export type SourceReglage = "defaut" | "pays" | "label" | "pays_label";

export interface ControleCkd {
  id: string;
  type: TypeControle;
  jour: string;
  lance_at: string;
  nb_propositions: number;
  slack_ts: string | null;
  slack_erreur: string | null;
  rappel_at: string | null;
}

export interface PostCkd {
  jour: string;
  vues: number | null;
  url: string | null;
  mesure: boolean;
  age_h: number | null;
}

export interface PeriodeCkd {
  du: string;
  au: string;
  attendus: number;
  publies: number;
  mesures: number;
  morts: number;
  bons: number;
  mediane: number | null;
  moyenne: number | null;
  bas: { vues: number; url: string; jour: string } | null;
  haut: { vues: number; url: string; jour: string } | null;
  liens_manquants: { jour: string }[];
  posts: PostCkd[];
}

export interface DonneesCkd {
  handle: string | null;
  abonnes: number | null;
  j0: string | null;
  periode: PeriodeCkd;
  motifs: string[];
  mediane_ref: { valeur: number | null; source: "pays" | "pays_label" | "langue" | "flotte"; n_comptes: number };
  seuil_bon_post: { valeur: number; source: SourceReglage | "comment_masters" | "repli" };
  reglages: Record<string, { v: unknown; s: SourceReglage }>;
  recreations: number;
  autres_comptes: { id: string; handle: string | null; actif: boolean }[];
}

export interface PropositionCkd {
  id: string;
  controle_id: string;
  type: TypeControle;
  jour: string;
  regle: RegleCkd;
  action: ActionCkd;
  compte_id: string;
  poster_id: string;
  hm_id: string | null;
  pays: string | null;
  langue: string | null;
  label_id: string | null;
  application: string | null;
  donnees: DonneesCkd;
  decision: DecisionCkd | null;
  decision_par: string | null;
  decision_at: string | null;
  note: string | null;
  nouveau_compte_id: string | null;
  envoye_at: string | null;
  fait_at: string | null;
  erreur: string | null;
}

export interface PersonneCkd {
  id: string;
  prenom: string | null;
  nom: string | null;
  zone_recrutement: string | null;
}

export interface LabelCkd {
  id: string;
  nom: string;
  slug: string;
}

export interface ReglageCkd {
  id: string;
  cle: string;
  pays: string | null;
  label_id: string | null;
  valeur: unknown;
  maj_at: string;
}

export interface JournalCkd {
  id: number;
  cle: string;
  pays: string | null;
  label_id: string | null;
  ancienne: unknown;
  nouvelle: unknown;
  par: string | null;
  at: string;
}

export interface PartBonsPostsCkd {
  pays: string;
  seuil: number;
  source: string;
  posts: number;
  au_dessus: number;
  mediane: number | null;
}

export interface HmCkd {
  profile_id: string;
  nom: string;
  zone: string | null;
  posters: number;
  slack_user_id: string | null;
}

export async function listerControles(): Promise<ControleCkd[]> {
  const { data, error } = await supabase
    .from("ckd_controles")
    .select("id, type, jour, lance_at, nb_propositions, slack_ts, slack_erreur, rappel_at")
    .order("jour", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as ControleCkd[];
}

export async function listerPropositions(controleId: string): Promise<PropositionCkd[]> {
  const { data, error } = await supabase
    .from("ckd_propositions")
    .select(
      "id, controle_id, type, jour, regle, action, compte_id, poster_id, hm_id, pays, langue, label_id, application, donnees, decision, decision_par, decision_at, note, nouveau_compte_id, envoye_at, fait_at, erreur",
    )
    .eq("controle_id", controleId);
  if (error) throw error;
  return (data ?? []) as PropositionCkd[];
}

export async function listerPersonnes(ids: string[]): Promise<PersonneCkd[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, prenom, nom, zone_recrutement")
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as PersonneCkd[];
}

export async function listerLabels(): Promise<LabelCkd[]> {
  const { data, error } = await supabase.from("labels").select("id, nom, slug").order("nom");
  if (error) throw error;
  return (data ?? []) as LabelCkd[];
}

/** Calcule (ou recalcule) un contrôle. Les propositions déjà décidées ne bougent pas. */
export async function lancerControle(type: TypeControle, jour?: string): Promise<number> {
  const { data, error } = await supabase.rpc("ckd_controle", { p_type: type, p_jour: jour ?? null });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function listerReglages(): Promise<ReglageCkd[]> {
  const { data, error } = await supabase.from("ckd_reglages").select("id, cle, pays, label_id, valeur, maj_at");
  if (error) throw error;
  return (data ?? []) as ReglageCkd[];
}

/** `valeur` null : retire l'exception (on retombe sur le niveau au-dessus). */
export async function reglerCkd(cle: string, pays: string | null, labelId: string | null, valeur: unknown) {
  const { error } = await supabase.rpc("ckd_regler", {
    p_cle: cle,
    p_pays: pays,
    p_label: labelId,
    p_valeur: valeur === undefined ? null : valeur,
  });
  if (error) throw error;
}

export async function listerJournal(): Promise<JournalCkd[]> {
  const { data, error } = await supabase
    .from("ckd_reglages_journal")
    .select("id, cle, pays, label_id, ancienne, nouvelle, par, at")
    .order("id", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as JournalCkd[];
}

export async function lirePartBonsPosts(): Promise<PartBonsPostsCkd[]> {
  const { data, error } = await supabase.rpc("ckd_part_bons_posts");
  if (error) throw error;
  return ((data ?? []) as PartBonsPostsCkd[]).map((l) => ({
    ...l,
    seuil: Number(l.seuil),
    posts: Number(l.posts),
    au_dessus: Number(l.au_dessus),
    mediane: l.mediane === null ? null : Number(l.mediane),
  }));
}

export async function listerHms(): Promise<HmCkd[]> {
  const { data, error } = await supabase.rpc("ckd_hms");
  if (error) throw error;
  return ((data ?? []) as HmCkd[]).map((h) => ({ ...h, posters: Number(h.posters) }));
}

/** Un compte qui a manqué au moins un post du lundi au vendredi (pour info). */
export interface ManqueCkd {
  compte_id: string;
  handle: string | null;
  poster_id: string;
  hm_id: string | null;
  pays: string | null;
  prevus: number;
  publies: number;
  jours: string[];
}

/** `jour` : le samedi du contrôle. */
export async function listerManques(jour: string): Promise<ManqueCkd[]> {
  const { data, error } = await supabase.rpc("ckd_manques_semaine", { p_jour: jour });
  if (error) throw error;
  return ((data ?? []) as ManqueCkd[]).map((m) => ({ ...m, prevus: Number(m.prevus), publies: Number(m.publies) }));
}

export async function enregistrerSlackHm(profileId: string, slackUserId: string | null) {
  const { error } = await supabase
    .from("hm_slack")
    .upsert({ profile_id: profileId, slack_user_id: slackUserId }, { onConflict: "profile_id" });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Décisions (0328)
// ---------------------------------------------------------------------------

/**
 * Décider. Recréer et Doubler créent un compte : ils passent par la fonction
 * `ckd` (manage-users). Le reste se décide en SQL (`ckd_decider`).
 */
export async function deciderCkd(id: string, decision: DecisionCkd, note: string | null): Promise<void> {
  if (decision === "recreer" || decision === "doubler") {
    await invoke<{ ok: boolean }>("ckd", { action: "decider", id, decision, note });
    return;
  }
  const { error } = await supabase.rpc("ckd_decider", { p_id: id, p_decision: decision, p_note: note });
  if (error) throw error;
}

/** Garder, Pas maintenant, Rien et Kill s'annulent tant que rien n'est parti. */
export async function annulerCkd(id: string): Promise<void> {
  const { error } = await supabase.rpc("ckd_annuler", { p_id: id });
  if (error) throw error;
}

/** Toutes les propositions de nudge du contrôle encore sans décision. */
export async function envoyerNudgesCkd(controleId: string): Promise<number> {
  const { data, error } = await supabase.rpc("ckd_envoyer_nudges", { p_controle: controleId });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Poste dans Slack les décisions pas encore envoyées aux HMs. */
export async function envoyerAuxHm(controleId: string): Promise<{ envoyees: number; erreurs?: string[] }> {
  return await invoke("ckd", { action: "envoyer", controle_id: controleId });
}

export interface VerdictSlackCkd {
  ok: boolean;
  bot?: string;
  canal?: string;
  nom?: string | null;
  membre?: boolean;
  error?: string;
}

export async function verifierSlackCkd(): Promise<VerdictSlackCkd> {
  return await invoke<VerdictSlackCkd>("ckd", { action: "verifier_slack" });
}

export interface ArretCkd {
  compte_id: string;
  raison: "ne_pas_renouveler" | "recreer";
  prevu_at: string;
  fait_at: string | null;
  annule_at: string | null;
}

export async function listerArrets(compteIds: string[]): Promise<ArretCkd[]> {
  if (compteIds.length === 0) return [];
  const { data, error } = await supabase
    .from("ckd_arrets")
    .select("compte_id, raison, prevu_at, fait_at, annule_at")
    .in("compte_id", compteIds);
  if (error) throw error;
  return (data ?? []) as ArretCkd[];
}

export async function listerHandles(compteIds: string[]): Promise<{ id: string; handle_tiktok: string | null }[]> {
  if (compteIds.length === 0) return [];
  const { data, error } = await supabase.from("comptes").select("id, handle_tiktok").in("id", compteIds);
  if (error) throw error;
  return (data ?? []) as { id: string; handle_tiktok: string | null }[];
}

export type MotifNudge = "reveil" | "surveiller" | "discipline" | "absent";
export const MOTIFS_NUDGE: readonly MotifNudge[] = ["reveil", "surveiller", "discipline", "absent"];
export type TextesNudges = Partial<Record<MotifNudge, { titre: string; corps: string }>>;

export async function lireTextesNudges(): Promise<TextesNudges> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "ckd_nudges").maybeSingle();
  if (error) throw error;
  return (data?.valeur ?? {}) as TextesNudges;
}

export async function enregistrerTextesNudges(textes: TextesNudges): Promise<void> {
  const { error } = await supabase.from("reglages").upsert({ cle: "ckd_nudges", valeur: textes }, { onConflict: "cle" });
  if (error) throw error;
}

export async function lireCanalSlack(): Promise<string> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "ckd_slack").maybeSingle();
  if (error) throw error;
  return String((data?.valeur as { canal?: string } | null)?.canal ?? "");
}

export async function enregistrerCanalSlack(canal: string): Promise<void> {
  const { error } = await supabase
    .from("reglages")
    .upsert({ cle: "ckd_slack", valeur: { canal: canal.trim() } }, { onConflict: "cle" });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Historique des décisions et leur devenir (0329)
// ---------------------------------------------------------------------------

/** Les chiffres d'une période (sans la liste des posts). */
export interface ChiffresCkd {
  du?: string;
  au?: string;
  attendus?: number;
  publies?: number;
  mesures?: number;
  morts?: number;
  bons?: number;
  mediane?: number | null;
  moyenne?: number | null;
}

export interface HistoriqueCkd {
  id: string;
  type: TypeControle;
  jour: string;
  regle: RegleCkd;
  action: ActionCkd;
  decision: DecisionCkd;
  decision_par: string | null;
  decision_at: string | null;
  note: string | null;
  compte_id: string;
  poster_id: string;
  hm_id: string | null;
  pays: string | null;
  handle: string | null;
  nouveau_compte_id: string | null;
  nouveau_handle: string | null;
  /** Les chiffres de la proposition, figés au contrôle. */
  avant: ChiffresCkd;
  mediane_ref: number | null;
  /** Les 2 semaines suivies (du lundi après le contrôle au dimanche d'après). */
  du: string;
  au: string;
  complet: boolean;
  /** Le même compte sur ces 2 semaines (null : pas commencé, ou compte arrêté). */
  apres: ChiffresCkd | null;
  /** Le compte créé par Recréer ou Doubler. */
  apres_nouveau: ChiffresCkd | null;
  arrete_at: string | null;
}

export async function listerHistorique(semaines = 12): Promise<HistoriqueCkd[]> {
  const { data, error } = await supabase.rpc("ckd_historique", { p_semaines: semaines });
  if (error) throw error;
  return ((data ?? []) as HistoriqueCkd[]).map((h) => ({
    ...h,
    mediane_ref: h.mediane_ref === null ? null : Number(h.mediane_ref),
  }));
}
