import { supabase } from "@/lib/supabase/client";

import type { TableauPays } from "./logique";

/** Le tableau de décision par pays (0512, admin, lecture seule). */
export async function lireTableauPays(): Promise<TableauPays> {
  const { data, error } = await supabase.rpc("pays_tableau");
  if (error) throw error;
  const t = data as TableauPays;
  return {
    ...t,
    semaines: (t.semaines ?? []).map((s) => ({
      ...s,
      vues: Number(s.vues ?? 0),
      comptes: Number(s.comptes ?? 0),
      sous_seuil: Number(s.sous_seuil ?? 0),
      proceeds: Number(s.proceeds ?? 0),
      proceeds_new: s.proceeds_new === null || s.proceeds_new === undefined ? null : Number(s.proceeds_new),
      transactions: Number(s.transactions ?? 0),
      cout_reel: s.cout_reel === null || s.cout_reel === undefined ? null : Number(s.cout_reel),
      cout_estime: s.cout_estime === null || s.cout_estime === undefined ? null : Number(s.cout_estime),
      comptes_publies: Number(s.comptes_publies ?? 0),
    })),
    pays: (t.pays ?? []).map((p) => ({
      ...p,
      tarif: p.tarif === null || p.tarif === undefined ? null : Number(p.tarif),
      objectif: p.objectif === null || p.objectif === undefined ? null : Number(p.objectif),
    })),
    offres: t.offres ?? [],
    hms: t.hms ?? [],
    reglages: t.reglages ?? {},
  };
}

export interface ComptePays {
  compte_id: string;
  handle: string | null;
  poster_id: string | null;
  poster_nom: string | null;
  actif: boolean;
  cree_le: string | null;
  semaines: { semaine: string; vues: number }[];
}

/** Les comptes d'un pays et leurs vues des 8 dernières semaines. */
export async function lireComptesPays(pays: string): Promise<ComptePays[]> {
  const { data, error } = await supabase.rpc("pays_comptes", { p_pays: pays });
  if (error) throw error;
  return ((data ?? []) as ComptePays[]).map((c) => ({ ...c, semaines: (c.semaines ?? []).map((s) => ({ ...s, vues: Number(s.vues) })) }));
}

/** L'objectif de comptes d'un pays, réglé à la main (null : la suggestion s'applique). */
export async function fixerObjectifPays(pays: string, objectif: number | null, note: string | null): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("pays_objectifs")
    .upsert({ pays, objectif, note, maj_par: u.user?.id ?? null, maj_at: new Date().toISOString() }, { onConflict: "pays" });
  if (error) throw error;
}
