/**
 * Relecture native · étape 1 (migration 0376) : relecteurs, fiches des
 * applications, réponses au questionnaire et interrupteurs. Rien ici ne touche
 * la production : l'espace relecteur est fermé et la production coupée tant
 * que l'admin ne les ouvre pas.
 */
import { supabase } from "@/lib/supabase/client";

import type { ChoixMot, ReponseQuestionnaire, StatutRelecteur } from "./logique";

export interface Relecteur {
  id: string;
  profile_id: string;
  langue: string;
  statut: StatutRelecteur;
  note: string | null;
  questionnaire_termine_at: string | null;
  created_at: string;
}

export interface RelecteurAvecNom extends Relecteur {
  prenom: string | null;
  nom: string | null;
  email: string | null;
}

export interface FicheAppli {
  application_id: string;
  contenu: string;
  presentation_relecteur: string;
  updated_at: string | null;
}

export interface ReglageRelectureNative {
  espace_ouvert: boolean;
  /** Coupée à l'étape 1 : aucune fonction ne la lit encore. */
  production: boolean;
}

const CLE_REGLAGE = "relecture_native";
const COLONNES_RELECTEUR = "id, profile_id, langue, statut, note, questionnaire_termine_at, created_at";

// ---------------------------------------------------------------------------
// Interrupteurs
// ---------------------------------------------------------------------------

export async function lireReglageRelecture(): Promise<ReglageRelectureNative> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", CLE_REGLAGE).maybeSingle();
  if (error) throw error;
  const v = (data?.valeur ?? {}) as Partial<ReglageRelectureNative>;
  return { espace_ouvert: v.espace_ouvert === true, production: v.production === true };
}

/** Ouvre ou ferme l'espace relecteur. La production reste coupée (étape 4). */
export async function ecrireEspaceOuvert(ouvert: boolean): Promise<void> {
  const actuel = await lireReglageRelecture();
  const { error } = await supabase
    .from("reglages")
    .upsert(
      { cle: CLE_REGLAGE, valeur: { ...actuel, espace_ouvert: ouvert, production: false }, updated_at: new Date().toISOString() },
      { onConflict: "cle" },
    );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Relecteurs (admin)
// ---------------------------------------------------------------------------

export async function listerRelecteurs(): Promise<RelecteurAvecNom[]> {
  const { data, error } = await supabase
    .from("relecteurs_natifs")
    .select(`${COLONNES_RELECTEUR}, profiles(prenom, nom, email)`)
    .order("langue", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((ligne) => {
    const r = ligne as Relecteur & {
      profiles?: { prenom?: string | null; nom?: string | null; email?: string | null } | null;
    };
    return {
      id: r.id,
      profile_id: r.profile_id,
      langue: r.langue,
      statut: r.statut,
      note: r.note,
      questionnaire_termine_at: r.questionnaire_termine_at,
      created_at: r.created_at,
      prenom: r.profiles?.prenom ?? null,
      nom: r.profiles?.nom ?? null,
      email: r.profiles?.email ?? null,
    };
  });
}

export async function ajouterRelecteur(profileId: string, langue: string): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("relecteurs_natifs")
    .insert({ profile_id: profileId, langue, statut: "invite", created_by: session.user?.id ?? null });
  if (error) {
    if (error.code === "23505") throw new Error("Ce posteur est déjà relecteur pour cette langue.");
    throw error;
  }
}

export async function majRelecteur(id: string, patch: { statut?: StatutRelecteur; note?: string | null }): Promise<void> {
  const { error } = await supabase
    .from("relecteurs_natifs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function supprimerRelecteur(id: string): Promise<void> {
  const { error } = await supabase.from("relecteurs_natifs").delete().eq("id", id);
  if (error) throw error;
}

/** Toutes les réponses, pour l'avancement de chaque relecteur (une ligne par question). */
export async function listerToutesReponses(): Promise<Array<ReponseQuestionnaire & { relecteur_id: string }>> {
  const { data, error } = await supabase
    .from("relecteur_questionnaire")
    .select("relecteur_id, question_cle, choix, reponse, updated_at")
    .limit(20000);
  if (error) throw error;
  return (data ?? []) as Array<ReponseQuestionnaire & { relecteur_id: string }>;
}

// ---------------------------------------------------------------------------
// Fiches des applications (admin)
// ---------------------------------------------------------------------------

export async function listerFichesAppli(): Promise<FicheAppli[]> {
  const { data, error } = await supabase
    .from("fiches_appli")
    .select("application_id, contenu, presentation_relecteur, updated_at");
  if (error) throw error;
  return (data ?? []) as FicheAppli[];
}

export async function enregistrerFicheAppli(
  applicationId: string,
  contenu: string,
  presentationRelecteur: string,
): Promise<void> {
  const { error } = await supabase
    .from("fiches_appli")
    .upsert(
      { application_id: applicationId, contenu, presentation_relecteur: presentationRelecteur },
      { onConflict: "application_id" },
    );
  if (error) throw error;
}

/** Nombre de versions enregistrées par application (historique gardé en base). */
export async function compterVersionsFiches(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("fiches_appli_versions").select("application_id").limit(5000);
  if (error) throw error;
  const n: Record<string, number> = {};
  for (const v of data ?? []) n[v.application_id as string] = (n[v.application_id as string] ?? 0) + 1;
  return n;
}

// ---------------------------------------------------------------------------
// Espace du relecteur (posteur)
// ---------------------------------------------------------------------------

/** Les lignes de relecteur du posteur connecté (RLS : seulement les siennes). */
export async function mesRelecteurs(): Promise<Relecteur[]> {
  const { data, error } = await supabase
    .from("relecteurs_natifs")
    .select(COLONNES_RELECTEUR)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Relecteur[];
}

export async function lireReponses(relecteurId: string): Promise<ReponseQuestionnaire[]> {
  const { data, error } = await supabase
    .from("relecteur_questionnaire")
    .select("question_cle, choix, reponse, updated_at")
    .eq("relecteur_id", relecteurId);
  if (error) throw error;
  return (data ?? []) as ReponseQuestionnaire[];
}

export async function enregistrerReponse(
  relecteurId: string,
  questionCle: string,
  reponse: string,
  choix: ChoixMot | null = null,
): Promise<void> {
  const { error } = await supabase.from("relecteur_questionnaire").upsert(
    {
      relecteur_id: relecteurId,
      question_cle: questionCle,
      reponse,
      choix,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "relecteur_id,question_cle" },
  );
  if (error) throw error;
}

export async function terminerQuestionnaire(relecteurId: string): Promise<void> {
  const { error } = await supabase.rpc("terminer_questionnaire_relecteur", { p_relecteur_id: relecteurId });
  if (error) throw error;
}
