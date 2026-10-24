import { supabase } from "@/lib/supabase/client";
import type { Role } from "@/features/auth/AuthContext";

import { type EtatFaq, lireReglagesFaq, type ReglagesFaq } from "./faq";
import { QUESTION_MAX, type AudienceSnippet, type ChatLocale, type TourChat } from "./prompt";

export interface ChatbotContexte {
  id: string;
  titre: string;
  contenu: string;
  audience: AudienceSnippet;
  created_at: string;
  updated_at: string;
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        const corps = (await ctx.json()) as { error?: string; message?: string };
        if (corps?.error) message = corps.error;
        else if (corps?.message) message = corps.message;
      }
    } catch {
      /* garder le message générique */
    }
    throw new Error(message);
  }
  if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

/** La langue du compte TikTok du poster connecté (le compte actif d'abord). */
export async function lireLangueDeMonCompte(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const moi = auth.user?.id;
  if (!moi) return null;
  const { data, error } = await supabase
    .from("comptes")
    .select("langue")
    .eq("poster_id", moi)
    .order("is_active", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.langue as string | null | undefined) ?? null;
}

export async function poserQuestionChatbot(
  question: string,
  locale: ChatLocale,
  historique: TourChat[],
): Promise<string> {
  const texte = question.trim();
  if (!texte) throw new Error("Question vide");
  if (texte.length > QUESTION_MAX) {
    throw new Error(`Question trop longue (${QUESTION_MAX} caractères max)`);
  }
  const data = await invoke<{ reponse: string }>("chatbot", {
    question: texte,
    locale,
    historique,
  });
  return data.reponse;
}

export async function listerChatbotContexte(): Promise<ChatbotContexte[]> {
  const { data, error } = await supabase
    .from("chatbot_contexte")
    .select("id, titre, contenu, audience, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((ligne) => ({
    ...(ligne as ChatbotContexte),
    audience: ((ligne as ChatbotContexte).audience ?? "all") as AudienceSnippet,
  }));
}

export async function creerChatbotContexte(
  titre: string,
  contenu: string,
  audience: AudienceSnippet = "all",
): Promise<void> {
  const { error } = await supabase.from("chatbot_contexte").insert({
    titre: titre.trim() || "Sans titre",
    contenu: contenu.trim(),
    audience,
  });
  if (error) throw error;
}

export async function majChatbotContexte(
  id: string,
  patch: { titre: string; contenu: string; audience: AudienceSnippet },
): Promise<void> {
  const { error } = await supabase
    .from("chatbot_contexte")
    .update({
      titre: patch.titre.trim() || "Sans titre",
      contenu: patch.contenu.trim(),
      audience: patch.audience,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function supprimerChatbotContexte(id: string): Promise<void> {
  const { error } = await supabase.from("chatbot_contexte").delete().eq("id", id);
  if (error) throw error;
}

/* -------------------------------------------------------------------------
 * FAQ automatique (docs/faq-automatique.md)
 * ---------------------------------------------------------------------- */

export interface QuestionFaq {
  id: string;
  source: "os" | "slack";
  role: Role;
  question: string;
  reponse: string | null;
  reponse_faq: string | null;
  section_guide: string | null;
  etat: EtatFaq | null;
  test: boolean;
  envoye_at: string | null;
  slack_canal: string | null;
  slack_ts: string | null;
  slack_nom: string | null;
  slack_user_id: string | null;
  reponse_humaine: string | null;
  reponse_humaine_par: string | null;
  reponse_admin: string | null;
  ajoute_base_at: string | null;
  erreur: string | null;
  /** Bug : où en est l'IT guy, d'après son « on it » et sa réponse dans le fil. */
  it_statut: "pris_en_charge" | "repondu" | null;
  it_maj_at: string | null;
  created_at: string;
  profiles: { prenom: string | null; nom: string | null; email: string | null } | null;
}

export interface PageGuideCopiee {
  page_id: string;
  guide: "poster" | "manager";
  chemin: string;
  url: string;
  copie_at: string;
  notion_modifie_at: string | null;
}

export interface BilanCopieGuides {
  ok: boolean;
  error?: string;
  guides?: Array<{ guide: string; recopiees: number; inchangees: number; retirees: number; erreurs: string[] }>;
}

const COLONNES_FAQ =
  "id, source, role, question, reponse, reponse_faq, section_guide, etat, test, envoye_at, slack_canal, slack_ts, " +
  "slack_nom, slack_user_id, reponse_humaine, reponse_humaine_par, reponse_admin, ajoute_base_at, erreur, it_statut, " +
  "it_maj_at, created_at, " +
  "profiles!chatbot_questions_user_id_fkey(prenom, nom, email)";

function avecProfil(lignes: unknown[]): QuestionFaq[] {
  return lignes.map((ligne) => {
    const raw = ligne as QuestionFaq & { profiles: QuestionFaq["profiles"] | QuestionFaq["profiles"][] };
    const profil = Array.isArray(raw.profiles) ? (raw.profiles[0] ?? null) : raw.profiles;
    return { ...raw, profiles: profil };
  });
}

export async function lireReglagesFaqAdmin(): Promise<ReglagesFaq> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "faq_automatique")
    .maybeSingle();
  if (error) throw error;
  return lireReglagesFaq(data?.valeur);
}

export async function ecrireReglagesFaq(reglages: ReglagesFaq): Promise<void> {
  const { error } = await supabase
    .from("reglages")
    .upsert(
      { cle: "faq_automatique", valeur: reglages, updated_at: new Date().toISOString() },
      { onConflict: "cle" },
    );
  if (error) throw error;
}

/** Ce que le cerveau n'a pas su trancher ou fait valider, et les relances après une réponse. */
export async function listerFaqATraiter(): Promise<QuestionFaq[]> {
  const { data, error } = await supabase
    .from("chatbot_questions")
    .select(COLONNES_FAQ)
    .in("etat", ["a_valider", "a_traiter", "relance"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return avecProfil(data ?? []);
}

/**
 * Toutes les questions, bulle et Slack, les plus récentes d'abord : avec la
 * décision du cerveau quand il a tourné, et celles d'avant lui (ancien
 * assistant, `etat` null).
 */
export async function listerFaqJournal(): Promise<QuestionFaq[]> {
  const { data, error } = await supabase
    .from("chatbot_questions")
    .select(COLONNES_FAQ)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return avecProfil(data ?? []);
}

export async function traiterQuestionFaq(
  id: string,
  reponse: string,
  ajouterBase: boolean,
): Promise<{ envoye: boolean; raison: string | null; deja?: boolean }> {
  return invoke("faq-admin", { action: "traiter", id, reponse, ajouter_base: ajouterBase });
}

export async function ignorerQuestionFaq(id: string): Promise<void> {
  await invoke("faq-admin", { action: "ignorer", id });
}

export async function listerGuidesCopies(): Promise<PageGuideCopiee[]> {
  const { data, error } = await supabase
    .from("guides_notion")
    .select("page_id, guide, chemin, url, copie_at, notion_modifie_at")
    .order("guide", { ascending: false })
    .order("ordre", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as PageGuideCopiee[];
}

export async function recopierGuides(): Promise<BilanCopieGuides> {
  return invoke<BilanCopieGuides>("guides-notion", { force: true });
}
