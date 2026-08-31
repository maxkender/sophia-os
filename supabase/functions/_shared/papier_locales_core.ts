/** Copie Deno de src/features/moteur/papierLocales.ts — garder synchro. */
/** Helpers purs du fan-out papier (langues, timings, CTA traduit). */

import { protegerNomSophia } from "./papier_script_core.ts";

export const LANGUES_PAPIER = [
  "fr",
  "en",
  "de",
  "it",
  "es",
  "pt",
  "cs",
  "nl",
  "el",
  "hu",
  "pl",
  "ro",
  "sv",
  "tr",
] as const;

export type CodeLanguePapier = (typeof LANGUES_PAPIER)[number];

export const NOM_LANGUE_MODELE: Record<CodeLanguePapier, string> = {
  fr: "français de France",
  en: "anglais (neutre, international)",
  de: "allemand (Hochdeutsch)",
  it: "italien",
  es: "espagnol d'Espagne",
  pt: "portugais du Brésil",
  cs: "tchèque",
  nl: "néerlandais",
  el: "grec moderne",
  hu: "hongrois",
  pl: "polonais",
  ro: "roumain",
  sv: "suédois",
  tr: "turc",
};

export type PapierWordTiming = { word: string; start: number; end: number };

export type PapierSceneTraduite = {
  index: number;
  narration: string;
  overlay: string;
};

export type PapierScriptTraduit = {
  title: string;
  hook: string;
  cta: string;
  hashtags: string[];
  scenes: PapierSceneTraduite[];
};

export function estLanguePapier(code: string): code is CodeLanguePapier {
  return (LANGUES_PAPIER as readonly string[]).includes(code);
}

export function nomLangueModele(code: string): string {
  return estLanguePapier(code) ? NOM_LANGUE_MODELE[code] : code;
}

export function wordTimingsEstimes(text: string, duration: number): PapierWordTiming[] {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length || !(duration > 0.3)) return [];
  const lead = Math.min(0.35, duration * 0.08);
  const tail = Math.min(0.2, duration * 0.04);
  const usable = Math.max(0.1, duration - lead - tail);
  const weights = words.map((w) => {
    const letters = w.replace(/[^\p{L}\p{N}]/gu, "").length;
    let weight = Math.max(2, letters) + 2;
    if (/[,;:]$/.test(w)) weight += 3;
    if (/[.!?…]$/.test(w)) weight += 5.5;
    return weight;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const out: PapierWordTiming[] = [];
  let t = lead;
  for (let i = 0; i < words.length; i++) {
    const span = (weights[i]! / total) * usable;
    out.push({ word: words[i]!, start: t, end: Math.min(duration - tail, t + span) });
    t += span;
  }
  return out;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalise les timestamps Fal ElevenLabs (formes variables). */
export function normaliserTimestampsFal(
  brut: unknown,
  fallbackText: string,
  fallbackDuration: number,
): PapierWordTiming[] {
  const raw = Array.isArray(brut)
    ? brut
    : brut && typeof brut === "object"
      ? ((brut as { timestamps?: unknown; words?: unknown }).timestamps ??
        (brut as { words?: unknown }).words ??
        [])
      : [];
  const list = Array.isArray(raw) ? raw : [];
  const words: PapierWordTiming[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const word = String(o.word ?? o.text ?? o.token ?? "").trim();
    const start = num(o.start ?? o.start_time ?? o.begin);
    const end = num(o.end ?? o.end_time ?? o.finish);
    if (!word || start === null || end === null) continue;
    words.push({ word, start, end: Math.max(end, start + 0.05) });
  }
  if (words.length) return words;
  return wordTimingsEstimes(fallbackText, fallbackDuration);
}

export function dureeDepuisTimings(words: PapierWordTiming[], fallback: number): number {
  if (!words.length) return fallback;
  const last = words[words.length - 1]!;
  return Math.max(fallback, last.end + 0.15);
}

export function finaliserTraductionPapier(
  brut: Partial<PapierScriptTraduit>,
  sceneCount: number,
): PapierScriptTraduit {
  const scenes = (Array.isArray(brut.scenes) ? brut.scenes : [])
    .slice(0, sceneCount)
    .map((s, i) => ({
      index: i,
      narration: protegerNomSophia(String(s?.narration ?? "").trim()),
      overlay: protegerNomSophia(String(s?.overlay ?? "").trim()),
    }));
  while (scenes.length < sceneCount) {
    scenes.push({ index: scenes.length, narration: "", overlay: "" });
  }
  const ctaBrut = protegerNomSophia(String(brut.cta ?? "").trim());
  let seen = false;
  const cta = ctaBrut
    .replace(/\bSophia\b/gi, (m) => {
      if (seen) return "l'appli";
      seen = true;
      return m;
    })
    .replace(/\s{2,}/g, " ")
    .trim();
  const scenesSansSophia = scenes.map((s, i) => {
    const estCta = i === scenes.length - 1;
    return {
      ...s,
      narration: estCta ? cta || s.narration.replace(/\bSophia\b/gi, "l'appli") : s.narration.replace(/\bSophia\b/gi, "l'appli"),
    };
  });
  const tags = Array.isArray(brut.hashtags)
    ? brut.hashtags.map((h) => String(h).trim()).filter(Boolean)
    : String(brut.hashtags ?? "")
        .split(/\s+/)
        .filter(Boolean);
  return {
    title: protegerNomSophia(String(brut.title ?? "").trim()),
    hook: protegerNomSophia(String(brut.hook ?? scenesSansSophia[0]?.narration ?? "").trim()),
    cta: cta || scenesSansSophia[scenesSansSophia.length - 1]?.narration || "",
    hashtags: tags
      .map((t) => (t.startsWith("#") ? t : `#${t}`))
      .slice(0, 3),
    scenes: scenesSansSophia,
  };
}

export function statutDepuisLocaleAssets(row: {
  script?: unknown;
  scenes?: Array<{ audio_url?: string | null; mix_url?: string | null }>;
  video_mix_url?: string | null;
  video_url?: string | null;
}): "queued" | "translating" | "voice" | "mix" | "render" | "karaoke" | "ready" {
  if (row.video_url) return "ready";
  if (row.video_mix_url) return "karaoke";
  const scenes = row.scenes ?? [];
  if (!row.script || scenes.length === 0) return "translating";
  if (scenes.some((s) => !s.audio_url)) return "voice";
  if (scenes.some((s) => !s.mix_url)) return "mix";
  return "render";
}
