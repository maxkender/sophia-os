/**
 * « Traduction ancrée » : l'autre façon de passer un slideshow dans une langue.
 *
 * La traduction actuelle (`translateSlideshow`) dit « traduis » avec des règles :
 * quelles que soient les règles, le modèle garde des calques de l'anglais, et ça
 * se voit (constat d'Adrien, 23/10, sur le français). Ici, le modèle garde le
 * texte source sous les yeux (on TRADUIT, on ne réécrit pas : mêmes idées, même
 * nombre de phrases, rien d'ajouté ni retiré), mais il a aussi des ANCRES
 * NATIVES, des slideshows écrits par de vrais créateurs de la langue qui ont
 * marché, et la consigne de formuler comme eux. Un contrôle de fidélité relit
 * ensuite chaque slide ; une slide infidèle est retraduite une fois.
 *
 * Première version (23/10, le matin) : un brief en mots-clés puis une écriture
 * libre. Trop libre : elle ajoutait des titres et changeait le propos. Abandonnée.
 *
 * Le placement de Sophia n'est pas touché : il tourne après, sur ce texte,
 * comme sur une traduction. Une slide reste une slide (mêmes positions).
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
import { texteExemple } from "./exemples_natifs.ts";

export interface SlideSource {
  position: number;
  original: string;
}

export interface ControleSlide {
  position: number;
  fidele: boolean;
  remarque: string;
}

export interface Ancre {
  texte: string;
  vues: number | null;
}

export interface EcritureNative {
  slides: Array<{ position: number; texte: string }>;
  hashtags: string;
  ancres: number;
  /** Contrôle de fidélité, slide par slide, sur la version rendue. */
  controle: ControleSlide[];
  /** Slides retraduites après un contrôle négatif. */
  reprises: number[];
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

/** Au-delà, la banque d'exemples coûte plus qu'elle n'apprend. */
export const MAX_EXEMPLES_BANQUE = 30;

/**
 * Ancres natives d'une langue. D'abord la banque d'exemples natifs (0423) :
 * des slideshows de créateurs de la langue, collés par l'admin, tous labels
 * confondus ; elle est lue EN ENTIER (jusqu'à 30). Sans banque (moins de 5
 * exemples prêts), on retombe sur nos propres contenus écrits DANS cette
 * langue (`langue_source` = langue), valides, les mieux vus d'abord. D'abord les
 * IMPORTS, écrits par de vrais créateurs natifs (careerswemma, studyavec_lea…
 * pour le français) ; les originaux des podz, écrits par des agents et porteurs
 * des mêmes tics, ne servent qu'en complément s'il manque d'imports. Texte pris
 * dans `contenu_langues` (base OCR sans Sophia si elle existe).
 */
export async function chargerAncresNatives(
  supabase: ReturnType<typeof serviceClient>,
  langue: string,
  n = 12,
): Promise<Ancre[]> {
  const { data: banque } = await supabase
    .from("exemples_natifs")
    .select("slides, vues")
    .eq("langue", langue)
    .eq("statut", "pret")
    .order("created_at", { ascending: true })
    .limit(MAX_EXEMPLES_BANQUE);
  const exemples = ((banque ?? []) as Array<{ slides: unknown; vues: number | null }>)
    .map((e) => ({ texte: texteExemple(e.slides), vues: e.vues ?? null }))
    .filter((e) => e.texte.split("\n").length >= 3);
  if (exemples.length >= 5) return exemples;

  const { data: contenus } = await supabase
    .from("contenus")
    .select("id, pod, creation_mode")
    .eq("langue_source", langue)
    .eq("statut", "valide")
    .limit(600);
  const liste = (contenus ?? []) as Array<
    { id: string; pod: string | null; creation_mode: string | null }
  >;
  const estOriginal = new Map(
    liste.map((c) => [c.id, c.pod != null || c.creation_mode === "manuel"]),
  );
  const ids = liste.map((c) => c.id);
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
  const natifs: Ancre[] = [];
  const originaux: Ancre[] = [];
  for (
    const l of (langues ?? []) as Array<
      { contenu_id: string; slides: unknown; slides_base: unknown }
    >
  ) {
    const texte = texteAncre(l.slides_base ?? l.slides);
    if (texte.split("\n").length < 3) continue;
    const ancre = { texte, vues: maxVues.get(l.contenu_id) ?? null };
    (estOriginal.get(l.contenu_id) ? originaux : natifs).push(ancre);
  }
  const parVues = (a: Ancre, b: Ancre) => (b.vues ?? 0) - (a.vues ?? 0);
  const choisis = [...exemples, ...natifs.sort(parVues)].slice(0, Math.max(n, exemples.length));
  if (choisis.length >= 5) return choisis;
  return [...choisis, ...originaux.sort(parVues)].slice(0, Math.max(n, exemples.length));
}

/** Traduction fidèle, formulée comme les natifs des ancres. */
export async function traduireAncre(input: {
  slides: ReadonlyArray<SlideSource>;
  langue: string;
  ancres: ReadonlyArray<Ancre>;
  /** Règles de la langue (le prompt `traduction_<langue>`), facultatives. */
  regles?: string;
  /** Remarques du contrôle de fidélité, pour une reprise. */
  reprises?: ReadonlyArray<ControleSlide>;
}): Promise<
  { slides: Array<{ position: number; texte: string }>; hashtags: string }
