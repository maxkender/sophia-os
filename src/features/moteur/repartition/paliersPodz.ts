/**
 * Les PALIERS des labels 100 % podz (0874, décision d'Adrien du 27/11).
 *
 * Palier 1 = 7 langues × 1 compte, palier 2 = 14 × 1, palier 3 = 14 × 2. Une
 * semaine à r > 0,9 (médiane des r de ses passages mûrs) fait monter, 7 jours
 * au palier au moins ; le palier 3 est le dernier automatique. Les nouveaux
 * labels 100 % podz y entrent d'office (tâche horaire `podz_paliers_maj`), un
 * ancien par `podz_passer_en_paliers`, sans perdre aucun compte. Un label au
 * palier n'est plus en test : ses places passent avant tout au choix de label.
 */
import { supabase } from "@/lib/supabase/client";

/** Une ligne de `podz_paliers_etat` : un label 100 % podz avec un podz actif. */
export interface PalierPodz {
  label_id: string;
  label: string;
  pod: string | null;
  /** 1, 2 ou 3 ; nul = l'ancien test (4 comptes, 30 posts). */
  palier: number | null;
  depuis: string | null;
  langues_cible: number | null;
  comptes_par_langue: number | null;
  langues_ouvertes: number;
  comptes: number;
  /** Passages mûrs (publiés il y a 3 à 10 jours) et leur r médian. */
  passages_semaine: number;
  r_semaine: number | null;
  montee_possible_le: string | null;
}

const nombre = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export async function lirePaliersPodz(): Promise<PalierPodz[]> {
  const { data, error } = await supabase.rpc("podz_paliers_etat");
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((l) => ({
    label_id: String(l.label_id),
    label: String(l.label ?? ""),
    pod: l.pod === null || l.pod === undefined ? null : String(l.pod),
    palier: nombre(l.palier),
    depuis: (l.depuis as string | null) ?? null,
    langues_cible: nombre(l.langues_cible),
    comptes_par_langue: nombre(l.comptes_par_langue),
    langues_ouvertes: nombre(l.langues_ouvertes) ?? 0,
    comptes: nombre(l.comptes) ?? 0,
    passages_semaine: nombre(l.passages_semaine) ?? 0,
    r_semaine: nombre(l.r_semaine),
    montee_possible_le: (l.montee_possible_le as string | null) ?? null,
  }));
}

/** Bascule un ancien label aux paliers (au palier de ses comptes), ou l'en sort (`palier` 0). */
export async function passerEnPaliers(labelId: string, palier?: 0 | 1 | 2 | 3): Promise<{ palier: number | null; langues_ouvertes?: string[] }> {
  const { data, error } = await supabase.rpc("podz_passer_en_paliers", {
    p_label: labelId,
    ...(palier === undefined ? {} : { p_palier: palier }),
  });
  if (error) throw error;
  return data as { palier: number | null; langues_ouvertes?: string[] };
}

/** Comptes visés par le palier : langues × comptes par langue. */
export function comptesCible(p: PalierPodz): number | null {
  return p.langues_cible && p.comptes_par_langue ? p.langues_cible * p.comptes_par_langue : null;
}
