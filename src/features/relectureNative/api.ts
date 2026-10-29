/**
 * Relecture native · étape 1 (migration 0376) : relecteurs, fiches des
 * applications, réponses au questionnaire et interrupteurs. Étape 2 (0377) :
 * le kit natif. Rien ici ne touche la production : l'espace relecteur est
 * fermé et la production coupée tant que l'admin ne les ouvre pas.
 */
import { invoke } from "@/features/moteur/api";
import type { ContenuSlide } from "@/features/moteur/types";
import { supabase } from "@/lib/supabase/client";

import { slidesKitDepuisContenu, type EcritureKit, type PostKit, type VoieKit } from "./kit";
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
// Table Notion « Relecteurs natifs »
// ---------------------------------------------------------------------------

/** La page Notion « Relecteurs natifs par pays » (une ligne par langue). */
export const URL_NOTION_RELECTEURS = "https://www.notion.so/406241308d6681bc83eec71a78726676";

export interface ResumeSynchroNotion {
  ok?: boolean;
  ecrites?: number;
  secret_manquant?: string;
}

/**
 * Recopie l'état des relecteurs dans la table Notion (fonction
 * `notion-relecteurs`). Sans argument : la fonction relit tout l'OS et
 * n'écrit que les lignes qui changent.
 */
export function synchroniserNotion(): Promise<ResumeSynchroNotion> {
  return invoke<ResumeSynchroNotion>("notion-relecteurs", {});
}

