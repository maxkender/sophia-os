import { supabase } from "@/lib/supabase/client";

import type { DiagnosticCkd } from "../diagnostic";

/**
 * « Cette semaine » en calendrier (0370). Une ligne par compte de la cohorte
 * qui fait sa première semaine de posts : ses posts du lundi au dimanche et
 * son diagnostic de la semaine (jusqu'à hier). Une HM ne reçoit que ses
 * posteurs ; l'admin et le Head of Ops reçoivent tout.
 */

export interface PostCalendrier {
  jour: string;
  /** 1er, 2ᵉ… post du jour. */
  rang: number;
  url: string | null;
  vues: number | null;
  publie_at: string | null;
  mesure: boolean;
}

export interface LigneCalendrier {
  compte_id: string;
  poster_id: string;
  hm_id: string | null;
  handle: string | null;
  pays: string | null;
  langue: string | null;
  is_active: boolean;
  warmup_lance: boolean;
  seuil_mort: number;
  mediane_pays: number | null;
  posts: PostCalendrier[];
  diagnostic: DiagnosticCkd;
}

export async function lireCalendrier(lundi: string): Promise<LigneCalendrier[]> {
  const { data, error } = await supabase.rpc("hm_calendrier", { p_lundi: lundi });
  if (error) throw error;
  return ((data ?? []) as LigneCalendrier[]).map((l) => ({
    ...l,
    seuil_mort: Number(l.seuil_mort),
    mediane_pays: l.mediane_pays === null ? null : Number(l.mediane_pays),
    posts: l.posts ?? [],
  }));
}
