import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

/**
 * Prompt 21, partie Q : la FAQ par situation (0424). Les situations, les
 * questions et leurs réponses par situation se lisent et s'écrivent ici
 * (tables réservées à l'admin, RLS) ; l'onglet Test passe par `faq-admin`
 * (action « tester »), qui n'écrit et n'envoie rien.
 */

export type ModeSituations = "off" | "test" | "on";

export interface Situation {
  cle: string;
  libelle: string;
  description: string | null;
  ordre: number;
  actif: boolean;
  auto: boolean;
}

export interface ReponseFaqSituation {
  id: string;
  entree_id: string;
  /** null : la réponse par défaut. */
  situation: string | null;
  texte: string;
  actif: boolean;
  updated_at: string;
}

export interface EntreeFaqSituation {
  id: string;
  cle: string | null;
  question: string;
  formulations: string[];
  actif: boolean;
  updated_at: string;
  reponses: ReponseFaqSituation[];
}

export interface ResultatTest {
  situation: string | null;
  situations: string[];
  entree: { id: string; question: string } | null;
  correspondance: "locale" | "ia" | null;
  reponse: { situation: string | null; texte: string; modele: string } | null;
  variables: Record<string, string>;
  sautees: Array<{ situation: string | null; manquantes: string[] }>;
  /** Sans réponse par situation : ce que le cerveau du guide répondrait. */
  cerveau: { decision: string; reponse: string; section: string | null } | null;
}

export interface PosteurTrouve {
  id: string;
  nom: string;
}

export const CLE_SITUATIONS = ["faq", "situations"] as const;

/** Les variables que l'OS remplit (même liste que _shared/faq_situations.ts). */
export const VARIABLES_FAQ = [
  "prenom",
  "lundi_debut",
  "date_debut",
  "ce_qui_manque",
  "posts_semaine",
  "tarif",
  "derniere_paie_montant",
  "derniere_paie_date",
  "milestone_suivante",
  "handle",
] as const;

/** Le mode, lu dans `faq_automatique.situations` ; absent ou inconnu : test, jamais on. */
export function lireModeSituations(valeur: unknown): ModeSituations {
  const v = (valeur && typeof valeur === "object" ? valeur : {}) as Record<string, unknown>;
  return v.situations === "off" || v.situations === "on" ? v.situations : "test";
}

export async function lireModeSituationsAdmin(): Promise<ModeSituations> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "faq_automatique").maybeSingle();
  if (error) throw error;
  return lireModeSituations(data?.valeur);
}

/** Change seulement la clé `situations` : les autres réglages de la FAQ restent tels quels. */
export async function ecrireModeSituations(mode: ModeSituations): Promise<void> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "faq_automatique").maybeSingle();
  if (error) throw error;
  const actuel = (data?.valeur && typeof data.valeur === "object" ? data.valeur : {}) as Record<string, unknown>;
  const { error: e } = await supabase
    .from("reglages")
    .upsert({ cle: "faq_automatique", valeur: { ...actuel, situations: mode }, updated_at: new Date().toISOString() }, {
      onConflict: "cle",
    });
  if (e) throw e;
}

