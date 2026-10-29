/**
 * La page Decisions (chantier du 28 oct.) : rien ici ne touche la base. Le
 * groupe d'une proposition, sa raison en une ligne, la décision d'une case
 * cochée ou décochée, et l'état de chaque moment de la semaine.
 */
import { minuitParis } from "@/features/ckd/cohorte/logique";
import { ajouterJours } from "@/features/onboarding/datesRuul";

import type { DecisionCkd } from "../api";
import type { ADecider, SemaineDecisions } from "./api";

export const GROUPES = ["kill", "double", "recreate"] as const;
export type Groupe = (typeof GROUPES)[number];

export function groupe(p: Pick<ADecider, "action">): Groupe {
  return p.action === "doubler" ? "double" : p.action === "recreer" ? "recreate" : "kill";
}

/**
 * La décision envoyée par « Validate all » : cochée, l'action proposée ;
 * décochée, l'exception (Kill → Garder, Double → Pas maintenant, Recréer →
 * Rien le jeudi, Garder pour un ancien). Toujours une décision permise
 * (`ckd_decisions_permises`).
 */
export function decisionDe(p: Pick<ADecider, "action" | "regle">, coche: boolean): DecisionCkd {
  if (coche) return p.action;
  if (p.action === "doubler") return "pas_maintenant";
  if (p.action === "recreer") return p.regle === "jeudi" ? "rien" : "garder";
  return "garder";
}

/** La raison d'une proposition, en une ligne, avec les nombres qui l'ont déclenchée. */
export type Raison =
  | { cle: "inactif"; mercredi: string | null }
  | { cle: "absent"; manques: number; attendus: number }
  | { cle: "premiere_semaine"; publies: number; haut: number | null }
  | { cle: "anciens"; mediane: number | null; reference: number | null }
  | { cle: "doubler"; bons: number; seuil: number | null }
  | { cle: "reveil" }
  | { cle: "shadowban" }
  | { cle: "autre" };

const nombre = (v: unknown): number | null => (typeof v === "number" ? v : typeof v === "string" && v !== "" ? Number(v) : null);

export function raison(p: Pick<ADecider, "regle" | "donnees" | "mercredi_at">): Raison {
  const d = p.donnees ?? {};
  const periode = (d.periode ?? {}) as Record<string, unknown>;
  const haut = (periode.haut ?? null) as { vues?: unknown } | null;
  const motifs = Array.isArray(d.motifs) ? (d.motifs as string[]) : [];
  const ref = (d.mediane_ref ?? null) as { valeur?: unknown } | null;
  switch (p.regle) {
    case "inactif":
      return { cle: "inactif", mercredi: p.mercredi_at };
    case "absent": {
      const attendus = nombre(periode.attendus) ?? 0;
      return { cle: "absent", attendus, manques: Math.max(0, attendus - (nombre(periode.publies) ?? 0)) };
    }
    case "premiere_semaine":
      return { cle: "premiere_semaine", publies: nombre(periode.publies) ?? 0, haut: nombre(haut?.vues) };
    case "anciens":
      return { cle: "anciens", mediane: nombre(periode.mediane), reference: nombre(ref?.valeur) };
    case "doubler":
      return {
        cle: "doubler",
        bons: nombre(periode.bons) ?? 0,
        seuil: nombre(((d.seuil_bon_post ?? null) as { valeur?: unknown } | null)?.valeur),
      };
    case "jeudi":
      return motifs.includes("reveil") ? { cle: "reveil" } : { cle: "shadowban" };
    default:
      return { cle: "autre" };
  }
}

// ---------------------------------------------------------------------------
// La semaine, en haut de page
// ---------------------------------------------------------------------------

/** Prompt 22, partie 5 : l'étape « Wed 12:00 » n'existe plus (plus de check du mercredi). */
export const MOMENTS = ["jeudi", "samedi", "dimanche", "lundi"] as const;
export type Moment = (typeof MOMENTS)[number];
export type EtatMoment = "fait" | "a_toi" | "a_venir";

/** Le lundi de la semaine affichée : le lundi lui-même montre encore la semaine d'avant (sa paie). */
export function lundiAffiche(aujourdhui: string): string {
  const veille = ajouterJours(aujourdhui, -1);
  const d = new Date(`${veille}T12:00:00Z`);
  const isodow = ((d.getUTCDay() + 6) % 7) + 1;
  return ajouterJours(veille, 1 - isodow);
}

/** Le lundi de la semaine d'un jour (Paris) : le nudge du jeudi de cette semaine (prompt 22, partie 5). */
export function lundiDeLaSemaine(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  const isodow = ((d.getUTCDay() + 6) % 7) + 1;
  return ajouterJours(jour, 1 - isodow);
}

/** L'instant (Paris) de chaque moment de la semaine du lundi `lundi`. */
export function heureMoment(lundi: string, m: Moment): Date {
  const h = (jour: number, heures: number, minutes = 0) =>
    new Date(minuitParis(ajouterJours(lundi, jour)).getTime() + (heures * 60 + minutes) * 60_000);
  switch (m) {
    case "jeudi":
      return h(3, 6);
    case "samedi":
      return h(5, 6);
    case "dimanche":
      return h(6, 23, 30);
    default:
      return h(7, 0);
  }
}

/** Done / Your turn / Upcoming : à venir avant l'heure ; ensuite, à toi tant qu'il reste quelque chose. */
export function etatMoment(m: Moment, s: SemaineDecisions, lundi: string, maintenant: Date): EtatMoment {
  if (maintenant.getTime() < heureMoment(lundi, m).getTime()) return "a_venir";
  switch (m) {
    case "jeudi":
      return s.jeudi.a_decider > 0 ? "a_toi" : "fait";
    case "samedi":
      return s.samedi.a_decider > 0 ? "a_toi" : "fait";
    case "lundi":
      return s.lundi.lignes > 0 && s.lundi.payees >= s.lundi.lignes ? "fait" : "a_toi";
    default:
      return "fait";
  }
}
