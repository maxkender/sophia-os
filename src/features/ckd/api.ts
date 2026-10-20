import { supabase } from "@/lib/supabase/client";

/**
 * Check, Kill or Double (migration 0326). Le calcul vit en SQL : le jeudi 6 h
 * (nudges des nouveaux comptes) et le samedi 6 h (kill, recréer, doubler), le
 * cron enregistre les propositions. La page les lit, relance un calcul et règle
 * les seuils. Les décisions arrivent avec la PR 2.
 */

export type TypeControle = "jeudi" | "samedi";
export type RegleCkd = "jeudi" | "premiere_semaine" | "anciens" | "doubler";
export type ActionCkd = "nudge" | "recreer" | "ne_pas_renouveler" | "doubler";
export type SourceReglage = "defaut" | "pays" | "label" | "pays_label";

export interface ControleCkd {
  id: string;
  type: TypeControle;
  jour: string;
  lance_at: string;
  nb_propositions: number;
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
  decision: string | null;
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
    .select("id, type, jour, lance_at, nb_propositions")
    .order("jour", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as ControleCkd[];
}

export async function listerPropositions(controleId: string): Promise<PropositionCkd[]> {
  const { data, error } = await supabase
    .from("ckd_propositions")
    .select(
      "id, controle_id, type, jour, regle, action, compte_id, poster_id, hm_id, pays, langue, label_id, application, donnees, decision",
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

export async function enregistrerSlackHm(profileId: string, slackUserId: string | null) {
  const { error } = await supabase
    .from("hm_slack")
    .upsert({ profile_id: profileId, slack_user_id: slackUserId }, { onConflict: "profile_id" });
  if (error) throw error;
}