export async function listerSituations(): Promise<Situation[]> {
  const { data, error } = await supabase
    .from("faq_situations")
    .select("cle, libelle, description, ordre, actif, auto")
    .order("ordre", { ascending: true })
    .order("cle", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Situation[];
}

export async function majSituation(cle: string, patch: Partial<Pick<Situation, "libelle" | "description" | "actif">>) {
  const { error } = await supabase
    .from("faq_situations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("cle", cle);
  if (error) throw error;
}

/** « On holiday » → « on_holiday ». */
export function cleDepuisLibelle(libelle: string): string {
  return libelle
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function creerSituation(libelle: string, description: string | null, ordre: number): Promise<string> {
  const cle = cleDepuisLibelle(libelle);
  if (cle.length < 2) throw new Error("Nom trop court");
  const { error } = await supabase
    .from("faq_situations")
    .insert({ cle, libelle: libelle.trim(), description: description?.trim() || null, ordre, auto: false });
  if (error) throw error;
  return cle;
}

export async function listerEntrees(): Promise<EntreeFaqSituation[]> {
  const [e, r] = await Promise.all([
    supabase.from("faq_entrees").select("id, cle, question, formulations, actif, updated_at").order("created_at"),
    supabase.from("faq_reponses").select("id, entree_id, situation, texte, actif, updated_at").limit(2000),
  ]);
  if (e.error) throw e.error;
  if (r.error) throw r.error;
  const reponses = (r.data ?? []) as ReponseFaqSituation[];
  return ((e.data ?? []) as Omit<EntreeFaqSituation, "reponses">[]).map((x) => ({
    ...x,
    formulations: x.formulations ?? [],
    reponses: reponses.filter((y) => y.entree_id === x.id),
  }));
}

export async function creerEntree(question: string, formulations: string[] = []): Promise<string> {
  const { data, error } = await supabase
    .from("faq_entrees")
    .insert({ question: question.trim(), formulations: formulations.map((f) => f.trim()).filter(Boolean) })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function majEntree(id: string, patch: { question?: string; formulations?: string[]; actif?: boolean }) {
  const { error } = await supabase
    .from("faq_entrees")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Écrit la réponse d'une situation (null : par défaut) : la met à jour si elle
 * existe (même retirée, elle revient), sinon la crée. Une seule par situation.
 */
export async function ecrireReponse(entreeId: string, situation: string | null, texte: string): Promise<void> {
  let q = supabase.from("faq_reponses").select("id").eq("entree_id", entreeId);
  q = situation === null ? q.is("situation", null) : q.eq("situation", situation);
  const { data, error } = await q.maybeSingle();
  if (error) throw error;
  const maintenant = new Date().toISOString();
  if (data?.id) {
    const { error: e } = await supabase
      .from("faq_reponses")
      .update({ texte: texte.trim(), actif: true, updated_at: maintenant })
      .eq("id", data.id);
    if (e) throw e;
    return;
  }
  const { error: e } = await supabase.from("faq_reponses").insert({ entree_id: entreeId, situation, texte: texte.trim() });
  if (e) throw e;
}

/** Retirer une réponse : elle ne sert plus, la ligne reste (actif = false). */
export async function retirerReponse(id: string): Promise<void> {
  const { error } = await supabase
    .from("faq_reponses")
    .update({ actif: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** L'onglet Test : rien n'est écrit, rien n'est envoyé. */
export async function testerQuestion(
  question: string,
  cible: { situation: string } | { posterId: string },
): Promise<ResultatTest> {
  return invoke<ResultatTest>("faq-admin", {
    action: "tester",
    question: question.trim(),
    ...("situation" in cible ? { situation: cible.situation } : { poster_id: cible.posterId }),
  });
}

/** Les posteurs dont le nom ou l'e-mail contient le texte (onglet Test). */
export async function chercherPosteurs(texte: string): Promise<PosteurTrouve[]> {
  const t = texte.trim().replace(/[%,()]/g, " ");
  if (t.length < 2) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, prenom, nom, email")
    .or(`prenom.ilike.%${t}%,nom.ilike.%${t}%,email.ilike.%${t}%`)
    .limit(10);
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id as string,
    nom: [p.prenom, p.nom].filter(Boolean).join(" ") || (p.email as string) || (p.id as string).slice(0, 8),
  }));
}

/** Forcer la situation d'un posteur ; null la retire (jusqu'à maintenant, la ligne reste). */
export async function forcerSituation(posterId: string, situation: string | null): Promise<void> {
  const maintenant = new Date().toISOString();
  if (situation === null) {
    const { error } = await supabase
      .from("faq_situation_forcee")
      .update({ jusqu_au: maintenant, updated_at: maintenant })
      .eq("poster_id", posterId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from("faq_situation_forcee")
    .upsert({ poster_id: posterId, situation, jusqu_au: null, updated_at: maintenant }, { onConflict: "poster_id" });
  if (error) throw error;
}
