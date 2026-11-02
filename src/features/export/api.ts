import { supabase } from "@/lib/supabase/client";

import type { DiagnosticCkd } from "../ckd/diagnostic";

/** Une ligne par compte, les données brutes de l'export (0375). Jamais d'email. */
export interface PostExport {
  jour: string;
  rang: number;
  url: string | null;
  vues: number | null;
  likes: number | null;
  publie_at: string | null;
  stats_maj_at: string | null;
  mesure: boolean;
}

export interface CompteExport {
  compte_id: string;
  poster_id: string;
  hm_id: string | null;
  hm_prenom: string | null;
  hm_zone: string | null;
  poster_nom: string | null;
  pays: string | null;
  langue: string | null;
  handle: string | null;
  comptes_actifs: number;
  upwork_contrat_url: string | null;
  is_active: boolean;
  premier_jour: string | null;
  cree_le: string;
  warmup_started_at: string | null;
  warmup_ends_at: string | null;
  reposts_le: string | null;
  tiktok_existe: boolean | null;
  tiktok_cree_le: string | null;
  follows: number | null;
  likes: number | null;
  seuil_mort: number;
  mediane_pays: number | null;
  posts: PostExport[];
  diagnostic: DiagnosticCkd;
  decision: { regle: string; action: string; decision: string | null; fait_at: string | null; jour: string } | null;
}

export async function lireDonneesExport(debut: string, fin: string, hm: string | null): Promise<CompteExport[]> {
  const { data, error } = await supabase.rpc("hm_export_donnees", { p_debut: debut, p_fin: fin, p_hm: hm });
  if (error) throw error;
  return ((data ?? []) as CompteExport[]).map((c) => ({
    ...c,
    comptes_actifs: Number(c.comptes_actifs),
    seuil_mort: Number(c.seuil_mort),
    mediane_pays: c.mediane_pays === null ? null : Number(c.mediane_pays),
    posts: c.posts ?? [],
  }));
}

/** Chaque export est journalisé : qui, quoi, quand. */
export async function journaliserExport(e: {
  hm: string | null;
  bloc: string;
  periode: string;
  niveau: string;
  colonnes: string[];
  lignes: number;
  format: "csv" | "claude";
}): Promise<void> {
  const { error } = await supabase.rpc("hm_export_journaliser", {
    p_hm: e.hm,
    p_bloc: e.bloc,
    p_periode: e.periode,
    p_niveau: e.niveau,
    p_colonnes: e.colonnes,
    p_lignes: e.lignes,
    p_format: e.format,
  });
  if (error) throw error;
}
