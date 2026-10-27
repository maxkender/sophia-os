import { supabase } from "@/lib/supabase/client";

import type { PostCalendrier } from "../calendrier/api";
import type { DiagnosticCkd } from "../diagnostic";

/**
 * « Anciens posteurs » (0372) : les comptes qui ont fini leur première semaine
 * de posts, leurs posts des 15 derniers jours et leur diagnostic des 7
 * derniers jours. Une HM ne reçoit que ses posteurs.
 */
export interface LigneAncien {
  compte_id: string;
  poster_id: string;
  hm_id: string | null;
  handle: string | null;
  pays: string | null;
  premier_jour: string;
  warmup_lance: boolean;
  seuil_mort: number;
  mediane_pays: number | null;
  posts: PostCalendrier[];
  diagnostic: DiagnosticCkd;
}

export async function lireAnciens(): Promise<LigneAncien[]> {
  const { data, error } = await supabase.rpc("hm_anciens", {});
  if (error) throw error;
  return ((data ?? []) as LigneAncien[]).map((l) => ({
    ...l,
    seuil_mort: Number(l.seuil_mort),
    mediane_pays: l.mediane_pays === null ? null : Number(l.mediane_pays),
    posts: l.posts ?? [],
  }));
}
