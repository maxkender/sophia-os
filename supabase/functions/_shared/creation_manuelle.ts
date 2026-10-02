/**
 * Création semi-manuelle + résolution d'images à l'assignation.
 * Matching aligné sur src/features/moteur/creationManuelle.ts
 */

import { generateTextCreative } from "./gemini.ts";
import { LANGUES_CIBLES } from "./import_contenu.ts";
import { decouperEnLots } from "./oubli_source_cible.ts";
import { chargerPrompt, messageErreur, serviceClient } from "./supabase.ts";

/** Au-delà, PostgREST répond 400 Bad Request (URL `.in()` trop longue). */
const LOT_IN = 80;

export type Supabase = ReturnType<typeof serviceClient>;

export const ELO_MANUEL_DEFAUT = 65;
export const SLIDES_MANUEL_MIN = 2;
export const SLIDES_MANUEL_MAX = 12;
export const SLUG_HOOK = "hook";

const STOP = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "with", "for", "from",
  "de", "du", "des", "la", "le", "les", "un", "une", "et", "ou", "en", "au",
  "aux", "d", "l", "el", "los", "las", "und", "der", "die", "das",
  "this", "that", "your", "you", "est", "pas", "plus", "dans", "qui", "que",
  "pour", "par", "sur", "how", "why", "what", "when", "not", "are",
]);

const ALIAS: Record<string, string[]> = {
  cafe: ["coffee", "espresso", "latte", "cappuccino"],
  coffee: ["cafe", "espresso"],
  livre: ["book", "books"],
  book: ["livre", "books"],
  books: ["book", "livre"],
  lecture: ["reading", "book"],
  reading: ["lecture", "book"],
  femme: ["woman", "girl"],
  woman: ["femme", "girl"],
  homme: ["man", "guy"],
  man: ["homme", "guy"],
  voiture: ["car"],
  car: ["voiture"],
  argent: ["money", "cash"],
  money: ["argent", "cash"],
  sport: ["gym", "fitness", "workout"],
  gym: ["sport", "fitness", "workout"],
  cuisine: ["kitchen"],
  kitchen: ["cuisine"],
  plage: ["beach"],
  beach: ["plage"],
  ville: ["city"],
  city: ["ville"],
  rue: ["street"],
  street: ["rue"],
  bureau: ["office", "desk"],
  office: ["bureau"],
  matin: ["morning"],
  morning: ["matin"],
  nuit: ["night"],
  night: ["nuit"],
};

