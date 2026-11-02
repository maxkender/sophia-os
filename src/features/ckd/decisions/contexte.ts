import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

/**
 * Prompt 27 : la colonne Context de la masterlist (le dernier message du
 * posteur et le nôtre, sa dernière connexion, son dernier post avec lien, les
 * classements déjà faits par l'OS) et la colonne Away (« I'll be away »).
 */
export type CanalMessage = "upwork" | "slack" | "send_to_os" | "bouton" | "dashboard" | string;

export interface MessageContexte {
  canal: CanalMessage;
  at: string;
  texte: string | null;
  lien: string | null;
}

export interface AbsenceSemaine {
  debut: string;
  fin: string;
  jours: number;
  raison: string | null;
  declare_at: string;
  retour: boolean;
}

export interface ContextePosteur {
  poster_id: string;
  dernier_recu: MessageContexte | null;
  dernier_envoye: MessageContexte | null;
  repondu: boolean;
  derniere_connexion: string | null;
  dernier_post_at: string | null;
  arrivee: string | null;
  badges: ("stop" | "absent" | "paie")[] | null;
  absence: AbsenceSemaine | null;
  absences_30j: number;
  upwork_lu_at: string | null;
}

export interface MessageFil extends MessageContexte {
  sens: "recu" | "envoye";
  cas: string | null;
}

export async function lireContexte(lundi: string, posteurs: readonly string[]): Promise<Map<string, ContextePosteur>> {
  if (posteurs.length === 0) return new Map();
  const { data, error } = await supabase.rpc("masterlist_contexte", { p_lundi: lundi, p_posteurs: [...new Set(posteurs)] });
  if (error) throw error;
  return new Map(((data ?? []) as ContextePosteur[]).map((c) => [c.poster_id, c]));
}

/** Details : les 10 derniers messages des deux côtés, tous canaux, du plus récent au plus ancien. */
export async function lireFil(posterId: string): Promise<MessageFil[]> {
  const { data, error } = await supabase.rpc("posteur_fil", { p_poster: posterId, p_n: 10 });
  if (error) throw error;
  return (data ?? []) as MessageFil[];
}

/** Relire les conversations Upwork de ces posteurs (lecture seule), 60 à la fois. */
export async function relireConversationsUpwork(posteurs: readonly string[]): Promise<{ lus: number; erreurs: number }> {
  const ids = [...new Set(posteurs)];
  let lus = 0;
  let erreurs = 0;
  for (let i = 0; i < ids.length; i += 60) {
    const r = await invoke<{ lus?: number; erreurs?: string[] }>("upwork", { action: "contexte_upwork", posteurs: ids.slice(i, i + 60), max: 60 });
    lus += r.lus ?? 0;
    erreurs += r.erreurs?.length ?? 0;
  }
  return { lus, erreurs };
}

/** « 3 d ago » : jours entiers écoulés (0 → « today »). */
export function joursDepuis(iso: string, maintenant: Date): number {
  return Math.max(0, Math.floor((maintenant.getTime() - new Date(iso).getTime()) / 86_400_000));
}
