/**
 * « Écriture native » : l'autre façon de passer un slideshow dans une langue.
 *
 * La traduction actuelle (`translateSlideshow`) montre la slide source et dit
 * « traduis » : quelles que soient les règles, le modèle reste collé à la
 * structure de la phrase anglaise, et ça se voit (constat d'Adrien, 23/10, sur
 * le français). Ici, deux passages :
 *   1. un BRIEF télégraphique, en mots-clés anglais, sans phrases : les idées de
 *      chaque slide, son rôle, le concurrent cité s'il y en a un, le ton ;
 *   2. l'ÉCRITURE dans la langue cible à partir du brief et d'ANCRES NATIVES
 *      (des slideshows écrits par des natifs qui ont marché), sans jamais voir
 *      le texte source.
 * Le placement de Sophia n'est pas touché : il tourne après, sur ce texte,
 * comme sur une traduction. Une slide reste une slide (mêmes positions), et la
 * slide qui citait un concurrent reste repérée dans le brief.
 *
 * Servi par `traduire-test` (comparaison des deux modèles) ; pas branché sur le
 * moteur tant que le test n'a pas tranché.
 */

import {
  callWithFallback,
  LANGUES,
  normaliserHashtags,
  TEXT_MODELS,
  textOf,
} from "./gemini.ts";
import type { serviceClient } from "./supabase.ts";

export interface SlideSource {
  position: number;
  original: string;
}

export interface BriefSlide {
  position: number;
  role: string;
  idees: string[];
  concurrent: string | null;
}

export interface Brief {
  ton: string;
  adresse: string;
  slides: BriefSlide[];
}

export interface Ancre {
  texte: string;
  vues: number | null;
}

export interface EcritureNative {
  brief: Brief;
  slides: Array<{ position: number; texte: string }>;
  hashtags: string;
  ancres: number;
}

