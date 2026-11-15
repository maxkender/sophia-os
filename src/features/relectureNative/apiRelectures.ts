/**
 * Relecture simple des posts publiés (0631), côté admin : les envois par
 * langue, leur état, et l'envoi immédiat de n posts (sinon le cron du
 * samedi). Les relectures faites sont découpées en corrections (0630).
 */
import { supabase } from "@/lib/supabase/client";

import type { RelecturePoste } from "./api";

export interface RelectureAdmin extends RelecturePoste {
  relecteur_id: string;
  vues: number | null;
  publie_at: string | null;
  slides_source: Array<{ position: number; texte_overlay: string | null }>;
  corrections_extraites_le: string | null;
  relecteur: { prenom: string | null; nom: string | null } | null;
}

const COLONNES =
  "id, langue, relecteur_id, envoye_le, label, vues, publie_at, slides, slides_source, statut, note, remarque, slides_corrigees, fait_le, corrections_extraites_le";

/** Les relectures d'une langue, les plus récentes d'abord. */
export async function listerRelectures(langue: string): Promise<RelectureAdmin[]> {
  const { data, error } = await supabase
    .from("relectures_posts")
    .select(`${COLONNES}, relecteurs_natifs(profiles(prenom, nom))`)
    .eq("langue", langue.toLowerCase())
    .order("envoye_le", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []).map((ligne) => {
    const l = ligne as Omit<RelectureAdmin, "relecteur"> & {
      relecteurs_natifs?: { profiles?: { prenom: string | null; nom: string | null } | null } | null;
    };
    const { relecteurs_natifs, ...reste } = l;
    return { ...reste, relecteur: relecteurs_natifs?.profiles ?? null };
  });
}

/** Envoie maintenant n posts publiés de la langue (derniers `jours`) à chacun de ses relecteurs ; rend le nombre envoyé. */
export async function envoyerRelectures(langue: string, n = 15, jours = 14): Promise<number> {
  const { data, error } = await supabase.rpc("relectures_envoyer", { p_langue: langue, p_n: n, p_jours: jours });
  if (error) throw error;
  return Number(data ?? 0);
}
