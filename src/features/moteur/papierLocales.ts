/** Helpers purs du fan-out papier (langues, timings, CTA traduit). */

import { protegerNomSophia } from "./papierScript";

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

/** FR d'abord, puis la prochaine langue pas encore ready/failed. */
export function prochaineLangueATiquer(
  rows: Array<{ id: string; langue: string; statut: string }>,
): string | null {
  const pending = (s: string) => s !== "ready" && s !== "failed";
  const fr = rows.find((r) => r.langue === "fr");
  if (fr && pending(fr.statut)) return fr.id;
  const other = rows.find((r) => r.langue !== "fr" && pending(r.statut));
  return other?.id ?? null;
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

export type PapierSousTitre = { start: number; end: number; text: string };

const SOUS_TITRES_MAX = 500;

export function grouperMotsEnCartons(
  words: PapierWordTiming[],
  motsParCarton = 1,
): PapierSousTitre[] {
  const n = Math.max(1, Math.floor(motsParCarton));
  const out: PapierSousTitre[] = [];
  for (let i = 0; i < words.length; i += n) {
    const chunk = words.slice(i, i + n);
    const first = chunk[0]!;
    const last = chunk[chunk.length - 1]!;
    const text = chunk.map((w) => w.word).join(" ").trim();
    if (!text) continue;
    out.push({
      start: Math.max(0, first.start),
      end: Math.max(last.end, first.start + 0.08),
      text,
    });
  }
  return out;
}

/** Cartons karaoke alignés sur le concat (offset = durée du plan, sinon voix). */
export function sousTitresDepuisScenes(
  scenes: Array<{
    index: number;
    narration?: string | null;
    words?: unknown;
    duree_sec?: number | null;
    duree_plan?: number | null;
  }>,
  motsParCarton = 1,
): PapierSousTitre[] {
  const ordered = [...scenes].sort((a, b) => a.index - b.index);
  let mots = Math.max(1, Math.floor(motsParCarton));
  for (let tour = 0; tour < 8; tour++) {
    const out: PapierSousTitre[] = [];
    let offset = 0;
    for (const scene of ordered) {
      const dureeVoix = Number(scene.duree_sec ?? 0);
      const dureePlan = Number(scene.duree_plan ?? 0);
      const fallback = dureeVoix > 0.3 ? dureeVoix : dureePlan > 0.3 ? dureePlan : 2;
      const words = normaliserTimestampsFal(scene.words, scene.narration ?? "", fallback);
      for (const carton of grouperMotsEnCartons(words, mots)) {
        out.push({
          start: Math.round((offset + carton.start) * 1000) / 1000,
          end: Math.round((offset + carton.end) * 1000) / 1000,
          text: carton.text,
        });
      }
      const dernier = words.length ? words[words.length - 1] : undefined;
      const span =
        dureePlan > 0.3 ? dureePlan : dureeVoix > 0.3 ? dureeVoix : dernier?.end ?? 0;
      offset += span;
    }
    if (out.length <= SOUS_TITRES_MAX) return out;
    mots += 1;
  }
  return [];
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

/** Concat brute / lot partiel / pad — pas encore le cadre 9:16, donc pas exportable. */
export function mixEstIntermediaire(path?: string | null, etape?: string | null): boolean {
  const p = path ?? "";
  return (
    etape === "cadre" ||
    etape === "pad" ||
    p.includes("mix-raw") ||
    p.includes("mix-part") ||
    p.includes("mix-pad")
  );
}

/** Mix déjà cadré 9:16 (masque 832). mix-pad 1 fps n'est pas un cadre. */
export function mixEstSurCanvasTikTok(path?: string | null): boolean {
  const p = path ?? "";
  return p.endsWith("/mix.mp4") || p.includes("/final.mp4");
}

export function etapeAssemblage(row: {
  video_url?: string | null;
  video_mix_url?: string | null;
  video_mix_path?: string | null;
  etape?: string | null;
}): "merge" | "pad" | "cadre" | "karaoke" | "ready" {
  if (row.video_url) return "ready";
  const p = row.video_mix_path ?? "";
  if (p.includes("mix-part")) return "merge";
  if (p.includes("mix-pad") || p.includes("mix-raw") || row.etape === "cadre" || row.etape === "pad") {
    return "cadre";
  }
  if (row.video_mix_url) return "karaoke";
  return "merge";
}

/** Plus d'auto-kick Fal depuis l'onglet admin (c'était la boucle à 90 s / 4 min). */
export const RELANCE_AUTO_MS = 240_000;

export function langueDoitRelancerAuto(
  _l?: { statut: string; busy?: boolean; updated_at?: string | null },
  _now = Date.now(),
): boolean {
  return false;
}

export function langueFrAContinuer(
  langues: Array<{ langue: string; statut: string; id: string }> | null | undefined,
): { id: string; statut: string } | null {
  const fr = (langues ?? []).find((l) => l.langue === "fr" && l.statut !== "ready");
  return fr ? { id: fr.id, statut: fr.statut } : null;
}

/** Tick Fal encore en cours : Continue doit rester grisé, pas relancer. */
export function langueCaptionsEnCours(
  l?: { busy?: boolean; statut?: string } | null,
): boolean {
  if (!l) return false;
  if (l.statut === "ready" || l.statut === "failed") return false;
  return Boolean(l.busy);
}

export function urlVideoExportable(row: {
  video_url?: string | null;
  video_mix_url?: string | null;
  video_mix_path?: string | null;
  etape?: string | null;
}): string | null {
  if (row.video_url) return row.video_url;
  if (row.video_mix_url && !mixEstIntermediaire(row.video_mix_path, row.etape)) {
    return row.video_mix_url;
  }
  return null;
}

export function statutDepuisLocaleAssets(row: {
  script?: unknown;
  scenes?: Array<{ audio_url?: string | null; mix_url?: string | null }>;
  video_mix_url?: string | null;
  video_mix_path?: string | null;
  video_url?: string | null;
  etape?: string | null;
}): "queued" | "translating" | "voice" | "mix" | "render" | "karaoke" | "ready" {
  if (row.video_url) return "ready";
  if (row.video_mix_url && !mixEstIntermediaire(row.video_mix_path, row.etape)) return "karaoke";
  const scenes = row.scenes ?? [];
  if (!row.script || scenes.length === 0) return "translating";
  if (scenes.some((s) => !s.audio_url)) return "voice";
  if (scenes.some((s) => !s.mix_url)) return "mix";
  return "render";
}
