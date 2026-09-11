/** Helpers purs — réglages papier (durée, voix, pause, quota Fal). */

import { estIdentifiantVoix } from "./papierVoix";
import { bornerDureeClip, dureeCibleClip, DUREE_CLIP_MAX, DUREE_CLIP_MIN, type DureeCibleClip } from "./papierScript";
import {
  normaliserCategorie,
  normaliserStyleChoix,
  type PapierCategorie,
  type PapierStyleChoix,
} from "./papierSujets";
import { normaliserPipelineMode, type PapierPipelineMode } from "./papierPipeline";

export const VOIX_NARRATION_PAPIER = "5hg8RfXWJPAYypnW7dXa";
export const VOIX_NOVA = "BVBq6HVJVdnwOMJOqvy9";
export const VOIX_PETER = "ZthjuvLPty3kTMaNKVKb";
export const VOIX_BRADY = "kmjgtnoB3DMXA9wZpudu";
export const VOIX_ES_PAPIER = "o0SveC0zgHFuCsEO3vHR";
export const VOIX_DE_PAPIER = "NBqeXKdZHweef6y0B67V";

export const VOIX_PAPIER_DEFAUT = VOIX_NARRATION_PAPIER;

/** Voix papier par langue (FR = narration papier ; autres = IDs fournis). */
export const VOIX_SIMILAIRE_CM: Record<string, string> = {
  fr: VOIX_NARRATION_PAPIER,
  en: VOIX_PETER,
  de: VOIX_DE_PAPIER,
  es: VOIX_ES_PAPIER,
  it: VOIX_NARRATION_PAPIER,
  pt: VOIX_NARRATION_PAPIER,
  pl: VOIX_NARRATION_PAPIER,
  nl: VOIX_NARRATION_PAPIER,
  sv: VOIX_NARRATION_PAPIER,
  tr: VOIX_NARRATION_PAPIER,
  cs: VOIX_NARRATION_PAPIER,
  ro: VOIX_NARRATION_PAPIER,
  hu: VOIX_NARRATION_PAPIER,
  el: VOIX_NARRATION_PAPIER,
};

/** Choix ElevenLabs papier — Nova et Marishnou partagent le même ID. */
export const VOIX_PAPIER_CATALOGUE = [
  { id: VOIX_NARRATION_PAPIER, label: "Voix Narration Papier", hint: "FR" },
  { id: VOIX_NOVA, label: "Nova", hint: "FR" },
  { id: VOIX_NOVA, label: "Marishnou", hint: "FR" },
  { id: VOIX_PETER, label: "Peter", hint: "EN" },
  { id: VOIX_BRADY, label: "Brady", hint: "EN" },
  { id: VOIX_ES_PAPIER, label: "Voix papier", hint: "ES" },
  { id: VOIX_DE_PAPIER, label: "Voix papier", hint: "DE" },
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

export function idsVoixCataloguePourLangue(langue: string): string[] {
  const code = String(langue ?? "").trim().toLowerCase();
  const ids: string[] = [];
  for (const v of VOIX_PAPIER_CATALOGUE) {
    if (v.hint.toLowerCase() !== code) continue;
    if (!ids.includes(v.id)) ids.push(v.id);
  }
  return ids;
}

export function normaliserDureeClip(valeur: unknown): DureeClipReglage {
  if (valeur === "auto") return "auto";
  const n = typeof valeur === "number" ? valeur : Number(valeur);
  if (Number.isInteger(n) && n >= DUREE_CLIP_MIN && n <= DUREE_CLIP_MAX) return n;
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

export function voixSimilaireCm(langue: string): string {
  const code = String(langue ?? "").trim().toLowerCase();
  return VOIX_SIMILAIRE_CM[code] || VOIX_PAPIER_DEFAUT;
}

export function voixPourLangue(reglages: ReglagesPapier, langue: string): string {
  const code = String(langue ?? "").trim().toLowerCase();
  const surcharge = reglages.voix_par_langue[code]?.trim();
  if (surcharge) return surcharge;
  if (code === "fr") return reglages.voix || VOIX_PAPIER_DEFAUT;
  return voixSimilaireCm(code);
}

/** FR = voix du master. Autres langues : surcharge réglages, sinon voix papier de la langue. */
export function voixEffectiveMaster(
  masterVoice: string | null | undefined,
  reglages: ReglagesPapier,
  langue: string,
): string {
  const duMaster = String(masterVoice ?? "").trim();
  const code = String(langue ?? "").trim().toLowerCase();
  if (code === "fr") return duMaster || reglages.voix || VOIX_PAPIER_DEFAUT;
  return reglages.voix_par_langue[code]?.trim() || voixSimilaireCm(code) || duMaster || reglages.voix || VOIX_PAPIER_DEFAUT;
}

export function dureeCibleClipReglee(texte: string, clip: DureeClipReglage): DureeCibleClip {
  if (typeof clip === "number") return bornerDureeClip(clip);
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
