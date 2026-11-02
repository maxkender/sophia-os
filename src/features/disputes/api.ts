import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

/**
 * Prompt 21, partie R : la page « Disputes ». Les contestations (0428) et les
 * retours contestés (reviews, 0340) ; le dossier de chacune ; les actions.
 */
export type TypeContestation = "paie" | "kill" | "posts" | "lien" | "message" | "autre" | "feedback";
export const TYPES_MANUELS: readonly Exclude<TypeContestation, "feedback">[] = ["paie", "kill", "posts", "lien", "message", "autre"];

export interface Contestation {
  id: string;
  /** contestation (table contestations) | retour (retour contesté, onglet Feedback). */
  genre: "contestation" | "retour";
  poster_id: string;
  nom: string | null;
  hm: string | null;
  cohorte: string | null;
  type: TypeContestation;
  source: "message" | "tableau" | "paie_os" | "manuel";
  canal: string | null;
  texte: string | null;
  recu_at: string;
  semaine: string | null;
  statut: "ouverte" | "fermee";
  accuse_statut: string;
  verdict: Verdict | null;
  ferme_raison: string | null;
  ferme_at: string | null;
  reponse_statut: string | null;
  slack_user_id: string | null;
  upwork_contrat: string | null;
}

export type Verdict = "os_tort" | "os_raison";

export interface PostDossier {
  id: string;
  jour: string;
  publie_at: string | null;
  url: string | null;
  resolution: string | null;
  confirme: boolean;
  compte: string | null;
  compte_id: string;
}

export interface LignePaieDossier {
  id: string;
  semaine: string;
  montant: number | null;
  action: string | null;
  statut: string | null;
  raison: string | null;
  paye_at: string | null;
  exclu: boolean;
  faits: number | null;
  prevus: number | null;
  manques: number | null;
  nb_comptes: number | null;
  tarif: number | null;
  suivante_faite_at: string | null;
}

export interface PaiementDossier {
  semaine: string;
  statut: string;
  jalon_approuve: string | null;
  montant_approuve: number | null;
  jalon_finance: string | null;
  montant_finance: number | null;
  erreur: string | null;
  maj_at: string;
}

export interface MessageDossier {
  at: string;
  type: string;
  canal: string;
  texte: string | null;
  reponse_at: string | null;
  reponse?: string | null;
  lu_at?: string | null;
  erreur: string | null;
}

export interface RecuDossier {
  at: string;
  canal: string;
  texte: string | null;
  cas: string | null;
  reponse: string | null;
  reponse_statut: string | null;
}

export interface Dossier {
  contestation: { id: string; type: TypeContestation; recu_at: string; texte: string | null; journal: { action: string; detail: string | null; at: string }[] };
  semaine: string;
  prenom: string | null;
  actif: boolean | null;
  contrat_id: string | null;
  contrat_termine: boolean;
  posts: PostDossier[];
  paie: LignePaieDossier[];
  paiements: PaiementDossier[];
  messages: MessageDossier[];
  recus: RecuDossier[];
  arret: { id: string; source: string; motif: string | null; statut: string; created_at: string; etapes: { action: string; statut: string; detail?: string }[]; annule_at: string | null } | null;
  kill: { id: string; etape: string; statut: string; raison: string | null; message_at: string | null; prevu_at: string | null; annule_at: string | null } | null;
}

export async function lireContestations(): Promise<Contestation[]> {
  const { data, error } = await supabase.rpc("contestations_liste");
  if (error) throw error;
  return (data ?? []) as Contestation[];
}

/** Le compteur du menu, d'Overview et de Logs. */
export async function compterContestations(): Promise<{ ouvertes: number; plus_24h: number }> {
  const { data, error } = await supabase.rpc("contestations_compte");
  if (error) throw error;
  const r = (Array.isArray(data) ? data[0] : data) as { ouvertes: number; plus_24h: number } | null;
  return { ouvertes: Number(r?.ouvertes ?? 0), plus_24h: Number(r?.plus_24h ?? 0) };
}

export async function lireDossier(id: string): Promise<Dossier> {
  const { data, error } = await supabase.rpc("contestation_dossier", { p_id: id });
  if (error) throw error;
  return data as Dossier;
}

export type ActionContestation = "fermer" | "rouvrir_contestation" | "annuler_kill" | "rouvrir" | "compter_post" | "noter";

export async function agirContestation(id: string, action: ActionContestation, valeur?: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc("contestation_agir", { p_id: id, p_action: action, p_valeur: valeur ?? null });
  if (error) throw error;
  return String(data ?? "");
}

/** « This is a dispute » sur un message reçu. */
export async function creerContestation(reponseId: string, type: Exclude<TypeContestation, "feedback">): Promise<string> {
  const { data, error } = await supabase.rpc("contestation_creer", { p_reponse_id: reponseId, p_type: type });
  if (error) throw error;
  return String(data);
}

/** « Reply » : dans le canal du message (Upwork, sinon Slack), par recrues-check. */
export async function repondreContestation(id: string, texte: string): Promise<{ canal: string }> {
  const r = await invoke<{ ok: boolean; error?: string; canal?: string }>("recrues-check", { action: "contestation_repondre", id, texte });
  if (!r.ok) throw new Error(r.error ?? "réponse pas partie");
  return { canal: r.canal ?? "" };
}

/** Les textes aux posteurs (anglais, modifiables). */
export const CLES_TEXTES_CONTESTATION = {
  accuse: "contestation_accuse_texte",
  os_tort: "contestation_texte_os_tort",
  os_raison: "contestation_texte_os_raison",
} as const;
export type CleTexteContestation = keyof typeof CLES_TEXTES_CONTESTATION;

export async function lireTextesContestation(): Promise<Record<CleTexteContestation, string>> {
  const { data, error } = await supabase.from("reglages").select("cle, valeur").in("cle", Object.values(CLES_TEXTES_CONTESTATION));
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  const texte = (cle: string) => (typeof v[cle] === "string" ? (v[cle] as string) : "");
  return {
    accuse: texte(CLES_TEXTES_CONTESTATION.accuse),
    os_tort: texte(CLES_TEXTES_CONTESTATION.os_tort),
    os_raison: texte(CLES_TEXTES_CONTESTATION.os_raison),
  };
}

export async function enregistrerTexteContestation(cle: CleTexteContestation, texte: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("reglages")
    .upsert({ cle: CLES_TEXTES_CONTESTATION[cle], valeur: texte, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Prompt 26 : la raison du « Kill & don't pay » du samedi, si le freelance conteste. */
export async function lireKillSansPaie(posterId: string): Promise<{ semaine: string; raison: string; montant: number | null } | null> {
  const { data, error } = await supabase.from("paie_kills_sans_paie").select("semaine, raison, montant")
    .eq("poster_id", posterId).is("annule_at", null).order("semaine", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as { semaine: string; raison: string; montant: number | null } | null) ?? null;
}
