import { supabase } from "@/lib/supabase/client";

import { appeler, type Fiche } from "./api";

/** 13/11 (Max) : la conversation complète avec un posteur, tous canaux (0710 : support_conversation). */

export type Sens = "in" | "out" | "action";
export type CanalReponse = "help" | "email" | "slack" | "upwork";

export interface ElementFil {
  at: string;
  sens: Sens;
  canal: string;
  qui: string;
  texte: string | null;
  type: string;
  demande_id?: string;
  statut?: string;
  vu?: boolean;
}

export interface Conversation {
  fiche: Fiche | null;
  canaux: { slack: boolean; upwork: boolean; email: boolean; plateforme: string | null };
  fil: ElementFil[];
}

export async function lireConversation(posterId: string): Promise<Conversation> {
  const { data, error } = await supabase.rpc("support_conversation", { p_poster: posterId });
  if (error) throw new Error(error.message);
  const c = (data ?? { fiche: null, canaux: { slack: false, upwork: false, email: false, plateforme: null }, fil: [] }) as Conversation;
  return { ...c, fil: c.fil ?? [] };
}

export const repondreCanal = (p: { poster_id: string; canal: CanalReponse; texte: string; demande_id: string | null }) =>
  appeler<{ ok: true; envoi?: string }>({ action: "repondre_canal", ...p });

/** Le canal de réponse par défaut : celui de la demande (Upwork → Upwork, Slack → Slack, Email → Email, sinon Help). */
export function canalDefaut(source: string | null | undefined, c?: Conversation["canaux"]): CanalReponse {
  if (source === "upwork" && c?.upwork !== false) return "upwork";
  if (source && source.startsWith("slack") && c?.slack !== false) return "slack";
  if (source === "email") return "email";
  if (source === "help") return "help";
  if (c?.upwork) return "upwork";
  if (c?.slack) return "slack";
  return "email";
}

export const LIBELLE_CANAL: Record<string, string> = {
  upwork: "Upwork", slack: "Slack", slack_salon: "Slack", slack_aide: "Slack", email: "Email", help: "Help",
  dashboard: "Dashboard", bouton: "Bouton", os: "OS",
};
