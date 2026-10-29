/**
 * Messages sent → Timing (prompt 22, partie 6.4) : les délais et les heures
 * d'envoi, lus et écrits dans quatre réglages (admin seulement, vérifiés en
 * base) : etapes_delais, lundi_soir_heure, semaine_heures, double_popup_expire.
 * Rien ici ne touche la base.
 */
import { KILL_H_MIN } from "@/features/nudges/api";

export interface Timing {
  connexion_message_h: number;
  tiktok_message_h: number;
  warmup_lance_message_h: number;
  /** Le jour (ISO, 4 à 7) et l'heure du message de l'étape 4, avant le lundi de la cohorte. */
  warmup_bien_fait_jour: number;
  warmup_bien_fait_heure: number;
  kill_h: number;
  kill_annulation_h: number;
  /** La fenêtre d'envoi des messages d'étape, heure du pays. */
  fenetre_debut: number;
  fenetre_fin: number;
  /** Le message du lundi, le nudge du jeudi, et l'heure après laquelle ils ne partent plus (semaine_heures). */
  lundi_heure: number;
  jeudi_heure: number;
  semaine_fin: number;
  /** Le check du lundi soir (lundi_soir_heure). */
  lundi_soir_heure: number;
  /** La fin de l'offre Double (double_popup_expire). */
  double_jour_iso: number;
  double_heure: string;
  /** Prompt 25 v4 : relances Upwork au plus par recrue ; au-delà, Slack seulement (relances_upwork_max_par_recrue). */
  relances_upwork_max: number;
  /** Prompt 25 MAJ : les freins (freins_envoi) : plafond par type et par heure, part des destinataires déjà à jour (%). */
  frein_plafond_heure: number;
  frein_part_deja_faite: number;
}

export const CLES_TIMING = ["etapes_delais", "lundi_soir_heure", "semaine_heures", "double_popup_expire", "relances_upwork_max_par_recrue", "freins_envoi"] as const;

const objet = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const nombre = (v: unknown, d: number) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

/** Les valeurs lues, les manquantes remplacées par le défaut (celui des fonctions). */
export function lireTiming(v: Record<string, unknown>): Timing {
  const e = objet(v.etapes_delais);
  const s = objet(v.semaine_heures);
  const d = objet(v.double_popup_expire);
  const f = objet(v.freins_envoi);
  return {
    connexion_message_h: nombre(e.connexion_message_h, 24),
    tiktok_message_h: nombre(e.tiktok_message_h, 48),
    warmup_lance_message_h: nombre(e.warmup_lance_message_h, 24),
    warmup_bien_fait_jour: nombre(e.warmup_bien_fait_jour, 6),
    warmup_bien_fait_heure: nombre(e.warmup_bien_fait_heure, 12),
    kill_h: nombre(e.kill_h, 48),
    kill_annulation_h: nombre(e.kill_annulation_h, 12),
    fenetre_debut: nombre(e.fenetre_debut, 10),
    fenetre_fin: nombre(e.fenetre_fin, 20),
    lundi_heure: nombre(s.lundi_heure, 10),
    jeudi_heure: nombre(s.jeudi_heure, 12),
    semaine_fin: nombre(s.fin, 20),
    lundi_soir_heure: nombre(v.lundi_soir_heure, 20),
    double_jour_iso: nombre(d.jour_iso, 3),
    double_heure: typeof d.heure === "string" ? d.heure : "23:59",
    relances_upwork_max: nombre(v.relances_upwork_max_par_recrue, 5),
    frein_plafond_heure: nombre(f.plafond_heure, 40),
    frein_part_deja_faite: nombre(f.part_deja_faite, 20),
  };
}

export type ErreurTiming = "kill_min" | "heure" | "fenetre" | "delai" | "nombre";

/** Ce qui empêche d'enregistrer : le Kill sous 24 h (A7), une heure hors 0-23, une fenêtre vide. */
export function erreursTiming(t: Timing): ErreurTiming[] {
  const e: ErreurTiming[] = [];
  if (!(t.kill_h >= KILL_H_MIN)) e.push("kill_min");
  const heures = [t.warmup_bien_fait_heure, t.fenetre_debut, t.fenetre_fin, t.lundi_heure, t.jeudi_heure, t.semaine_fin, t.lundi_soir_heure];
  if (heures.some((h) => !Number.isInteger(h) || h < 0 || h > 24)) e.push("heure");
  if (!(t.fenetre_debut < t.fenetre_fin)) e.push("fenetre");
  const delais = [t.connexion_message_h, t.tiktok_message_h, t.warmup_lance_message_h, t.kill_annulation_h];
  if (delais.some((h) => !(h > 0))) e.push("delai");
  if (!Number.isInteger(t.relances_upwork_max) || t.relances_upwork_max < 0) e.push("nombre");
  if (!Number.isInteger(t.frein_plafond_heure) || t.frein_plafond_heure < 1) e.push("nombre");
  if (!(t.frein_part_deja_faite > 0 && t.frein_part_deja_faite <= 100)) e.push("nombre");
  return e;
}

/** Les 4 réglages à écrire, fusionnés avec ce qui a été relu juste avant (les autres champs restent). */
export function valeursTiming(t: Timing, frais: Record<string, unknown>): Record<string, unknown> {
  return {
    etapes_delais: {
      ...objet(frais.etapes_delais),
      connexion_message_h: t.connexion_message_h,
      tiktok_message_h: t.tiktok_message_h,
      warmup_lance_message_h: t.warmup_lance_message_h,
      warmup_bien_fait_jour: t.warmup_bien_fait_jour,
      warmup_bien_fait_heure: t.warmup_bien_fait_heure,
      kill_h: t.kill_h,
      kill_annulation_h: t.kill_annulation_h,
      fenetre_debut: t.fenetre_debut,
      fenetre_fin: t.fenetre_fin,
    },
    lundi_soir_heure: t.lundi_soir_heure,
    semaine_heures: { ...objet(frais.semaine_heures), lundi_heure: t.lundi_heure, jeudi_heure: t.jeudi_heure, fin: t.semaine_fin },
    double_popup_expire: { ...objet(frais.double_popup_expire), jour_iso: t.double_jour_iso, heure: t.double_heure },
    relances_upwork_max_par_recrue: t.relances_upwork_max,
    freins_envoi: { ...objet(frais.freins_envoi), plafond_heure: t.frein_plafond_heure, part_deja_faite: t.frein_part_deja_faite },
  };
}
