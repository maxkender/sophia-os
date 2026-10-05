// Pods — file de validation des livraisons (migration 0259, fonction `pods`).

import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

export type StatutLivraison = "a_valider" | "validee" | "rejetee" | "ecartee_note";

export interface SlideLivraison {
  position: number;
  media_id: string;
  url: string;
  position_sophia: boolean;
}

export interface Livraison {
  id: string;
  pod: string;
  source_url: string | null;
  source_vues: number | null;
  titre: string | null;
  langue_source: string;
  musique_titre: string | null;
  decks: Record<string, { hashtags: string; slides: SlideLivraison[] }>;
  statut: StatutLivraison;
  motif: string | null;
  note_import: number | null;
  tier: string | null;
  contenu_id: string | null;
  created_at: string;
  decide_le: string | null;
}

const COLONNES =
  "id, pod, source_url, source_vues, titre, langue_source, musique_titre, decks, statut, motif, note_import, tier, contenu_id, created_at, decide_le";

/** File d'attente (la plus ancienne d'abord) + les 30 dernières décidées. */
export async function listerLivraisons(): Promise<{ aValider: Livraison[]; decidees: Livraison[] }> {
  const [attente, faites] = await Promise.all([
    supabase.from("pod_livraisons").select(COLONNES).eq("statut", "a_valider").order("created_at").limit(100),
    supabase
      .from("pod_livraisons")
      .select(COLONNES)
      .neq("statut", "a_valider")
      .order("decide_le", { ascending: false })
      .limit(30),
  ]);
  if (attente.error) throw attente.error;
  if (faites.error) throw faites.error;
  return { aValider: (attente.data ?? []) as Livraison[], decidees: (faites.data ?? []) as Livraison[] };
}

export function validerLivraison(id: string) {
  return invoke<{ ok: boolean; statut: StatutLivraison; tier?: string; note?: number }>("pods", { action: "valider", id });
}

export function rejeterLivraison(id: string, motif: string) {
  return invoke<{ ok: boolean }>("pods", { action: "rejeter", id, motif: motif || null });
}

/** Ordre d'affichage des langues : la langue source d'abord, puis l'alphabet. */
export function languesOrdonnees(l: Pick<Livraison, "decks" | "langue_source">): string[] {
  return Object.keys(l.decks ?? {}).sort((a, b) =>
    a === l.langue_source ? -1 : b === l.langue_source ? 1 : a.localeCompare(b),
  );
}
