import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

/**
 * Messages automatiques, garde-fous (0432) : les messages en attente (dus avant
 * le passage d'un interrupteur sur « on », ou liste du jeudi à valider), le
 * « Send » qui les fait partir peu à peu, l'aperçu de ce qui partirait, et les
 * profils qui partagent un contrat ou un Slack.
 */
export interface MessageAttente {
  poster_id: string;
  poster_nom: string | null;
  type: string;
  periode: string;
  canal: string | null;
  texte: string | null;
  raison: "en_attente" | "a_valider";
  valide_at: string | null;
  maj_at: string;
}

export async function lireMessagesAttente(): Promise<MessageAttente[]> {
  const { data, error } = await supabase
    .from("relances_prevues")
    .select("poster_id, type, periode, canal, texte, raison, valide_at, maj_at, profiles(prenom, nom)")
    .eq("statut", "prevu")
    .in("raison", ["en_attente", "a_valider"])
    .order("maj_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const p = (r as unknown as { profiles: { prenom: string | null; nom: string | null } | null }).profiles;
    return { ...(r as unknown as MessageAttente), poster_nom: p ? [p.prenom, p.nom].filter(Boolean).join(" ") || null : null };
  });
}

/** « Send » : ces messages partent, peu à peu (envoi_attente_par_passage par passage). Admin seulement. */
export async function validerMessagesAttente(types: string[], posterId?: string): Promise<number> {
  const { data, error } = await supabase.rpc("messages_attente_valider", { p_types: types, p_poster: posterId ?? null });
  if (error) throw error;
  return Number(data ?? 0);
}

export interface ExempleMessage {
  poster_id: string;
  nom: string | null;
  hm: string | null;
  canaux: ("slack" | "upwork")[];
  doublon: boolean;
  variante: string;
  texte: string;
  donnees: Record<string, unknown>;
}

export interface Apercu {
  genere_at: string;
  /** L'instant de l'aperçu (demain 15 h à Paris pour « demain »). */
  pour: string;
  minimum_posts: number;
  types: Record<string, { total: number; exemples: ExempleMessage[] }>;
  /** Start warmup cliqué, compte introuvable : Needs you, aucun message. */
  needs_you: { poster_id: string; nom: string | null; handle: string | null; start_warmup: string | null }[];
}

/** Ce qui partirait maintenant (ou demain, pour les relances), par type (rien n'est écrit ni envoyé). */
export async function lireApercu(demain = false): Promise<Apercu> {
  const r = await invoke<Apercu & { ok: boolean; error?: string }>("recrues-check", { action: "apercu", demain });
  if (!r.ok) throw new Error(r.error ?? "aperçu impossible");
  return r;
}

export interface Doublon {
  par: "contrat" | "slack";
  cle: string;
  profils: { id: string; nom: string | null; email: string | null; cohorte: string | null }[];
}

export async function lireDoublons(): Promise<Doublon[]> {
  const { data, error } = await supabase.rpc("messages_doublons");
  if (error) throw error;
  return (data ?? []) as Doublon[];
}

/** L'ordre des types de messages à l'écran (prompt 25 : la relance du jour remplace les 4 étapes ; le jeudi est sur Thursday). */
export const TYPES_MESSAGES = ["accueil", "relance", "lundi_soir", "lundi"] as const;

export interface BilanFile {
  ok: boolean;
  envoyes: number;
  perimes: number;
  doublons: number;
  upwork_bloque: number;
  pause?: boolean;
  erreurs?: string[];
}

/** La file d'envoi part tout de suite (au plus 20 par passage, le reste aux passages suivants). */
export async function envoyerFile(): Promise<BilanFile> {
  return await invoke<BilanFile>("recrues-check", { action: "envoyer_file" });
}

export interface BudgetUpwork {
  jour: string;
  conversations: number;
  max: number;
  reserve: number;
  limite_atteinte: boolean;
  limite_at: string | null;
  /** Prompt 25 v4 : par compte (Max, Adrien). */
  comptes?: { compte: string; connecte: boolean; conversations: number; limite: boolean }[];
}

/** Overview → Health : les conversations Upwork du jour (UTC) et le plafond. */
export async function lireBudgetUpwork(): Promise<BudgetUpwork> {
  const { data, error } = await supabase.rpc("upwork_budget_jour", { p_contrat: null });
  if (error) throw error;
  return data as BudgetUpwork;
}
