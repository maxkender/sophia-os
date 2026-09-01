/** Helpers purs — réglages papier (durée, voix, pause, quota Fal). */

import { estIdentifiantVoix } from "./papierVoix";
import { dureeCibleClip, type DureeCibleClip } from "./papierScript";
import {
  normaliserCategorie,
  normaliserStyleChoix,
  type PapierCategorie,
  type PapierStyleChoix,
} from "./papierSujets";
import { normaliserPipelineMode, type PapierPipelineMode } from "./papierPipeline";

export const VOIX_PAPIER_DEFAUT = "locuteur-cm";

/** Catalogue ElevenLabs multilingual v2 — id = nom Fal. */
export const VOIX_PAPIER_CATALOGUE = [
  { id: "Alice", label: "Alice", hint: "FR" },
  { id: "Charlotte", label: "Charlotte", hint: "FR" },
  { id: "Daniel", label: "Daniel", hint: "FR" },
  { id: "George", label: "George", hint: "EN" },
  { id: "Liam", label: "Liam", hint: "EN" },
  { id: "Will", label: "Will", hint: "EN" },
  { id: "Chris", label: "Chris", hint: "EN" },
  { id: "Brian", label: "Brian", hint: "EN" },
  { id: "Bill", label: "Bill", hint: "EN" },
  { id: "Roger", label: "Roger", hint: "EN" },
  { id: "Adam", label: "Adam", hint: "EN" },
  { id: "Antoni", label: "Antoni", hint: "EN" },
  { id: "Arnold", label: "Arnold", hint: "EN" },
  { id: "Callum", label: "Callum", hint: "EN" },
  { id: "Charlie", label: "Charlie", hint: "EN" },
  { id: "Clyde", label: "Clyde", hint: "EN" },
  { id: "Dave", label: "Dave", hint: "EN" },
  { id: "Drew", label: "Drew", hint: "EN" },
  { id: "Eric", label: "Eric", hint: "EN" },
  { id: "Ethan", label: "Ethan", hint: "EN" },
  { id: "Fin", label: "Fin", hint: "EN" },
  { id: "Harry", label: "Harry", hint: "EN" },
  { id: "James", label: "James", hint: "EN" },
  { id: "Jeremy", label: "Jeremy", hint: "EN" },
  { id: "Joseph", label: "Joseph", hint: "EN" },
  { id: "Josh", label: "Josh", hint: "EN" },
  { id: "Michael", label: "Michael", hint: "EN" },
  { id: "Patrick", label: "Patrick", hint: "EN" },
  { id: "River", label: "River", hint: "EN" },
  { id: "Sam", label: "Sam", hint: "EN" },
  { id: "Thomas", label: "Thomas", hint: "EN" },
  { id: "Giovanni", label: "Giovanni", hint: "IT" },
  { id: "Lily", label: "Lily", hint: "EN" },
  { id: "Matilda", label: "Matilda", hint: "EN" },
  { id: "Jessica", label: "Jessica", hint: "EN" },
  { id: "Sarah", label: "Sarah", hint: "EN" },
  { id: "Laura", label: "Laura", hint: "EN" },
  { id: "Aria", label: "Aria", hint: "EN" },
  { id: "Bella", label: "Bella", hint: "EN" },
  { id: "Domi", label: "Domi", hint: "EN" },
  { id: "Dorothy", label: "Dorothy", hint: "EN" },
  { id: "Elli", label: "Elli", hint: "EN" },
  { id: "Emily", label: "Emily", hint: "EN" },
  { id: "Freya", label: "Freya", hint: "EN" },
  { id: "Gigi", label: "Gigi", hint: "EN" },
  { id: "Glinda", label: "Glinda", hint: "EN" },
  { id: "Grace", label: "Grace", hint: "EN" },
  { id: "Jessie", label: "Jessie", hint: "EN" },
  { id: "Mimi", label: "Mimi", hint: "EN" },
  { id: "Nicole", label: "Nicole", hint: "EN" },
  { id: "Rachel", label: "Rachel", hint: "EN" },
  { id: "Serena", label: "Serena", hint: "EN" },
] as const;

export const VOIX_PAPIER = VOIX_PAPIER_CATALOGUE.map((v) => v.id);

export type VoixPapier = (typeof VOIX_PAPIER)[number];
export type DureeClipReglage = DureeCibleClip | "auto";

export type ReglagesPapier = {
  /** false = cron + auto-chaîne à l'arrêt (l'admin peut encore forcer). */
  actif: boolean;
  /** Durée cible de la vidéo (secondes), hors marge CTA. */
  duree_cible_sec: number;
  /** Durée Seedance par plan, ou auto selon le texte. */
  duree_clip: DureeClipReglage;
  /** Voix ElevenLabs par défaut. */
  voix: string;
  /** Surcharge par code langue. */
  voix_par_langue: Record<string, string>;
  /** Voix mises en favori (affichées en premier). */
  voix_favoris: string[];
  /** Catégorie de sujet par défaut. */
  topic_categorie: PapierCategorie;
  /** Style de narration par défaut. */
  narration_style: PapierStyleChoix;
  /** auto = enchaîne tout ; manuel = validation sujet puis script. */
  pipeline_mode: PapierPipelineMode;
  /** Appels Fal / jour Paris. 0 = illimité. */
  fal_quota_jour: number;
};