/** Côté relecteur : la synchro part en fond, une erreur n'a pas à le gêner. */
export function synchroniserNotionEnFond(): void {
  synchroniserNotion().catch(() => undefined);
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

// ---------------------------------------------------------------------------
// Kit natif (étape 2, migration 0377)
// ---------------------------------------------------------------------------

const COLONNES_KIT =
  "id, rang, contenu_id, application_id, voie, slide_cta, consigne_cta, a_adapter, source_url, slides_en, actif";
const COLONNES_ECRITURE = "relecteur_id, kit_id, slides, remarque, rendu_at, updated_at";

/** Les posts du kit. L'admin les voit tous ; un relecteur, ceux que la RLS lui ouvre. */
export async function listerKit(): Promise<PostKit[]> {
  const { data, error } = await supabase.from("kit_natif").select(COLONNES_KIT).order("rang", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PostKit[];
}

export async function majPostKit(
  id: string,
  patch: Partial<Pick<PostKit, "rang" | "application_id" | "voie" | "slide_cta" | "consigne_cta" | "a_adapter" | "actif">>,
): Promise<void> {
  const { error } = await supabase.from("kit_natif").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") throw new Error("Ce rang est déjà pris par un autre post du kit.");
    throw error;
  }
}

/** Ajoute un contenu au kit, au rang suivant, avec la copie de ses slides anglaises. */
export async function ajouterPostKit(contenuId: string, applicationId: string, voie: VoieKit): Promise<void> {
  const { data: contenu, error: e1 } = await supabase
    .from("contenus")
    .select("id, source_url, structure_slides")
    .eq("id", contenuId)
    .maybeSingle();
  if (e1) throw e1;
  if (!contenu) throw new Error("Aucun contenu avec cet identifiant.");
  const { data: langue, error: e2 } = await supabase
    .from("contenu_langues")
    .select("slides, slides_base")
    .eq("contenu_id", contenuId)
    .eq("langue", "en")
    .maybeSingle();
  if (e2) throw e2;
  const slides = slidesKitDepuisContenu(langue, contenu.structure_slides as ContenuSlide[] | null);
  if (slides.length === 0) throw new Error("Ce contenu n'a pas de slides en anglais.");

  const { data: dernier, error: e3 } = await supabase
    .from("kit_natif")
    .select("rang")
    .order("rang", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e3) throw e3;
  const { error } = await supabase.from("kit_natif").insert({
    rang: (dernier?.rang ?? 0) + 1,
    contenu_id: contenuId,
    application_id: applicationId,
    voie,
    source_url: contenu.source_url ?? null,
    slides_en: slides,
  });
  if (error) throw error;
}

/** Retire un post du kit, et les versions déjà écrites dessus. */
export async function supprimerPostKit(id: string): Promise<void> {
  const { error } = await supabase.from("kit_natif").delete().eq("id", id);
  if (error) throw error;
}

/** Toutes les versions écrites (admin), ou celles d'un relecteur. */
export async function listerEcrituresKit(relecteurId?: string): Promise<EcritureKit[]> {
  let requete = supabase.from("kit_natif_ecritures").select(COLONNES_ECRITURE).limit(5000);
  if (relecteurId) requete = requete.eq("relecteur_id", relecteurId);
  const { data, error } = await requete;
  if (error) throw error;
  return (data ?? []) as EcritureKit[];
}

/** Enregistre la version d'un relecteur pour un post (slides, remarque, rendu). */
export async function enregistrerEcritureKit(
  relecteurId: string,
  kitId: string,
  ecriture: Pick<EcritureKit, "slides" | "remarque" | "rendu_at">,
): Promise<void> {
  const { error } = await supabase
    .from("kit_natif_ecritures")
    .upsert(
      { relecteur_id: relecteurId, kit_id: kitId, ...ecriture },
      { onConflict: "relecteur_id,kit_id" },
    );
  if (error) throw error;
}

export interface PresentationAppli {
  application_id: string;
  nom: string | null;
  slug: string;
  presentation: string;
}

/** « What is micabo? » : la présentation courte de chaque appli, pour le relecteur. */
export async function presentationsApplis(): Promise<PresentationAppli[]> {
  const { data, error } = await supabase.rpc("presentations_applis_relecteur");
  if (error) throw error;
  return (data ?? []) as PresentationAppli[];
}

// ---------------------------------------------------------------------------
// Banque d'exemples natifs (0380)
// ---------------------------------------------------------------------------

export type StatutExempleNatif = "en_attente" | "pret" | "erreur";

export interface ExempleNatif {
  id: string;
  langue: string;
  source_url: string;
  handle: string | null;
  label_id: string | null;
  slides: Array<{ position: number; texte: string }>;
  vues: number | null;
  statut: StatutExempleNatif;
  erreur: string | null;
  created_at: string;
}

export interface ResumeAjoutExemples {
  ajoutes: number;
  deja: number;
  comptes: Array<{ pseudo: string; slideshows: number; erreur?: string }>;
  ignorees: string[];
}

/** Toute la banque, toutes langues (quelques centaines de lignes au plus). */
export async function listerExemplesNatifs(): Promise<ExempleNatif[]> {
  const { data, error } = await supabase
    .from("exemples_natifs")
    .select("id, langue, source_url, handle, label_id, slides, vues, statut, erreur, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as ExempleNatif[];
}

/** Ajoute des liens ou des comptes collés ; rien n'est encore lu. */
export function ajouterExemplesNatifs(langue: string, labelId: string | null, texte: string): Promise<ResumeAjoutExemples> {
  return invoke<ResumeAjoutExemples>("exemples-natifs", { ajouter: { langue, labelId, texte } });
}

/** Récupère un slideshow et lit le texte de ses slides. */
export function lireExempleNatif(id: string): Promise<{ statut: StatutExempleNatif; erreur?: string }> {
  return invoke<{ statut: StatutExempleNatif; erreur?: string }>("exemples-natifs", { traiter: { id } });
}

export async function majLabelExemple(id: string, labelId: string | null): Promise<void> {
  const { error } = await supabase.from("exemples_natifs").update({ label_id: labelId }).eq("id", id);
  if (error) throw error;
}

export async function supprimerExempleNatif(id: string): Promise<void> {
  const { error } = await supabase.from("exemples_natifs").delete().eq("id", id);
  if (error) throw error;
}