> {
  const langue = LANGUES[input.langue] ?? input.langue;
  const deck = input.slides
    .map((s) => `Slide ${s.position} : "${s.original || "(aucun texte)"}"`)
    .join("\n");
  const reprises = (input.reprises ?? []).filter((r) => !r.fidele);
  const prompt = `LANGUE DE SORTIE : ${langue.toUpperCase()}.
Tout le texte que tu produis doit être en ${langue}, sans exception.

Tu TRADUIS un slideshow TikTok. Tu ne le réécris pas :
- une slide source = une slide traduite, même position ;
- mêmes idées, même propos, même ordre ; rien d'ajouté (pas de titre, pas de
  reformulation en question), rien de retiré ;
- même nombre de phrases, à une près ; même personne (tu / je / on) que la source ;
- si la traduction directe sonne déjà naturelle, garde-la : la fidélité gagne.

Ta seule liberté, c'est la FORMULATION : les mots, le rythme, les tournures.
Elle doit sonner comme les créateurs natifs ci-dessous, pas comme une phrase
anglaise mise en ${langue}.
${
    input.ancres.length
      ? `
Slideshows écrits par de vrais créateurs natifs de ta langue, dans des niches
variées. Imite leur registre, la longueur de leurs lignes, leur ponctuation,
leur façon de s'adresser au lecteur. Ne recopie aucune phrase.

${formaterAncres(input.ancres, MAX_EXEMPLES_BANQUE)}
`
      : ""
  }
Règles fixes : pas de tiret long (—) ni demi-cadratin (–) ; pas de vocabulaire
marketing ; pas de point d'exclamation en rafale ; genre et tutoiement fixés une
fois pour tout le slideshow ; aucun produit tiers (une slide qui en cite un
devient une action pure ; le seul produit qui existe ici est l'appli Sophia et
ce n'est pas ton rôle de l'ajouter) ; URLs et sources citées gardées telles quelles.
${input.regles ? `\nRègles de la langue :\n${input.regles}\n` : ""}${
    reprises.length
      ? `\nUn relecteur a trouvé ces écarts dans une première version ; corrige-les
en restant fidèle :\n${
        reprises.map((r) => `- slide ${r.position} : ${r.remarque}`).join("\n")
      }\n`
      : ""
  }
Le slideshow source, dans l'ordre (slide 1 = couverture) :
${deck}

Hashtags : EXACTEMENT 3, en ${langue}, un mot chacun, collés au sujet.

Réponds uniquement en JSON, sans bloc de code :
{"slides":[{"position":1,"texte":"..."}],"hashtags":"#a #b #c"}`;
  const brut = textOf(await callWithFallback(TEXT_MODELS, [{ text: prompt }]));
  const sortie = parseJsonModele<
    { slides?: Array<{ position: number; texte: string }>; hashtags?: string }
  >(brut);
  if (!sortie || !Array.isArray(sortie.slides)) {
    throw new Error("traduction illisible");
  }
  return {
    slides: sortie.slides.map((s) => ({
      position: Number(s.position),
      texte: String(s.texte ?? ""),
    })),
    hashtags: normaliserHashtags(String(sortie.hashtags ?? "")),
  };
}

/** Relecture : chaque slide traduite dit-elle la même chose que la source ? */
export async function controlerFidelite(
  slides: ReadonlyArray<SlideSource>,
  traduites: ReadonlyArray<{ position: number; texte: string }>,
): Promise<ControleSlide[]> {
  const parPosition = new Map(traduites.map((t) => [t.position, t.texte]));
  const paires = slides
    .map((s) =>
      `Slide ${s.position}\nSOURCE : "${s.original}"\nTRADUITE : "${
        parPosition.get(s.position) ?? ""
      }"`
    )
    .join("\n\n");
  const prompt =
    `Tu compares, slide par slide, un texte source et sa traduction.
Pour chaque slide, dis si la traduction est FIDÈLE : mêmes idées, même propos,
rien d'ajouté (titre, question, exemple), rien de retiré, même personne (tu / je / on).
Une formulation différente mais qui dit la même chose est fidèle. Une slide
vide des deux côtés est fidèle.

${paires}

Réponds uniquement en JSON, sans bloc de code :
{"slides":[{"position":1,"fidele":true,"remarque":""}]}
La remarque, en français, courte, seulement quand fidele est false : ce qui
manque ou ce qui a été ajouté.`;
  const brut = textOf(await callWithFallback(TEXT_MODELS, [{ text: prompt }]));
  const sortie = parseJsonModele<{ slides?: ControleSlide[] }>(brut);
  return (sortie?.slides ?? []).map((c) => ({
    position: Number(c.position),
    fidele: Boolean(c.fidele),
    remarque: String(c.remarque ?? ""),
  }));
}

export async function ecrireNatif(input: {
  slides: ReadonlyArray<SlideSource>;
  sourceTitle: string;
  langue: string;
  ancres: ReadonlyArray<Ancre>;
  regles?: string;
}): Promise<EcritureNative> {
  let rendu = await traduireAncre({
    slides: input.slides,
    langue: input.langue,
    ancres: input.ancres,
    regles: input.regles,
  });
  let controle = await controlerFidelite(input.slides, rendu.slides);
  const reprises = controle.filter((c) => !c.fidele).map((c) => c.position);
  if (reprises.length) {
    rendu = await traduireAncre({
      slides: input.slides,
      langue: input.langue,
      ancres: input.ancres,
      regles: input.regles,
      reprises: controle,
    });
    controle = await controlerFidelite(input.slides, rendu.slides);
  }
  return {
    slides: rendu.slides,
    hashtags: rendu.hashtags,
    ancres: input.ancres.length,
    controle,
    reprises,
  };
}
