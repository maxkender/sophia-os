import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

/** Ce que l'OS dit au posteur (0382) : offre Double, Kill, et plus tard Recréer. */
export type TypeMessage = "kill" | "double" | "recreer" | "nudge";

export interface MonMessage {
  id: string;
  type: TypeMessage;
  texte: string;
  expire_at: string | null;
  created_at: string;
}

export type StatutMessage =
  | "programmee"
  | "en_attente"
  | "acceptee"
  | "acceptee_compte_a_creer"
  | "refusee"
  | "expiree"
  | "retiree"
  | "envoye"
  | "lu";

export interface MessagePosteur {
  id: string;
  poster_id: string;
  poster_nom: string | null;
  hm_id: string | null;
  hm_prenom: string | null;
  compte_id: string | null;
  proposition_id: string | null;
  semaine: string;
  type: TypeMessage;
  texte: string;
  statut: StatutMessage;
  visible_de: string;
  expire_at: string | null;
  lu_at: string | null;
  reponse: "oui" | "non" | null;
  repondu_at: string | null;
  slack_statut: "envoye" | "introuvable" | "erreur" | null;
  slack_at: string | null;
  erreur: string | null;
  nouveau_compte_id: string | null;
  created_at: string;
}

/** Les réglages des messages aux posteurs (table `reglages`, 0382). */
export interface ReglagesMessages {
  kill_message_auto: boolean;
  kill_message_texte: string;
  double_popup_texte: string;
  double_popup_expire: { jour_iso: number; heure: string };
}

export const CLES_REGLAGES = ["kill_message_auto", "kill_message_texte", "double_popup_texte", "double_popup_expire"] as const;

export async function mesMessages(): Promise<MonMessage[]> {
  const { data, error } = await supabase.rpc("mes_messages_posteur");
  if (error) throw error;
  return (data ?? []) as MonMessage[];
}

export async function repondreDouble(messageId: string, reponse: "oui" | "non"): Promise<void> {
  await invoke<{ ok: boolean }>("ckd", { action: "double_repondre", message_id: messageId, reponse });
}

export async function lireMessagesPosteurs(depuis: string): Promise<MessagePosteur[]> {
  const { data, error } = await supabase.rpc("messages_posteurs", { p_depuis: depuis });
  if (error) throw error;
  return (data ?? []) as MessagePosteur[];
}

/** Admin : recréer le 2ᵉ compte d'une offre acceptée restée sans compte. */
export async function creerCompteDouble(propositionId: string): Promise<void> {
  const r = await invoke<{ ok: boolean; error?: string }>("ckd", { action: "double_creer", id: propositionId });
  if (!r.ok) throw new Error(r.error ?? "création impossible");
}

export async function lireReglagesMessages(): Promise<ReglagesMessages> {
  const { data, error } = await supabase.from("reglages").select("cle, valeur").in("cle", [...CLES_REGLAGES]);
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  const exp = (v.double_popup_expire ?? {}) as Partial<ReglagesMessages["double_popup_expire"]>;
  return {
    kill_message_auto: v.kill_message_auto === true,
    kill_message_texte: typeof v.kill_message_texte === "string" ? v.kill_message_texte : "",
    double_popup_texte: typeof v.double_popup_texte === "string" ? v.double_popup_texte : "",
    double_popup_expire: { jour_iso: Number(exp.jour_iso ?? 3), heure: String(exp.heure ?? "23:59") },
  };
}

export async function enregistrerReglagesMessages(r: ReglagesMessages): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const par = { updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from("reglages")
    .upsert(CLES_REGLAGES.map((cle) => ({ cle, valeur: r[cle], ...par })));
  if (error) throw error;
}