export type PapierFalUsage = {
  date: string | null;
  appels: number;
};

export const REGLAGES_PAPIER_DEFAUT: ReglagesPapier = {
  actif: true,
  duree_cible_sec: 48,
  duree_clip: "auto",
  voix: VOIX_PAPIER_DEFAUT,
  voix_par_langue: {},
  voix_favoris: [],
  topic_categorie: "aleatoire",
  narration_style: "revelation",
  pipeline_mode: "auto",
  fal_quota_jour: 300,
};

export const QUOTA_FAL_PAPIER = "QUOTA_FAL_PAPIER";

export function estVoixPapier(nom: string): boolean {
  return estIdentifiantVoix(nom);
}

export function labelVoixPapier(nom: string): string {
  const row = VOIX_PAPIER_CATALOGUE.find((v) => v.id === nom);
  return row ? `${row.label} · ${row.hint}` : nom;
}

export function voixOrdonnees(favoris: string[], toutes: readonly string[] = VOIX_PAPIER): string[] {
  const fav = favoris.map((v) => v.trim()).filter((v) => toutes.includes(v));
  const rest = toutes.filter((v) => !fav.includes(v));
  return [...new Set([...fav, ...rest])];
}

export function normaliserDureeClip(valeur: unknown): DureeClipReglage {
  if (valeur === 4 || valeur === 6 || valeur === 8 || valeur === "auto") return valeur;
  if (valeur === "4" || valeur === "6" || valeur === "8") return Number(valeur) as DureeCibleClip;
  return "auto";
}

export function normaliserReglagesPapier(brut: unknown): ReglagesPapier {
  const o = brut && typeof brut === "object" ? (brut as Record<string, unknown>) : {};
  const sec = Number(o.duree_cible_sec);
  const quota = Number(o.fal_quota_jour);
  const voix = String(o.voix ?? "").trim() || VOIX_PAPIER_DEFAUT;
  const par: Record<string, string> = {};
  if (o.voix_par_langue && typeof o.voix_par_langue === "object" && !Array.isArray(o.voix_par_langue)) {
    for (const [code, nom] of Object.entries(o.voix_par_langue)) {
      const v = String(nom ?? "").trim();
      if (v) par[String(code).trim().toLowerCase()] = v;
    }
  }
  const favoris = Array.isArray(o.voix_favoris)
    ? o.voix_favoris.map((v) => String(v ?? "").trim()).filter((v) => estIdentifiantVoix(v))
    : [];
  return {
    actif: o.actif !== false,
    duree_cible_sec: Number.isFinite(sec) ? Math.min(90, Math.max(20, Math.round(sec))) : 48,
    duree_clip: normaliserDureeClip(o.duree_clip),
    voix,
    voix_par_langue: par,
    voix_favoris: [...new Set(favoris)],
    topic_categorie: normaliserCategorie(o.topic_categorie),
    narration_style: normaliserStyleChoix(o.narration_style),
    pipeline_mode: normaliserPipelineMode(o.pipeline_mode),
    fal_quota_jour: Number.isFinite(quota) ? Math.max(0, Math.round(quota)) : 300,
  };
}

export function voixPourLangue(reglages: ReglagesPapier, langue: string): string {
  return reglages.voix_par_langue[langue]?.trim() || reglages.voix || VOIX_PAPIER_DEFAUT;
}

/** FR = voix du master. Autres langues : surcharge réglages, sinon voix du master. */
export function voixEffectiveMaster(
  masterVoice: string | null | undefined,
  reglages: ReglagesPapier,
  langue: string,
): string {
  const duMaster = String(masterVoice ?? "").trim();
  if (langue === "fr") return duMaster || reglages.voix || VOIX_PAPIER_DEFAUT;
  return reglages.voix_par_langue[langue]?.trim() || duMaster || reglages.voix || VOIX_PAPIER_DEFAUT;
}

export function dureeCibleClipReglee(texte: string, clip: DureeClipReglage): DureeCibleClip {
  if (clip === 4 || clip === 6 || clip === 8) return clip;
  return dureeCibleClip(texte);
}

export function usageFalDuJour(
  row: { date?: string | null; appels?: number } | null | undefined,
  aujourdHui: string,
): number {
  if (!row || row.date !== aujourdHui) return 0;
  const n = Number(row.appels);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** quota ≤ 0 = illimité. */
export function peutReserverFal(usage: number, quota: number, n = 1): boolean {
  if (quota <= 0) return true;
  return usage + n <= quota;
}

export function erreurQuotaFal(usage: number, quota: number): Error {
  const e = new Error(`Quota Fal papier atteint (${usage}/${quota})`);
  e.name = QUOTA_FAL_PAPIER;
  return e;
}

export function estErreurQuotaFal(e: unknown): boolean {
  return e instanceof Error && e.name === QUOTA_FAL_PAPIER;
}
