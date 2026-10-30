/**
 * Relecture native : relecteurs, fiches des applications, interrupteurs
 * (migration 0376) et banque d'exemples natifs (0423). Le questionnaire et le
 * kit ont été retirés (0608) : un relecteur corrigera les posts publiés. Rien
 * ici ne touche la production : l'espace relecteur est fermé et la production
 * coupée tant que l'admin ne les ouvre pas.
 */
import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

import type { StatutRelecteur } from "./logique";

export interface Relecteur {
  id: string;
  profile_id: string;
  langue: string;
  statut: StatutRelecteur;
  note: string | null;
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
const COLONNES_RELECTEUR = "id, profile_id, langue, statut, note, created_at";

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
// Fiches langue et fiches label (admin) : `bleo_fiches`, une ligne par version
// ---------------------------------------------------------------------------

export interface FicheVersionnee {
  /** La langue (fiche langue) ou le nom du label (fiche label). */
  cle: string;
  contenu: string;
  version: number;
  auteur: string | null;
  created_at: string;
  /** Nombre de versions gardées. */
  versions: number;
}

/** La dernière version de chaque fiche d'une sorte, avec le nombre de versions. */
async function dernieresFiches(sorte: "langue" | "label"): Promise<FicheVersionnee[]> {
  const { data, error } = await supabase
    .from("bleo_fiches")
    .select("cle, version, contenu, auteur, created_at")
    .eq("sorte", sorte)
    .order("cle", { ascending: true })
    .order("version", { ascending: false })
    .limit(5000);
  if (error) throw error;
  const parCle = new Map<string, FicheVersionnee>();
  for (const f of (data ?? []) as Omit<FicheVersionnee, "versions">[]) {
    const deja = parCle.get(f.cle);
    if (deja) deja.versions += 1;
    else parCle.set(f.cle, { ...f, versions: 1 });
  }
  return [...parCle.values()];
}

/** Fiches langue (0619, rangées dans `bleo_fiches` depuis 0621). */
export function listerFichesLangue(): Promise<FicheVersionnee[]> {
  return dernieresFiches("langue");
}

/** Enregistre une nouvelle version de la fiche d'une langue ; les anciennes restent. */
export async function enregistrerFicheLangue(langue: string, contenu: string): Promise<void> {
  const { data: derniere, error: erreurLecture } = await supabase
    .from("bleo_fiches")
    .select("version")
    .eq("sorte", "langue")
    .eq("cle", langue)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erreurLecture) throw erreurLecture;
  const { data: session } = await supabase.auth.getUser();
  const { error } = await supabase.from("bleo_fiches").insert({
    sorte: "langue",
    cle: langue,
    version: ((derniere?.version as number | undefined) ?? 0) + 1,
    contenu,
    auteur: session.user?.email ?? "admin",
  });
  if (error) {
    if (error.code === "23505") throw new Error("Une autre version vient d'être enregistrée : recharge la page.");
    throw error;
  }
}

/** Fiches label : écrites chaque lundi par `cta-formes` (0621). */
export function listerFichesLabel(): Promise<FicheVersionnee[]> {
  return dernieresFiches("label");
}

export interface AvancementCta {
  /** Textes de CTA publiés déjà classés dans une forme. */
  classes: number;
  /** Textes encore à classer (la tâche planifiée passe toutes les 2 minutes). */
  a_classer: number;
}

export async function lireAvancementCta(): Promise<AvancementCta> {
  const { data, error } = await supabase.rpc("cta_avancement");
  if (error) throw error;
  const a = (data ?? {}) as Partial<AvancementCta>;
  return { classes: Number(a.classes ?? 0), a_classer: Number(a.a_classer ?? 0) };
}

/** Recalcule tout de suite les chiffres, les poids et les fiches label. */
export function calculerFichesLabel(): Promise<{ semaine: string; fiches: number; lignes: number }> {
  return invoke("cta-formes", { lundi: {} });
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

// ---------------------------------------------------------------------------
// Banque d'exemples natifs (0423)
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
  /** Pris par un passage du serveur : la lecture est en cours. */
  pris_le: string | null;
  created_at: string;
  updated_at: string;
}

/** Un compte collé, cherché sur le serveur par la tâche planifiée (0618). */
export interface CompteNatif {
  id: string;
  langue: string;
  pseudo: string;
  label_id: string | null;
  statut: "en_attente" | "fait" | "erreur";
  /** Posts listés par Apify (ou slideshows de la page publique, si Apify a échoué). */
  posts: number | null;
  slideshows: number | null;
  /** Faux quand aucun post n'a été reconnu comme slideshow : la lecture fera le tri. */
  verifies: boolean | null;
  /** Slideshows nouveaux dans la banque. */
  ajoutes: number | null;
  /** En attente : l'erreur du dernier essai, réessayé à la minute suivante. */
  erreur: string | null;
  /** Pris par un passage du serveur : la recherche est en cours. */
  pris_le: string | null;
  created_at: string;
}

export interface ResumeAjoutExemples {
  /** Liens de slideshows ajoutés à la banque, en attente de lecture. */
  ajoutes: number;
  deja: number;
  /** Comptes mis en file de recherche. */
  comptes: number;
  /** Comptes déjà en file pour cette langue. */
  dejaEnFile: number;
  ignorees: string[];
}

/** Toute la banque, toutes langues (quelques centaines de lignes au plus). */
export async function listerExemplesNatifs(): Promise<ExempleNatif[]> {
  const { data, error } = await supabase
    .from("exemples_natifs")
    .select("id, langue, source_url, handle, label_id, slides, vues, statut, erreur, pris_le, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as ExempleNatif[];
}

/** Les comptes collés, du plus récent au plus ancien. */
export async function listerComptesNatifs(): Promise<CompteNatif[]> {
  const { data, error } = await supabase
    .from("exemples_natifs_comptes")
    .select("id, langue, pseudo, label_id, statut, posts, slideshows, verifies, ajoutes, erreur, pris_le, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as CompteNatif[];
}

/**
 * Note des liens ou des comptes collés et rend la main aussitôt : le serveur
 * cherche les comptes et lit les slideshows tout seul, page fermée ou non.
 */
export async function ajouterExemplesNatifs(
  langue: string,
  labelId: string | null,
  texte: string,
): Promise<ResumeAjoutExemples> {
  const r = await invoke<ResumeAjoutExemples>("exemples-natifs", { ajouter: { langue, labelId, texte } });
  if (r.ajoutes + r.deja + r.comptes + r.dejaEnFile === 0) {
    throw new Error("Aucun lien TikTok ni compte reconnu.");
  }
  return r;
}

/** Remet un exemple en file : le serveur le relit dans la minute. */
export async function relireExempleNatif(id: string): Promise<void> {
  await invoke("exemples-natifs", { relire: { ids: [id] } });
}

/** Retire du suivi les comptes déjà cherchés d'une langue (leurs slideshows restent dans la banque). */
export async function effacerSuiviComptes(langue: string): Promise<void> {
  const { error } = await supabase
    .from("exemples_natifs_comptes")
    .delete()
    .eq("langue", langue)
    .neq("statut", "en_attente");
  if (error) throw error;
}

export async function majLabelExemple(id: string, labelId: string | null): Promise<void> {
  const { error } = await supabase.from("exemples_natifs").update({ label_id: labelId }).eq("id", id);
  if (error) throw error;
}

export async function supprimerExempleNatif(id: string): Promise<void> {
  const { error } = await supabase.from("exemples_natifs").delete().eq("id", id);
  if (error) throw error;
}
