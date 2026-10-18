/**
 * Lectures de la page Répartition (playground).
 *
 * Tout est en LECTURE SEULE : cette page montre où partiraient les prochaines
 * recrues, elle ne change aucun réglage et ne crée aucun compte.
 *
 * Les chiffres viennent de `simulation_repartition` (migration 0305), qui rend
 * pour chaque marché (langue × pays) les mêmes entrées que le moteur reçoit à
 * la création d'un compte. La fonction est réservée à l'admin : un rôle sans
 * droit reçoit une erreur `42501`, que la page affiche telle quelle plutôt que
 * de montrer un tableau vide qui aurait l'air normal.
 */
import { supabase } from "@/lib/supabase/client";

import {
  lireFermeturesParApplication,
  lireReglagesChoixLabel,
  type FermeturesParApplication,
  type ReglagesChoixLabel,
  type StatLabel,
} from "./scoreLabel";

/** Un marché : une langue, son pays, et les candidats avec leurs chiffres. */
export interface MarcheRepartition {
  langue: string;
  pays: string | null;
  /** Comptes actifs servis par l'assignation sur ce marché. */
  comptes: number;
  stats: StatLabel[];
}

interface LigneSimulation {
  langue: string;
  pays: string | null;
  label_id: string;
  label_nom: string;
  comptes_langue: number;
  comptes_pays: number;
  comptes_total: number;
  passages_restants: number;
  demande_jour: number | string;
  passages: number;
  perf_label: number | string | null;
  perf_flotte: number | string | null;
  recents_langue: number;
  recence_langue: number;
  recents_pays: number;
  recence_pays: number;
}

function nombre(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nombreOuNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Les marchés d'une application, triés du plus peuplé au moins peuplé.
 *
 * `comptes` est pris sur la dimension PAYS quand le pays est connu, sinon sur
 * la langue : c'est le nombre de comptes que la page affiche à côté du marché,
 * et il doit correspondre à ce que le classement a réellement regardé.
 */
export async function lireMarchesRepartition(
  applicationId: string,
): Promise<MarcheRepartition[]> {
  const { data, error } = await supabase.rpc("simulation_repartition", {
    p_application: applicationId,
  });
  if (error) throw error;

  const parMarche = new Map<string, MarcheRepartition>();
  for (const l of (data ?? []) as LigneSimulation[]) {
    const pays = l.pays ?? null;
    const k = `${l.langue}|${pays ?? ""}`;
    let m = parMarche.get(k);
    if (!m) {
      m = { langue: l.langue, pays, comptes: 0, stats: [] };
      parMarche.set(k, m);
    }
    m.stats.push({
      label_id: l.label_id,
      label_nom: l.label_nom,
      comptes_langue: nombre(l.comptes_langue),
      comptes_pays: nombre(l.comptes_pays),
      comptes_total: nombre(l.comptes_total),
      passages_restants: nombre(l.passages_restants),
      demande_jour: nombre(l.demande_jour),
      passages: nombre(l.passages),
      perf_label: nombreOuNull(l.perf_label),
      perf_flotte: nombreOuNull(l.perf_flotte),
      recents_langue: nombre(l.recents_langue),
      recence_langue: nombre(l.recence_langue),
      recents_pays: nombre(l.recents_pays),
      recence_pays: nombre(l.recence_pays),
    });
  }

  for (const m of parMarche.values()) {
    const parPays = m.stats.reduce((a, s) => a + s.comptes_pays, 0);
    const parLangue = m.stats.reduce((a, s) => a + s.comptes_langue, 0);
    m.comptes = parPays > 0 ? parPays : parLangue;
  }

  return [...parMarche.values()].sort(
    (a, b) => b.comptes - a.comptes || a.langue.localeCompare(b.langue),
  );
}

export interface ReglagesRepartition {
  reglages: ReglagesChoixLabel;
  fermeturesApp: FermeturesParApplication;
}

/** `reglages.choix_labels`. Absent en base : les valeurs par défaut du moteur. */
export async function lireReglagesRepartition(): Promise<ReglagesRepartition> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "choix_labels")
    .maybeSingle();
  if (error) throw error;
  return {
    reglages: lireReglagesChoixLabel(data?.valeur),
    fermeturesApp: lireFermeturesParApplication(data?.valeur),
  };
}