/** Slides depuis un texte collé : une slide par bloc séparé par une ligne vide (ou `---`). */
export function slidesDepuisTexte(texte: string): SlideSource[] {
  return texte
    .replace(/\r/g, "")
    .split(/\n\s*(?:---+\s*)?\n|\n---+\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((original, i) => ({ position: i + 1, original }));
}

/** JSON du modèle, avec ou sans bloc de code. Null si illisible. */
export function parseJsonModele<T>(raw: string): T | null {
  const nettoye = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(
    /\s*```$/,
    "",
  ).trim();
  try {
    return JSON.parse(nettoye) as T;
  } catch {
    return null;
  }
}

interface SlideStockee {
  position?: number;
  texte_overlay?: string | null;
  position_sophia?: boolean | null;
}

/** Texte d'une ancre : les slides dans l'ordre, sans la slide de placement Sophia. */
export function texteAncre(slides: unknown): string {
  const liste = (Array.isArray(slides) ? slides : []) as SlideStockee[];
  return liste
    .filter((s) => !s.position_sophia && (s.texte_overlay ?? "").trim())
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    .map((s) => (s.texte_overlay ?? "").replace(/[ \t]*\n[ \t]*/g, "\n").trim())
    .join("\n");
}

export function formaterAncres(ancres: ReadonlyArray<Ancre>, max = 12): string {
  return ancres
    .slice(0, max)
    .map((a, i) =>
      `--- Exemple natif ${i + 1}${
        a.vues ? ` (${a.vues.toLocaleString("fr-FR")} vues)` : ""
      } ---\n${a.texte}`
    )
    .join("\n\n");
}

/**
 * Ancres natives d'une langue : les slideshows écrits DANS cette langue
 * (originaux des podz, `langue_source` = langue), valides, les mieux vus
 * d'abord. Texte pris dans `contenu_langues` (base sans Sophia si elle existe).
 */
export async function chargerAncresNatives(
  supabase: ReturnType<typeof serviceClient>,
  langue: string,
  n = 12,
): Promise<Ancre[]> {
  const { data: contenus } = await supabase
    .from("contenus")
    .select("id")
    .eq("langue_source", langue)
    .eq("statut", "valide")
    .or("pod.not.is.null,creation_mode.eq.manuel")
    .limit(300);
  const ids = (contenus ?? []).map((c: { id: string }) => c.id);
  if (!ids.length) return [];

  const [{ data: langues }, { data: passages }] = await Promise.all([
    supabase.from("contenu_langues").select("contenu_id, slides, slides_base")
      .eq("langue", langue).in("contenu_id", ids),
    supabase.from("passages").select("contenu_id, vues").eq("statut", "publie")
      .not("vues", "is", null).in("contenu_id", ids),
  ]);
  const maxVues = new Map<string, number>();
  for (
    const p of (passages ?? []) as Array<{ contenu_id: string; vues: number }>
  ) {
    maxVues.set(
      p.contenu_id,
      Math.max(maxVues.get(p.contenu_id) ?? 0, p.vues ?? 0),
    );
  }
  const ancres: Ancre[] = [];
  for (
    const l of (langues ?? []) as Array<
      { contenu_id: string; slides: unknown; slides_base: unknown }
    >
  ) {
    const texte = texteAncre(l.slides_base ?? l.slides);
    if (texte.split("\n").length < 3) continue;
    ancres.push({ texte, vues: maxVues.get(l.contenu_id) ?? null });
  }
  return ancres.sort((a, b) => (b.vues ?? 0) - (a.vues ?? 0)).slice(0, n);
}

/** Passage 1 : le brief, en mots-clés anglais, sans phrases. */
export async function resumerSlideshow(
  slides: ReadonlyArray<SlideSource>,
  sourceTitle: string,
): Promise<Brief> {
  const deck = slides.map((s) =>
    `Slide ${s.position}: "${s.original || "(no text)"}"`
  ).join("\n");
  const prompt =
    `You read a TikTok slideshow (advice / listicle). Write a BRIEF, in telegraphic English
keywords, never sentences: for each slide, 2 to 5 ideas of 3 to 8 words, the role
("hook", "tip", "conclusion", "other"), and the name of any competing app, product or
tool it recommends (null otherwise). Add the overall tone (e.g. "blunt, big sister, dry
humour") and the address ("second person" or "impersonal").
Do NOT translate and do NOT rephrase into sentences: nobody should be able to rebuild
the original wording from the brief. Keep every slide, same positions.

Caption of the source video: ${sourceTitle || "(none)"}

${deck}

Answer with JSON only, no code block:
{"ton":"...","adresse":"...","slides":[{"position":1,"role":"hook","idees":["..."],"concurrent":null}]}`;
  const brut = textOf(await callWithFallback(TEXT_MODELS, [{ text: prompt }]));
  const brief = parseJsonModele<Brief>(brut);
  if (!brief || !Array.isArray(brief.slides)) {
    throw new Error("brief illisible");
  }
  return {
    ton: String(brief.ton ?? ""),
    adresse: String(brief.adresse ?? ""),
    slides: brief.slides.map((s) => ({
      position: Number(s.position),
      role: String(s.role ?? "other"),
      idees: Array.isArray(s.idees) ? s.idees.map(String) : [],
      concurrent: s.concurrent ? String(s.concurrent) : null,
    })),
  };
}

/** Passage 2 : l'écriture dans la langue, depuis le brief et les ancres, sans le texte source. */
export async function ecrireDepuisBrief(input: {
  brief: Brief;
  langue: string;
  ancres: ReadonlyArray<Ancre>;
  /** Règles de la langue (le prompt `traduction_<langue>`), facultatives. */
  regles?: string;
}): Promise<
  { slides: Array<{ position: number; texte: string }>; hashtags: string }
> {
  const langue = LANGUES[input.langue] ?? input.langue;
  const briefTxt = input.brief.slides
    .map((s) =>
      `Slide ${s.position} (${s.role}) : ${s.idees.join(" · ")}${
        s.concurrent ? ` [cite un concurrent : ${s.concurrent}]` : ""
      }`
    )
    .join("\n");
  const prompt = `LANGUE DE SORTIE : ${langue.toUpperCase()}.
Tout le texte que tu produis doit être en ${langue}, sans exception.

Tu es un·e créateur·rice TikTok natif·ve de cette langue. Tu n'as pas le texte
d'origine, seulement un brief en mots-clés : tu ÉCRIS le slideshow, tu ne
traduis rien.

${
    input.ancres.length
      ? `Voici des slideshows écrits par des créateurs natifs de ta langue, dans la même
niche, qui ont marché. Imite leur registre, la longueur de leurs lignes, leur
ponctuation, leur façon de s'adresser au lecteur, leurs emojis quand ils en
mettent. Ne recopie aucune de leurs phrases.

${formaterAncres(input.ancres)}

`
      : ""
  }Le brief (idées en mots-clés, pas des phrases) :
Ton : ${input.brief.ton || "(non précisé)"}. Adresse : ${
    input.brief.adresse || "(non précisée)"
  }.
${briefTxt}

Écris le slideshow en ${langue} :
- une slide par position, même nombre, même ordre ; la slide 1 est l'accroche ;
- chaque slide se lit en 2 à 3 secondes, au pouce ;
- les idées du brief sont toutes là, dites comme tu les dirais à un·e ami·e ;
- aucun produit tiers : une slide qui cite un concurrent devient une action pure
  (le seul produit qui existe ici est l'appli Sophia, et ce n'est pas ton rôle
  de l'ajouter) ;
- pas de tiret long (—) ni demi-cadratin (–) ; pas de vocabulaire marketing ;
  pas de point d'exclamation en rafale ; genre et tutoiement fixés une fois.
${input.regles ? `\nRègles de la langue :\n${input.regles}\n` : ""}
Hashtags : EXACTEMENT 3, en ${langue}, un mot chacun, collés au sujet.

Réponds uniquement en JSON, sans bloc de code :
{"slides":[{"position":1,"texte":"..."}],"hashtags":"#a #b #c"}`;
  const brut = textOf(await callWithFallback(TEXT_MODELS, [{ text: prompt }]));
  const sortie = parseJsonModele<
    { slides?: Array<{ position: number; texte: string }>; hashtags?: string }
  >(brut);
  if (!sortie || !Array.isArray(sortie.slides)) {
    throw new Error("écriture illisible");
  }
  return {
    slides: sortie.slides.map((s) => ({
      position: Number(s.position),
      texte: String(s.texte ?? ""),
    })),
    hashtags: normaliserHashtags(String(sortie.hashtags ?? "")),
  };
}

export async function ecrireNatif(input: {
  slides: ReadonlyArray<SlideSource>;
  sourceTitle: string;
  langue: string;
  ancres: ReadonlyArray<Ancre>;
  regles?: string;
}): Promise<EcritureNative> {
  const brief = await resumerSlideshow(input.slides, input.sourceTitle);
  const ecrit = await ecrireDepuisBrief({
    brief,
    langue: input.langue,
    ancres: input.ancres,
    regles: input.regles,
  });
  return {
    brief,
    slides: ecrit.slides,
    hashtags: ecrit.hashtags,
    ancres: input.ancres.length,
  };
}
