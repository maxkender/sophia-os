/**
 * 0469 : le lien de la conversation Upwork, partout où il y a un problème
 * (Needs you, Thursday, masterlist, Onboarding, Cohorts, Disputes, paie,
 * messages). « Open Upwork conversation » ouvre la room du contrat, le lien du
 * contrat est à côté ; une room pas encore connue : « No conversation yet »,
 * et la fonction upwork la cherche au prochain passage (conversations_upwork
 * la met en file).
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase/client";

export interface Conversation {
  contrat_id: string | null;
  room_id: string | null;
}

export const urlRoom = (room: string) => `https://www.upwork.com/ab/messages/rooms/${room}`;
export const urlContrat = (contrat: string) => `https://www.upwork.com/nx/wm/workroom/${contrat}/overview`;

/** Le numéro de contrat d'un lien Upwork (« …/workroom/44801168/… »), sinon null. */
export function contratDuLien(lien: string | null | undefined): string | null {
  return lien?.match(/upwork\.com\/nx\/wm\/workroom\/(\d+)/)?.[1] ?? null;
}

export interface Conversations {
  dePosteur: Map<string, Conversation>;
  deContrat: Map<string, Conversation>;
}

export async function lireConversations(posteurs: string[], contrats: string[]): Promise<Conversations> {
  const r: Conversations = { dePosteur: new Map(), deContrat: new Map() };
  if (posteurs.length === 0 && contrats.length === 0) return r;
  const { data, error } = await supabase.rpc("conversations_upwork", { p_posteurs: posteurs, p_contrats: contrats });
  if (error) throw error;
  for (const l of (data ?? []) as { poster_id: string | null; contrat_id: string | null; room_id: string | null }[]) {
    const c = { contrat_id: l.contrat_id, room_id: l.room_id };
    if (l.poster_id) r.dePosteur.set(l.poster_id, c);
    if (l.contrat_id && (l.room_id || !r.deContrat.get(l.contrat_id)?.room_id)) r.deContrat.set(l.contrat_id, c);
  }
  return r;
}

const trie = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort();

/** Les conversations des posteurs et contrats affichés (une requête par liste). */
export function useConversations(posteurs: (string | null | undefined)[], contrats: (string | null | undefined)[] = []) {
  const p = trie(posteurs);
  const c = trie(contrats);
  return useQuery({
    queryKey: ["conversations-upwork", p, c],
    queryFn: () => lireConversations(p, c),
    enabled: p.length + c.length > 0,
    staleTime: 5 * 60_000,
  });
}

/** La conversation d'un posteur, sinon celle de son contrat. */
export function conversationDe(
  conv: Conversations | undefined,
  o: { posteur?: string | null; contrat?: string | null },
): Conversation | undefined {
  if (!conv) return undefined;
  const parPosteur = o.posteur ? conv.dePosteur.get(o.posteur) : undefined;
  if (parPosteur?.contrat_id) return parPosteur.room_id ? parPosteur : conv.deContrat.get(parPosteur.contrat_id) ?? parPosteur;
  if (o.contrat) return conv.deContrat.get(o.contrat) ?? { contrat_id: o.contrat, room_id: null };
  return parPosteur;
}
