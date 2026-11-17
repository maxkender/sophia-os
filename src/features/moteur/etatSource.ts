/**
 * L'état d'une source, en une phrase pour le tableau de la page Sources.
 *
 * Avant, rien ne disait où en était une source : il fallait lire trois
 * panneaux (file, essais, lundi) pour savoir si elle avait importé 30 posts,
 * 100, ou rien. Cette fonction rassemble ces trois lectures ; elle ne calcule
 * aucune règle elle-même (les règles sont en base : 0667, 0686, 0721).
 */

import type { DecisionSourceLundi } from "./api";

export type CleEtatSource =
  | "inactive"
  | "file"
  | "jamais"
  | "essai"
  | "essaiRate"
  | "pasRetenue"
  | "majAVenir"
  | "majFaite"
  | "aJour";

export type TonEtatSource = "neutre" | "attente" | "bon" | "alerte";

export interface EtatSource {
  cle: CleEtatSource;
  ton: TonEtatSource;
  /** Valeurs passées à la traduction (`sources.etat.<cle>`). */
  valeurs: Record<string, string | number>;
}

export interface EntreeEtatSource {
  actif: boolean;
  /** Jamais relevée : aucun listing du profil n'a abouti. */
  jamaisRelevee: boolean;
  essaiMax: number | null;
  essaiVerdict: "tient" | "ne_tient_pas" | null;
  /** Slideshows de la source en stock (tous statuts). */
  importes: number;
  /** Posts de la source mesurés chez nous. */
  postsMesures: number;
  /** Ce qu'il faut de posts mesurés pour juger un essai (`essai_mesures_min`). */
  mesuresMin: number;
  /** Présente dans la file d'attente : son jour au plus tôt (AAAA-MM-JJ), ou nul. */
  attente: { prevuLe: string | null } | null;
  /** Sa décision du dernier lundi, si elle en a une. */
  semaine: { decision: DecisionSourceLundi; raison: string | null; lanceeLe: string | null } | null;
}

export function etatSource(e: EntreeEtatSource): EtatSource {
  if (!e.actif) return { cle: "inactive", ton: "neutre", valeurs: {} };
  if (e.attente) return { cle: "file", ton: "attente", valeurs: { jour: e.attente.prevuLe ?? "" } };
  if (e.essaiVerdict === "ne_tient_pas") {
    return { cle: "essaiRate", ton: "alerte", valeurs: { max: e.essaiMax ?? e.importes } };
  }
  if (e.essaiMax !== null && e.essaiVerdict === null) {
    return {
      cle: "essai",
      ton: "attente",
      valeurs: { importes: e.importes, max: e.essaiMax, mesures: Math.min(e.postsMesures, e.mesuresMin), mesuresMin: e.mesuresMin },
    };
  }
  if (e.jamaisRelevee && e.importes === 0) return { cle: "jamais", ton: "neutre", valeurs: {} };
  if (e.semaine) {
    const raison = e.semaine.raison ?? "";
    if (e.semaine.decision === "pas_maj") return { cle: "pasRetenue", ton: "alerte", valeurs: {} };
    if (e.semaine.lanceeLe) return { cle: "majFaite", ton: "bon", valeurs: { raison, jour: e.semaine.lanceeLe.slice(0, 10) } };
    return { cle: "majAVenir", ton: "attente", valeurs: { raison } };
  }
  return { cle: "aJour", ton: "neutre", valeurs: {} };
}