export function normaliserRecherche(brut: string): string {
  return brut
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function tokeniserCritere(brut: string): string[] {
  return normaliserRecherche(brut)
    .split(/[^a-z0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

export function requeteVisuel(
  critere?: string | null,
  texte?: string | null,
): string {
  return [critere, texte]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

export function scoreCaptionCritere(caption: string, requete: string): number {
  const tokens = tokeniserCritere(requete).filter((t) => t.length >= 3);
  const hay = normaliserRecherche(caption);
  if (tokens.length === 0 || !hay) return 0;
  let hit = 0;
  for (const tok of tokens) {
    const variantes = [tok, ...(ALIAS[tok] ?? [])].map(normaliserRecherche);
    if (variantes.some((v) => v.length >= 3 && hay.includes(v))) hit += 1;
  }
  return hit / tokens.length;
}

export function tokensCaptionMatches(caption: string, requete: string): string[] {
  const tokens = tokeniserCritere(requete).filter((t) => t.length >= 3);
  const hay = normaliserRecherche(caption);
  return tokens.filter((tok) =>
    [tok, ...(ALIAS[tok] ?? [])]
      .map(normaliserRecherche)
      .some((v) => v.length >= 3 && hay.includes(v)),
  );
}

export interface MediaCaptionCandidat {
  id: string;
  url?: string;
  caption?: string | null;
  est_hook?: boolean;
}

export interface TirageVisuel<T extends MediaCaptionCandidat> {
  media: T | null;
  score: number;
  fallback: boolean;
  motif: string;
}

export function tirerMediaParCritere<T extends MediaCaptionCandidat>(
  pool: T[],
  critere: string,
  exclus: Set<string>,
  rng: () => number = Math.random,
): TirageVisuel<T> {
  const disponibles = pool.filter((m) => !exclus.has(m.id));
  if (disponibles.length === 0) {
    return { media: null, score: 0, fallback: true, motif: "pool vide" };
  }
  const tokens = tokeniserCritere(critere).filter((t) => t.length >= 3);
  if (tokens.length > 0) {
    let meilleur: T | null = null;
    let meilleurScore = 0;
    for (const m of disponibles) {
      const s = scoreCaptionCritere(m.caption ?? "", critere);
      if (s > meilleurScore) {
        meilleur = m;
        meilleurScore = s;
      }
    }
    if (meilleur && meilleurScore > 0) {
      const hits = tokensCaptionMatches(meilleur.caption ?? "", critere);
      return {
        media: meilleur,
        score: meilleurScore,
        fallback: false,
        motif: `match «${hits.slice(0, 4).join(", ")}» (${Math.round(meilleurScore * 100)} %)`,
      };
    }
  }
  const pick = disponibles[Math.floor(rng() * disponibles.length)]!;
  const avecCaption = disponibles.some((m) => String(m.caption ?? "").trim());
  return {
    media: pick,
    score: 0,
    fallback: true,
    motif: !tokens.length
      ? "critère vide → aléatoire du label"
      : avecCaption
        ? "aucun match caption → aléatoire du label"
        : "aucune caption dans le pool → aléatoire",
  };
}

function extraireJsonObjet(brut: string): Record<string, unknown> | null {
  const t = brut.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const corps = fence?.[1]?.trim() ?? t;
  const debut = corps.indexOf("{");
  const fin = corps.lastIndexOf("}");
  if (debut < 0 || fin <= debut) return null;
  try {
    return JSON.parse(corps.slice(debut, fin + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export interface SlideGeneree {
  position: number;
  texte: string;
  critere: string;
}

export function parserSlidesGenerees(
  brut: string,
  opts: { hook: string; nbSlides: number },
): SlideGeneree[] {
  const json = extraireJsonObjet(brut);
  const raw = json?.slides;
  const out: SlideGeneree[] = [{ position: 1, texte: opts.hook.trim(), critere: "" }];
  if (!Array.isArray(raw)) return completerSlides(out, opts.nbSlides);
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const pos = Number(o.position ?? o.slide ?? 0);
    const texte = String(o.texte ?? o.text ?? o.overlay ?? "").trim();
    const critere = String(o.critere ?? o.criterion ?? o.keywords ?? "").trim();
    if (!texte || pos === 1) continue;
    out.push({
      position: Number.isFinite(pos) && pos >= 2 ? pos : out.length + 1,
      texte,
      critere,
    });
  }
  out.sort((a, b) => a.position - b.position);
  const uniques: SlideGeneree[] = [];
  for (const s of out) {
    if (uniques.some((u) => u.position === s.position)) continue;
    uniques.push(s);
  }
  return completerSlides(uniques, opts.nbSlides);
}

function completerSlides(slides: SlideGeneree[], nb: number): SlideGeneree[] {
  const cible = Math.min(SLIDES_MANUEL_MAX, Math.max(SLIDES_MANUEL_MIN, nb));
  const byPos = new Map(slides.map((s) => [s.position, s]));
  const hook = byPos.get(1)?.texte ?? "";
  const out: SlideGeneree[] = [];
  for (let p = 1; p <= cible; p += 1) {
    const exist = byPos.get(p);
    if (exist) out.push({ ...exist, position: p });
    else if (p === 1) out.push({ position: 1, texte: hook, critere: "" });
    else out.push({ position: p, texte: "", critere: "" });
  }
  return out;
}

export function normaliserEloManuel(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return ELO_MANUEL_DEFAUT;
  return Math.min(100, Math.max(0, n));
}

export async function chargerBiblioLabel(
  supabase: Supabase,
  labelId: string,
  opts: { hookSeulement?: boolean; exclureHook?: boolean } = {},
): Promise<Array<{ id: string; url: string; caption: string | null; est_hook: boolean }>> {
  const { data: liens, error: errL } = await supabase
    .from("media_labels")
    .select("media_id")
    .eq("label_id", labelId)
    .limit(800);
  if (errL) throw errL;
  const ids = [...new Set((liens ?? []).map((l) => l.media_id as string))];
  if (ids.length === 0) return [];

  const out: Array<{ id: string; url: string; caption: string | null; est_hook: boolean }> = [];
  for (const lot of decouperEnLots(ids, LOT_IN)) {
    let q = supabase
      .from("media_library")
      .select("id, url, caption, est_hook")
      .in("id", lot)
      .like("storage_path", "propre/%")
      .eq("texte_restant", false);
    if (opts.hookSeulement) q = q.eq("est_hook", true);
    if (opts.exclureHook) q = q.eq("est_hook", false);
    const { data, error } = await q;
    if (error) throw error;
    for (const m of data ?? []) {
      out.push({
        id: m.id as string,
        url: m.url as string,
        caption: (m.caption as string | null) ?? null,
        est_hook: Boolean(m.est_hook),
      });
    }
  }
  return out.slice(0, 400);
}

export interface SlideBrouillon {
  position: number;
  texte: string;
  critere: string;
  pinned: boolean;
  media_id: string | null;
  preview_media_id?: string | null;
  preview_url?: string | null;
  fallback?: boolean;
  motif?: string;
}

export async function apercuTirages(
  supabase: Supabase,
  labelId: string,
  slides: SlideBrouillon[],
): Promise<SlideBrouillon[]> {
  const hooks = await chargerBiblioLabel(supabase, labelId, { hookSeulement: true });
  const pool = await chargerBiblioLabel(supabase, labelId, { exclureHook: true });
  const exclus = new Set<string>();
  const connus = [...hooks, ...pool];
  return slides.map((s) => {
    if (s.pinned && s.media_id) {
      exclus.add(s.media_id);
      const known = connus.find((m) => m.id === s.media_id);
      return {
        ...s,
        preview_media_id: s.media_id,
        preview_url: known?.url ?? s.preview_url ?? null,
        fallback: false,
        motif: "pinned",
      };
    }
    const source = s.position === 1 ? hooks : pool;
    const tirage = tirerMediaParCritere(source, requeteVisuel(s.critere, s.texte), exclus);
    if (tirage.media) exclus.add(tirage.media.id);
    const estHook = s.position === 1;
    return {
      ...s,
      pinned: estHook ? true : s.pinned,
      media_id: estHook ? (tirage.media?.id ?? s.media_id) : s.media_id,
      preview_media_id: tirage.media?.id ?? null,
      preview_url: tirage.media?.url ?? null,
      fallback: tirage.fallback,
      motif: tirage.motif,
    };
  });
}

export async function genererSlidesManuelles(
  supabase: Supabase,
  opts: {
    labelId: string;
    hook: string;
    nbSlides: number;
    promptExtra?: string | null;
  },
): Promise<SlideGeneree[]> {
  const { data: label, error } = await supabase
    .from("labels")
    .select("id, nom, style_theme, prompt_creation, exemples_feed")
    .eq("id", opts.labelId)
    .maybeSingle();
  if (error) throw error;
  if (!label) throw new Error("Label introuvable");

  const feed = Array.isArray(label.exemples_feed)
    ? (label.exemples_feed as unknown[]).map((x) => String(x).trim()).filter(Boolean)
    : [];
  const base = (await chargerPrompt(supabase, "creation_semi_manuelle")) ?? "";
  const nb = Math.min(SLIDES_MANUEL_MAX, Math.max(SLIDES_MANUEL_MIN, opts.nbSlides));
  const prompt = [
    base,
    `Label : ${label.nom}`,
    label.style_theme ? `Thème / style :\n${label.style_theme}` : null,
    label.prompt_creation ? `Prompt du label :\n${label.prompt_creation}` : null,
    feed.length
      ? `Exemples de textes déjà rédigés pour ce label (imite le format, pas le fond) :\n${feed.map((e, i) => `${i + 1}. ${e}`).join("\n")}`
      : null,
    `Hook (slide 1, ne pas réécrire) : ${opts.hook}`,
    `Nombre total de slides : ${nb} (donc ${nb - 1} conseils après le hook).`,
    opts.promptExtra?.trim() ? `Consigne supplémentaire de l'admin :\n${opts.promptExtra.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const brut = await generateTextCreative(prompt, 0.85);
  const slides = parserSlidesGenerees(brut, { hook: opts.hook, nbSlides: nb });
  if (slides.length < 2) {
    throw new Error(`Génération incomplète (${slides.length} slide(s)) — ${brut.slice(0, 180)}`);
  }
  return slides;
}

export interface SlideStructureManuel {
  position: number;
  media_id: string | null;
  pinned: boolean;
  critere: string | null;
  raw_url?: string | null;
  reference_url?: string | null;
}

export async function validerSlideshowManuel(
  supabase: Supabase,
  opts: {
    labelId: string;
    hook: string;
    hookContenuId?: string | null;
    elo?: number;
    langueSource?: string | null;
    slides: SlideBrouillon[];
  },
): Promise<{ id: string }> {
  if (opts.slides.length < SLIDES_MANUEL_MIN) {
    throw new Error("Au moins 2 slides");
  }
  if (opts.slides.some((s) => !String(s.texte ?? "").trim())) {
    throw new Error("Chaque slide doit avoir un texte");
  }
  const hookSlide = opts.slides.find((s) => s.position === 1);
  const hookMediaId = hookSlide?.media_id || hookSlide?.preview_media_id || null;
  if (!hookMediaId) {
    throw new Error("La slide Hook doit avoir une image pinnée");
  }

  let musique: {
    musique_url: string | null;
    musique_titre: string | null;
    musique_plateforme: string | null;
    langue_source: string;
    compte_reference_id: string | null;
  } = {
    musique_url: null,
    musique_titre: null,
    musique_plateforme: null,
    langue_source: opts.langueSource || "en",
    compte_reference_id: null,
  };
  if (opts.hookContenuId) {
    const { data: src } = await supabase
      .from("contenus")
      .select("musique_url, musique_titre, musique_plateforme, langue_source, compte_reference_id")
      .eq("id", opts.hookContenuId)
      .maybeSingle();
    if (src) {
      musique = {
        musique_url: src.musique_url ?? null,
        musique_titre: src.musique_titre ?? null,
        musique_plateforme: src.musique_plateforme ?? null,
        langue_source: opts.langueSource || (src.langue_source as string) || "en",
        compte_reference_id: src.compte_reference_id ?? null,
      };
    }
  }

  const structure: SlideStructureManuel[] = opts.slides
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => {
      const pinned = s.position === 1 || Boolean(s.pinned && s.media_id);
      const mediaId = s.position === 1 ? hookMediaId : pinned ? s.media_id : null;
      return {
        position: s.position,
        media_id: mediaId,
        pinned,
        critere: s.position === 1 ? null : (s.critere || null),
        raw_url: null,
        reference_url: null,
      };
    });

  const elo = normaliserEloManuel(opts.elo);
  const titre = (opts.hook || hookSlide.texte || "Sans titre").slice(0, 160);

  const { data: contenu, error } = await supabase
    .from("contenus")
    .insert({
      titre,
      structure_slides: structure,
      compte_reference_id: musique.compte_reference_id,
      source_url: null,
      langue_source: musique.langue_source,
      musique_url: musique.musique_url,
      musique_titre: musique.musique_titre,
      musique_plateforme: musique.musique_plateforme,
      pertinence_score: elo,
      statut: "valide",
      import_statut: "done",
      import_etape: "done",
      import_erreur: null,
      profondeur: 0,
      creation_mode: "manuel",
      hook_contenu_id: opts.hookContenuId ?? null,
    })
    .select("id")
    .single();
  if (error || !contenu) throw error ?? new Error("Création contenu échouée");

  const { error: errLab } = await supabase
    .from("contenu_labels")
    .upsert({ contenu_id: contenu.id, label_id: opts.labelId }, { onConflict: "contenu_id,label_id" });
  if (errLab) throw errLab;

  const deckSource = opts.slides
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      position: s.position,
      texte_overlay: s.texte ?? "",
      position_sophia: false,
    }));

  const langues = LANGUES_CIBLES.map((langue) => ({
    contenu_id: contenu.id,
    langue,
    slides: langue === musique.langue_source ? deckSource : [],
    score: elo,
    nb_passages: 0,
    score_maj_at: new Date().toISOString(),
  }));
  const { error: errL } = await supabase.from("contenu_langues").insert(langues);
  if (errL) throw errL;

  return { id: contenu.id };
}

export interface ResolutionVisuelLigne {
  position: number;
  media_id: string | null;
  pinned: boolean;
  critere: string | null;
  fallback: boolean;
  motif: string;
}

/**
 * Résout les media_id d'un slideshow manuel à l'assignation.
 * Slides pinnées (dont le hook) restent figées.
 */
export async function resoudreVisuelsAssignation(
  supabase: Supabase,
  contenuId: string,
  structure: SlideStructureManuel[],
): Promise<{ parPos: Map<number, string | null>; logs: ResolutionVisuelLigne[] }> {
  const { data: liens } = await supabase
    .from("contenu_labels")
    .select("label_id")
    .eq("contenu_id", contenuId);
  const labelId = (liens ?? [])[0]?.label_id as string | undefined;

  const hooks = labelId
    ? await chargerBiblioLabel(supabase, labelId, { hookSeulement: true })
    : [];
  const pool = labelId
    ? await chargerBiblioLabel(supabase, labelId, { exclureHook: true })
    : [];

  const { data: contenu } = await supabase
    .from("contenus")
    .select("langue_source")
    .eq("id", contenuId)
    .maybeSingle();
  const { data: decks } = await supabase
    .from("contenu_langues")
    .select("langue, slides")
    .eq("contenu_id", contenuId);
  const langue = (contenu?.langue_source as string | undefined) ?? "";
  const deck =
    (decks ?? []).find((d) => d.langue === langue) ?? (decks ?? [])[0] ?? null;
  const texteParPos = new Map<number, string>();
  for (const sl of (deck?.slides ?? []) as Array<{
    position?: number;
    texte_overlay?: string | null;
  }>) {
    const pos = Number(sl.position);
    if (!Number.isFinite(pos)) continue;
    texteParPos.set(pos, String(sl.texte_overlay ?? "").trim());
  }

  const exclus = new Set<string>();
  const parPos = new Map<number, string | null>();
  const logs: ResolutionVisuelLigne[] = [];

  for (const s of structure.slice().sort((a, b) => a.position - b.position)) {
    if (s.media_id) {
      exclus.add(s.media_id);
      parPos.set(s.position, s.media_id);
      logs.push({
        position: s.position,
        media_id: s.media_id,
        pinned: true,
        critere: s.critere ?? null,
        fallback: false,
        motif: s.position === 1 ? "hook / image stockée" : "image stockée (pinned ou import)",
      });
      continue;
    }
    const source = s.position === 1 ? hooks : pool;
    const tirage = tirerMediaParCritere(
      source,
      requeteVisuel(s.critere, texteParPos.get(s.position) ?? ""),
      exclus,
    );
    if (tirage.media) exclus.add(tirage.media.id);
    parPos.set(s.position, tirage.media?.id ?? null);
    logs.push({
      position: s.position,
      media_id: tirage.media?.id ?? null,
      pinned: false,
      critere: s.critere ?? null,
      fallback: tirage.fallback,
      motif: tirage.motif,
    });
    if (tirage.fallback) {
      console.log(
        `[creation-manuelle] contenu=${contenuId} slide=#${s.position} fallback: ${tirage.motif}`,
      );
    }
  }
  return { parPos, logs };
}
