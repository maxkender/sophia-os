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

import { ecrireReglage } from "../api";

import type { ProvenanceMarche } from "./provenance";
import {
  lireCibleApplications,
  type CibleApplications,
  type MarcheApplications,
} from "./scoreApplication";
import {
  lireReglagesChoixLabel,
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
  passages_restants: number | string;
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

interface LigneApps {
  langue: string;
  pays: string | null;
  application_id: string;
  slug: string;
  comptes: number | string;
}

/**
 * Les comptes par marché et par application. Même découpage (langue × pays)
 * que `lireMarchesRepartition`, pour que les deux tableaux de la page
 * s'alignent ligne à ligne.
 */
export async function lireMarchesApplications(): Promise<MarcheApplications[]> {
  const { data, error } = await supabase.rpc("simulation_repartition_apps");
  if (error) throw error;

  const parMarche = new Map<string, MarcheApplications>();
  for (const l of (data ?? []) as LigneApps[]) {
    const pays = l.pays ?? null;
    const k = `${l.langue}|${pays ?? ""}`;
    let m = parMarche.get(k);
    if (!m) {
      m = { langue: l.langue, pays, parts: [] };
      parMarche.set(k, m);
    }
    m.parts.push({
      application_id: l.application_id,
      slug: l.slug,
      comptes: nombre(l.comptes),
    });
  }
  return [...parMarche.values()];
}

interface LigneCohorte {
  langue: string;
  pays: string | null;
  recrues: number | string;
  recrues_ruul: number | string;
  recrues_ruul_hors_sophia: number | string;
}

/** Nombre de jours sur lesquels on mesure la provenance des recrues. */
export const PROVENANCE_JOURS = 30;

/**
 * Combien de recrues par marché, combien venaient de la cohorte Ruul, et
 * combien de celles-là démentent la règle.
 *
 * Un créateur de la cohorte est censé partir sur Sophia. Sans ce chiffre, la
 * page montrerait une cible « 60 % Sophia » comme si les trois applications se
 * disputaient chaque recrue, alors qu'une partie est promise d'avance — en
 * français, près d'une sur deux.
 *
 * La troisième colonne est là parce que la règle n'est appliquée NULLE PART :
 * c'est le site qui choisit l'application de ses candidats et il sait demander
 * Unswipe. La page vérifie donc au lieu de supposer (migration 0309).
 */
export async function lireCohorteRecrutement(
  jours: number = PROVENANCE_JOURS,
): Promise<ProvenanceMarche[]> {
  const { data, error } = await supabase.rpc("simulation_repartition_cohorte", {
    p_jours: jours,
  });
  if (error) throw error;

  return ((data ?? []) as LigneCohorte[]).map((l) => ({
    langue: l.langue,
    pays: l.pays ?? null,
    recrues: nombre(l.recrues),
    recruesRuul: nombre(l.recrues_ruul),
    recruesRuulHorsSophia: nombre(l.recrues_ruul_hors_sophia),
  }));
}

/** La cible de répartition entre applications, si un admin en a posé une. */
export async function lireCibleRepartitionApps(
  slugsActifs: readonly string[],
): Promise<CibleApplications> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "repartition_applications")
    .maybeSingle();
  if (error) throw error;
  return lireCibleApplications(data?.valeur, slugsActifs);
}



/** `reglages.choix_labels`. Absent en base : les valeurs par défaut du moteur. */
export async function lireReglagesRepartition(): Promise<ReglagesChoixLabel> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur")
    .eq("cle", "choix_labels")
    .maybeSingle();
  if (error) throw error;
  return lireReglagesChoixLabel(data?.valeur);
}

/**
 * Pose la cible de répartition entre applications.
 *
 * Écrit des pourcentages entiers par slug dans `reglages.repartition_applications`.
 * C'est la SEULE écriture de la page : elle ne touche ni les comptes, ni les
 * labels, ni le moteur. Tant que personne ne lit cette clé côté moteur (c'est
 * le cas aujourd'hui), la poser ne change que ce que la page projette.
 */
export async function ecrireCibleRepartitionApps(
  parts: Readonly<Record<string, number>>,
): Promise<void> {
  const propre: Record<string, number> = {};
  for (const [slug, v] of Object.entries(parts)) {
    const n = Math.round(Number(v));
    if (slug && Number.isFinite(n) && n > 0) propre[slug] = n;
  }
  await ecrireReglage("repartition_applications", propre);
}
