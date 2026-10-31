import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

/** 31/10 (0476) : Quality Control — 10 posts au hasard par label, publiés la veille, traduits en anglais. */
export const MOTIFS_QC = ["no_cta", "bad_translation", "wrong_app", "text_error", "other"] as const;
export type MotifQc = (typeof MOTIFS_QC)[number];

export interface SlideQc {
  position: string | null;
  texte: string;
  appli: boolean;
}

export interface PostQc {
  id: string;
  jour: string;
  label_nom: string | null;
  passage_id: string;
  langue: string | null;
  compte_handle: string | null;
  publie_url: string | null;
  textes_orig: SlideQc[];
  textes_en: string[] | null;
  traduit_at: string | null;
  erreur: string | null;
  signalements: { motif: MotifQc; note: string | null; at: string; par: string | null }[];
}

export interface SignalementQc {
  id: string;
  jour: string;
  label_nom: string | null;
  langue: string | null;
  compte_handle: string | null;
  publie_url: string | null;
  motif: MotifQc;
  note: string | null;
  cree_at: string;
  par: string | null;
}

export async function lireQc(jour: string): Promise<PostQc[]> {
  const { data, error } = await supabase.rpc("qc_liste", { p_jour: jour });
  if (error) throw error;
  return (data ?? []) as PostQc[];
}

export async function preparerQc(jour: string): Promise<{ tires: number; traduits: number; restants: number; erreurs: string[] }> {
  const r = await invoke<{ ok: boolean; error?: string; tires: number; traduits: number; restants: number; erreurs: string[] }>("ckd", {
    action: "qc_traduire",
    jour,
  });
  if (!r.ok) throw new Error(r.error ?? "qc_traduire");
  return r;
}

export async function signalerQc(echantillonId: string, motif: MotifQc, note: string): Promise<void> {
  const { error } = await supabase.rpc("qc_signaler", { p_echantillon: echantillonId, p_motif: motif, p_note: note });
  if (error) throw error;
}

export async function lireSignalementsQc(): Promise<SignalementQc[]> {
  const { data, error } = await supabase.rpc("qc_signalements_recents", { p_jours: 14 });
  if (error) throw error;
  return (data ?? []) as SignalementQc[];
}

/** Les posts regroupés par label, dans l'ordre alphabétique des labels. */
export function parLabel(posts: PostQc[]): [string, PostQc[]][] {
  const m = new Map<string, PostQc[]>();
  for (const p of posts) {
    const cle = p.label_nom ?? "—";
    m.set(cle, [...(m.get(cle) ?? []), p]);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}
