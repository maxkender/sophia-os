import { supabase } from "@/lib/supabase/client";

/**
 * Système du 2 nov., partie E (0406) : les messages reçus des posteurs (DM
 * Slack, boutons, Upwork), classés par l'OS, et ce qu'il en a fait.
 */
export type CasReponse = "stop" | "travail" | "paie" | "absent" | "a_lire" | "accuse";
export const CAS_REPONSE: readonly CasReponse[] = ["stop", "travail", "paie", "absent", "a_lire", "accuse"];

export interface ReponsePosteur {
  id: string;
  poster_id: string;
  poster_nom: string | null;
  hm_prenom: string | null;
  canal: "slack" | "bouton" | "upwork";
  texte: string | null;
  recu_at: string;
  statut: "a_classer" | "classe" | "erreur";
  cas: CasReponse | null;
  cas_ia: string | null;
  confiance: number | null;
  sous_cas: string | null;
  liste: "paie" | "a_lire" | null;
  reponse_texte: string | null;
  reponse_statut: "simule" | "envoye" | "erreur" | "limite" | "aucune" | null;
  action: string | null;
  erreur: string | null;
  lu_at: string | null;
  corrige_cas: CasReponse | null;
  upwork_contrat_url: string | null;
}

export async function lireReponses(depuis: string): Promise<ReponsePosteur[]> {
  const { data, error } = await supabase.rpc("reponses_liste", { p_depuis: depuis });
  if (error) throw error;
  return (data ?? []) as ReponsePosteur[];
}

/** « Mauvais cas » (le bon cas, noté) et/ou « Lu » (sort des listes). Rien ne part au posteur. */
export async function corrigerReponse(id: string, cas: CasReponse | null, lu = false): Promise<void> {
  const { error } = await supabase.rpc("reponse_corriger", { p_id: id, p_cas: cas, p_lu: lu });
  if (error) throw error;
}

/** Les textes des réponses automatiques (réglages, en anglais). */
export const CLES_TEXTES_REPONSES = {
  upwork: "reponse_texte_upwork",
  augmentation: "reponse_texte_augmentation",
  propre_compte: "reponse_texte_propre_compte",
  absent: "reponse_texte_absent",
} as const;
export type TexteReponse = keyof typeof CLES_TEXTES_REPONSES;

export async function lireTextesReponses(): Promise<Record<TexteReponse, string>> {
  const { data, error } = await supabase.from("reglages").select("cle, valeur").in("cle", Object.values(CLES_TEXTES_REPONSES));
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  return Object.fromEntries(
    Object.entries(CLES_TEXTES_REPONSES).map(([k, cle]) => [k, typeof v[cle] === "string" ? (v[cle] as string) : ""]),
  ) as Record<TexteReponse, string>;
}

export async function enregistrerTextesReponses(textes: Record<TexteReponse, string>): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const par = { updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from("reglages")
    .upsert((Object.keys(CLES_TEXTES_REPONSES) as TexteReponse[]).map((k) => ({ cle: CLES_TEXTES_REPONSES[k], valeur: textes[k], ...par })));
  if (error) throw error;
}

/** Prompt 22, partie 7 : un Kill automatique arrêté par une réaction du posteur (kills_auto, raison « réaction reçue »). */
export interface KillArrete {
  poster_id: string;
  annule_at: string | null;
}

export async function lireKillsArretes(posteurs: readonly string[]): Promise<KillArrete[]> {
  if (posteurs.length === 0) return [];
  const { data, error } = await supabase
    .from("kills_auto")
    .select("poster_id, annule_at")
    .in("poster_id", [...posteurs])
    .eq("statut", "annule")
    .eq("raison", "réaction reçue");
  if (error) throw error;
  return (data ?? []) as KillArrete[];
}

/** L'identifiant Slack de chaque posteur : le lien vers sa conversation Slack. */
export async function lireSlackPosteurs(posteurs: readonly string[]): Promise<Map<string, string>> {
  if (posteurs.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, slack_user_id").in("id", [...posteurs]);
  if (error) throw error;
  return new Map(
    (data ?? [])
      .filter((p) => typeof p.slack_user_id === "string" && p.slack_user_id)
      .map((p) => [p.id as string, p.slack_user_id as string]),
  );
}
