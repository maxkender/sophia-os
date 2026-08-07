import { downloadImage } from "./apify.ts";
import { messageErreur } from "./supabase.ts";
import { dimensionsImage, effacerTexte, type Zone } from "./inpaint.ts";
import { nettoyerViaFalTextRemoval } from "./fal_text_removal.ts";
import { nettoyerViaReplicateTextRemoval } from "./replicate_text_removal.ts";
import { upscaleViaSeedVr } from "./fal_seedvr_upscale.ts";
import { falHebergerOctets } from "./fal_queue.ts";
import { serviceClient } from "./supabase.ts";
import { retirerContentCredentials } from "./c2pa.ts";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Modèles texte, par ordre de repli.
 *
 * gemini-2.5-pro et gemini-2.5-flash sont volontairement absents : ils
 * apparaissent dans la liste des modèles mais renvoient 404 « no longer
 * available to new users ». Google en retire régulièrement : la chaîne compte
 * donc plusieurs familles, et un 503 passager sur l'une bascule sur la suivante.
 */
export const TEXT_MODELS = [
  "gemini-3.5-flash",
  "gemini-2.0-flash",
  "gemini-3.1-flash-lite",
];

/**
 * Le refus de retouche est inconstant : le même modèle accepte une image et en
 * refuse une autre. On enchaîne donc plusieurs modèles avant d'abandonner.
 */
export const IMAGE_MODELS = [
  "gemini-3.1-flash-image",
  "gemini-2.5-flash-image",
  "gemini-3-pro-image",
];

/**
 * L'API accepte `inline_data` en entrée mais répond en `inlineData` : les deux
 * formes doivent coexister, sinon on cherche une clé qui n'existe jamais dans
 * la réponse.
 */
interface Part {
  text?: string;
  inline_data?: { mime_type: string; data: string };
  inlineData?: { mimeType: string; data: string };
}

function imageDataOf(parts: Part[]): string | null {
  for (const part of parts) {
    const data = part.inlineData?.data ?? part.inline_data?.data;
    if (data) return data;
  }
  return null;
}

function apiKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY manquant");
  return key;
}

interface GenConfig {
  temperature?: number;
  // Les modèles d'image ne renvoient une image QUE si on la réclame
  // explicitement ; sans ça ils décrivent la retouche en texte, ce que le
  // reste du code prenait à tort pour un refus.
  responseModalities?: string[];
}

async function call(model: string, parts: Part[], config?: GenConfig): Promise<Part[]> {
  const response = await fetch(`${BASE}/${model}:generateContent?key=${apiKey()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      ...(config ? { generationConfig: config } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini ${model} ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const data = await response.json();
  return (data?.candidates?.[0]?.content?.parts ?? []) as Part[];
}

function textOf(parts: Part[]): string {
  return parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

/**
 * Essaie chaque modèle à tour de rôle. Toutes les erreurs sont agrégées : ne
 * remonter que la dernière masquait la cause réelle derrière l'échec du modèle
 * de repli, ce qui a déjà coûté un cycle de diagnostic.
 */
/** Un échec passager de Gemini (surcharge, quota, indispo) : ça vaut un réessai. */
function estTransitoireGemini(message: string): boolean {
  return /overload|unavailable|rate.?limit|resource.?exhaust|deadline|timeout|try again|429|500|502|503|504/i.test(
    message,
  );
}

async function callWithFallback(models: string[], parts: Part[]): Promise<Part[]> {
  // On essaie chaque modèle ; si TOUS échouent pour une raison PASSAGÈRE
  // (surcharge Gemini), on réessaie après une attente croissante + jitter, au
  // lieu de remonter une erreur 500 tout de suite. C'est ce qui manquait aux
  // appels Gemini directs (persona, pertinence, traduction, Sophia…) : ils
  // plantaient au moindre pic, contrairement au proxy qui, lui, réessaie déjà.
  const ESSAIS = 4;
  let failures: string[] = [];

  for (let essai = 0; essai < ESSAIS; essai += 1) {
    if (essai > 0) {
      await new Promise((r) => setTimeout(r, 1500 * essai + Math.floor(Math.random() * 1200)));
    }

    failures = [];
    for (const model of models) {
      try {
        return await call(model, parts);
      } catch (error) {
        failures.push(`${model}: ${messageErreur(error)}`);
      }
    }

    // Tous les modèles ont échoué. Si ce n'est pas une surcharge passagère
    // (ex. requête invalide, refus), inutile de réessayer.
    if (!failures.some(estTransitoireGemini)) break;
  }

  throw new Error(failures.join(" | "));
}

export async function fetchImageAsInline(url: string): Promise<Part> {
  // Passe par le helper Apify : les visuels issus du key-value store exigent
  // le token, ceux déjà rapatriés dans notre Storage sont servis tels quels.
  const buffer = await downloadImage(url);

  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buffer.length; i += CHUNK) {
    binary += String.fromCharCode(...buffer.subarray(i, i + CHUNK));
  }

  return {
    inline_data: {
      mime_type: url.toLowerCase().includes(".png") ? "image/png" : "image/jpeg",
      data: btoa(binary),
    },
  };
}

/**
 * OCR + traduction en une passe : demander les deux séparément ferait perdre
 * le contexte visuel qui lève la plupart des ambiguïtés de traduction.
 */
/** Règles de traduction par défaut, surchargeables depuis l'admin (clé
 *  `translate`). Le format de sortie JSON, lui, reste fixé dans le code pour
 *  qu'une édition ne casse jamais le parsing. */
/**
 * Règles de repli, volontairement indépendantes de toute langue : elles servent
 * quand aucun prompt dédié n'existe pour la langue du compte. Pour une vraie
 * finesse, l'admin écrit un prompt `traduction_<langue>`.
 */
export const DEFAULT_TRANSLATE_PROMPT = `Règles de traduction impératives :
- Adresse-toi au lecteur de façon directe et familière, jamais avec la forme de
  politesse formelle de la langue cible.
- Écris comme un humain parle, pas comme un site de marketing.
- Phrases courtes. On lit au pouce, en une seconde.
- INTERDIT : le tiret long (—) et le tiret demi-cadratin (–). Utilise une
  virgule, un point ou deux-points. Ces tirets trahissent un texte d'IA.
- INTERDIT : le vocabulaire creux de la publicité (équivalents locaux de
  "libère ton potentiel", "révolutionne", "incontournable", "booste",
  "transforme ta vie").
- Pas de point d'exclamation en rafale, pas d'emoji ajouté.
- Voix cohérente d'une slide à l'autre, genre fixé une fois pour toutes.
- Aucune mention d'un produit tiers : ni application, ni site, ni logiciel, ni
  "outil d'IA", ni marque. Réécris le conseil comme une action pure. Le seul
  produit qui a le droit d'exister dans ce slideshow est l'appli Sophia, et ce
  n'est pas ton rôle de l'ajouter ici.
- Conserve les URLs et les sources citées telles quelles.`;

/**
 * OCR seul, slide par slide : transcrit le texte incrusté en langue d'origine.
 * La traduction se fait ensuite sur tout le deck d'un coup (translateSlideshow),
 * seule façon de tenir une persona et un genre cohérents d'une slide à l'autre.
 */
export async function ocrFrame(imageUrl: string): Promise<string> {
  const image = await fetchImageAsInline(imageUrl);

  const prompt = `Transcris exactement le texte incrusté sur cette slide TikTok,
en langue d'origine, sans le corriger ni le traduire.

Ignore : logos, marques dans le décor, texte sur les vêtements, barre de statut
du téléphone. Garde le nom d'une app/d'un podcast si c'est le sujet de la slide.

Si la slide ne contient aucun texte incrusté, réponds exactement : (aucun texte)`;

  const parts = await callWithFallback(TEXT_MODELS, [{ text: prompt }, image]);
  const text = textOf(parts).trim();
  return text === "(aucun texte)" ? "" : text;
}

/**
 * Traduit tout le slideshow en une passe. Le modèle voit toutes les slides à la
 * fois, ce que le prompt de traduction exige pour fixer le genre et la persona
 * une bonne fois. Renvoie une traduction par position.
 */
const LANGUES: Record<string, string> = {
  fr: "français",
  en: "anglais",
  es: "espagnol",
  it: "italien",
  de: "allemand",
  pt: "portugais",
  cs: "tchèque",
  nl: "néerlandais",
  el: "grec",
  hu: "hongrois",
  pl: "polonais",
  ro: "roumain",
  sv: "suédois",
  tr: "turc",
};

export async function translateSlideshow(input: {
  slides: Array<{ position: number; original: string }>;
  sourceTitle: string;
  rules?: string;
  /** Langue cible du compte de publication. */
  langue?: string;
  /** Demande une formulation différente : c'est ce qui distingue un post
   *  remanié d'une simple copie de son aîné. */
  variation?: boolean;
}): Promise<Array<{ position: number; translated: string }>> {
  const deck = input.slides
    .map((s) => `Slide ${s.position} : "${s.original || "(aucun texte)"}"`)
    .join("\n");

  const code = input.langue ?? "fr";
  const langue = LANGUES[code] ?? code;

  // La langue cible ouvre ET ferme le prompt : placée seulement à la fin, elle
  // se faisait écraser par les règles de style, souvent longues et rédigées
  // pour une langue donnée.
  const prompt = `LANGUE DE SORTIE : ${langue.toUpperCase()}.
Tout le texte que tu produis doit être en ${langue}, sans exception, quelle que
soit la langue dans laquelle les consignes ci-dessous sont rédigées.

${input.rules ?? DEFAULT_TRANSLATE_PROMPT}

Titre de la vidéo source : ${input.sourceTitle || "(aucun)"}

Voici toutes les slides du slideshow, dans l'ordre (slide 1 = couverture) :
${deck}

Traduis chaque slide en ${langue}. Une slide sans texte reste vide.${
    input.variation
      ? `

Ce slideshow a déjà été publié sous une autre formulation. Reformule-le
entièrement : mêmes idées et même ordre, mais tournures, rythme et exemples
différents. Un lecteur qui aurait vu les deux ne doit pas avoir l'impression de
relire le même texte.`
      : ""
  }

Rappel : la sortie est en ${langue}.

Réponds uniquement en JSON, sans bloc de code, un objet par slide :
{"slides":[{"position":1,"translated":"..."}, ...]}`;

  const parts = await callWithFallback(TEXT_MODELS, [{ text: prompt }]);
  const raw = textOf(parts).replace(/^```(?:json)?|```$/g, "").trim();

  try {
    const parsed = JSON.parse(raw);
    return (parsed.slides ?? []).map((s: { position: number; translated: string }) => ({
      position: Number(s.position),
      translated: String(s.translated ?? ""),
    }));
  } catch {
    return [];
  }
}

/**
 * Note la pertinence d'un slideshow pour une pub Sophia (app de culture
 * générale). Évite de payer nettoyage et traduction sur un contenu inutilisable.
 */
export const DEFAULT_RELEVANCE_PROMPT = `Sophia est une application de culture
générale : elle aide à apprendre, à enrichir ses connaissances et à devenir
plus cultivé.

Note de 0 à 100 la pertinence de ce slideshow pour y glisser naturellement un
conseil menant à Sophia.

Notes hautes : savoir, culture, apprentissage, éloquence, conversation,
curiosité, lecture, mémoire, esprit critique ("devenir exceptionnellement
cultivé", "être intéressant en soirée", "paraître plus intelligent").

Notes basses : fitness, beauté, séduction, argent, productivité pure, ou tout
sujet où parler d'une app de culture générale sonnerait plaqué.`;

export async function scoreRelevance(input: {
  caption: string;
  hookText: string;
  instructions?: string;
}): Promise<{ score: number; reason: string }> {
  const prompt = `${input.instructions ?? DEFAULT_RELEVANCE_PROMPT}

Slideshow candidat :
Accroche : ${input.hookText || "(inconnue)"}
Légende : ${input.caption || "(aucune)"}

Réponds uniquement en JSON, sans bloc de code :
{"score": 0-100, "reason": "une phrase"}`;

  const parts = await callWithFallback(TEXT_MODELS, [{ text: prompt }]);
  const raw = textOf(parts).replace(/^```(?:json)?|```$/g, "").trim();

  try {
    const parsed = JSON.parse(raw);
    return {
      score: Number(parsed.score) || 0,
      reason: String(parsed.reason ?? ""),
    };
  } catch {
    return { score: 0, reason: raw.slice(0, 200) };
  }
}

/**
 * Intègre Sophia dans le slideshow en REMPLAÇANT l'un des conseils existants,
 * pas en ajoutant une slide. Le modèle choisit lui-même le conseil le plus
 * substituable et le réécrit au même format, même longueur, même ton — la
 * couture ne doit pas se voir.
 */
export interface SophiaPlacement {
  chosenPosition: number;
  mode: string;
  variants: string[];
  /** Index (0-2) de la variante que le modèle juge la meilleure selon le prompt. */
  bestIndex: number;
}

/**
 * Placement de Sophia selon le prompt maître de l'admin : détecte le mode
 * grammatical du deck (instructif / confession), choisit la slide à remplacer,
 * et produit 3 variantes dans ce mode. Le pipeline en retient une, les deux
 * autres restent disponibles pour l'admin.
 */
export async function integrateSophia(input: {
  masterPrompt: string;
  corrections: Array<{ original_text: string | null; corrected_text: string }>;
  slides: Array<{ position: number; text: string }>;
  caption: string;
  /** Langue du compte : la slide Sophia doit parler comme ses voisines. */
  langue?: string;
}): Promise<SophiaPlacement | null> {
  // Sophia DOIT tomber dans les 2-3 dernières slides (jamais au début) : on borne
  // les positions permises aux 3 dernières (hors couverture = slide 1).
  const positions = input.slides.map((s) => s.position).sort((a, b) => a - b);
  const autorisees = positions.filter((p) => p >= 2).slice(-3);
  const autoriseesTxt = autorisees.join(", ");
  const examples = input.corrections
    .slice(0, 40)
    .map((c) =>
      c.original_text
        ? `- Au lieu de : "${c.original_text}"\n  Écris plutôt : "${c.corrected_text}"`
        : `- Bon exemple : "${c.corrected_text}"`,
    )
    .join("\n");

  const slideList = input.slides
    .map((s) => `Slide ${s.position} : "${s.text || "(vide)"}"`)
    .join("\n");

  const code = input.langue ?? "fr";
  const langue = LANGUES[code] ?? code;

  // Le prompt maître (édité par l'admin) porte toute la doctrine ; le code n'y
  // ajoute que les données du deck et un format de sortie JSON stable.
  //
  // La langue ouvre le prompt : une slide Sophia rédigée dans une autre langue
  // que ses voisines se repère immédiatement et ruine l'intégration.
  const prompt = `LANGUE DE SORTIE : ${langue.toUpperCase()}.
Les variantes que tu écris doivent être en ${langue}, quelle que soit la langue
des consignes ci-dessous.

${input.masterPrompt}

--- DONNÉES ---
Légende de la vidéo : ${input.caption || "(aucune)"}
Slides du slideshow (slide 1 = couverture) :
${slideList}
${examples ? `\nCorrections passées à respecter :\n${examples}\n` : ""}
--- SORTIE ---
Ne remplace jamais la slide 1 (couverture). Sophia doit toujours tomber dans les
2-3 DERNIÈRES slides, jamais avant : choisis UNE slide parmi ces positions
UNIQUEMENT : ${autoriseesTxt}. Écris 3 variantes qui remplacent son texte.
Chaque variante DOIT :
- MENTION DE SOPHIA selon le TON des slides : si elles TUTOIENT (2e personne du
  singulier, « tu / ton / tes / tes... »), la mention doit être INDIRECTE — n'écris
  JAMAIS « utilise l'appli Sophia » ni « télécharge Sophia » ; écris plutôt une
  formule du type « utilise une appli de micro-apprentissage comme Sophia ». Si les
  slides sont à la 1re personne (« je / j'ai / mon »), une mention directe de Sophia
  est parfaitement acceptable (« j'utilise l'appli Sophia… »).
- reprendre EXACTEMENT le préfixe de la slide remplacée : si son texte commence
  par un numéro ("5.", "3)"), une puce ou un emoji, la variante commence par le
  MÊME. Ne change jamais le numéro, ne saute pas de numéro.
- faire une longueur comparable à ce texte (à ±20 % du nombre de caractères) :
  ni beaucoup plus courte, ni plus longue — elle occupe la même place à l'écran.
- COPIER la mise en forme des slides voisines : la MÊME casse (si elles sont
  tout en minuscules, reste tout en minuscules ; pas de majuscule d'emphase ni
  de Title Case qu'elles n'ont pas), la même ponctuation, les mêmes emojis ou
  retours à la ligne éventuels. La slide Sophia doit être indistinguable des
  autres au premier coup d'œil.
- rester dans le même mode grammatical et le même ton que les slides voisines,
  pour s'enchaîner sans rupture.

Puis applique l'autocontrôle et désigne la MEILLEURE des trois (mode, longueur,
préfixe conservé, zéro tiret, zéro jargon). Indique son index (0, 1 ou 2) dans "best".

Rappel : les trois variantes sont en ${langue}.

Réponds UNIQUEMENT en JSON, sans bloc de code ni commentaire :
{"chosen_position": <numéro de slide>, "mode": "instructif|confession", "variants": ["A","B","C"], "best": 0}`;

  // Quatre tentatives avec attente croissante : une réponse mal formée (JSON
  // cassé, position invalide) OU un appel Gemini en échec passager (surcharge)
  // laissait le post SANS placement Sophia, ce qui n'a aucun sens sur un post
  // promotionnel. On enveloppe TOUT l'essai (appel compris) dans le try, et on
  // espace les reprises, pour absorber les pics de surcharge avant d'abandonner.
  for (let essai = 0; essai < 4; essai += 1) {
    if (essai > 0) await new Promise((r) => setTimeout(r, 1500 * essai + Math.random() * 1000));

    try {
      const parts = await callWithFallback(TEXT_MODELS, [{ text: prompt }]);
      const raw = textOf(parts).replace(/^```(?:json)?|```$/g, "").trim();

      const parsed = JSON.parse(raw);
      const chosenPosition = Number(parsed.chosen_position);
      const variants = (parsed.variants ?? [])
        .map((v: unknown) => String(v ?? "").trim())
        .filter(Boolean);

      // La position choisie DOIT être dans les 2-3 dernières slides. Si le modèle
      // sort une position hors zone, on la ramène sur la dernière slide autorisée
      // plutôt que d'échouer (les variantes restent valables pour une slide de fin).
      const positionFinale = autorisees.includes(chosenPosition)
        ? chosenPosition
        : autorisees[autorisees.length - 1];
      if (!positionFinale || variants.length === 0) continue;

      const best = Number(parsed.best);
      const bestIndex = Number.isInteger(best) && best >= 0 && best < variants.length ? best : 0;

      return { chosenPosition: positionFinale, mode: String(parsed.mode ?? ""), variants, bestIndex };
    } catch {
      // appel en échec ou réponse illisible : on retente après l'attente
    }
  }

  return null;
}

/**
 * Nettoyage d'image : retire captions, stickers et watermarks.
 *
 * Le modèle refuse parfois la retouche ; le refus n'est pas déterministe. On
 * repasse donc sur chaque modèle disponible avant de renoncer. Renvoie null si
 * aucun n'a rendu d'image — l'appelant conserve alors l'original plutôt que de
 * casser le slideshow.
 */
/**
 * Une image DÉGÉNÉRÉE (quasi entièrement noire/unie).
 *
 * `verifyClean` ne l'attrape PAS (noir = « pas de texte » → jugée propre).
 * Signaux :
 *  1. Compressibilité extrême (< ~40 Ko/MP) → cadre uni.
 *  2. Luminance moyenne très basse (décodage JPEG/PNG) → noir Fal safety.
 *  3. Zone grise 40–90 Ko/MP + image sombre → suspect (souvent noir compressé
 *     qui passait l'ancien seuil à 50).
 */
async function sembleDegeneree(base64: string): Promise<boolean> {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const dims = dimensionsImage(bytes);
    if (!dims || dims.w === 0 || dims.h === 0) return false;
    const megapixels = (dims.w * dims.h) / 1_000_000;
    const koParMp = bytes.length / 1024 / Math.max(megapixels, 0.01);
    if (koParMp < 40) return true;

    const mean = await luminanceMoyenne(bytes);
    if (mean !== null && mean < 18) return true;
    if (koParMp < 90 && mean !== null && mean < 35) return true;
    return false;
  } catch {
    return false;
  }
}

/** Luminance moyenne 0–255, ou null si décodage impossible. */
async function luminanceMoyenne(bytes: Uint8Array): Promise<number | null> {
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    try {
      const { decode } = await import("npm:jpeg-js@0.4.4");
      const { data, width, height } = decode(bytes, { maxMemoryUsageInMB: 64 });
      if (!width || !height || !data?.length) return null;
      const step = Math.max(1, Math.floor((width * height) / 4000));
      let sum = 0;
      let n = 0;
      for (let p = 0; p < width * height; p += step) {
        const i = p * 4;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;
        sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        n += 1;
      }
      return n ? sum / n : null;
    } catch {
      return null;
    }
  }

  // PNG 8-bit RGB/RGBA : inflate IDAT puis échantillonner
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    try {
      const bitDepth = bytes[24]!;
      const colorType = bytes[25]!;
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return null;
      const bpp = colorType === 6 ? 4 : 3;
      const dv = new DataView(bytes.buffer, bytes.byteOffset);
      const w = dv.getUint32(16);
      const h = dv.getUint32(20);

      const idats: Uint8Array[] = [];
      let i = 8;
      while (i + 8 <= bytes.length) {
        const len = dv.getUint32(i);
        const type = String.fromCharCode(
          bytes[i + 4]!,
          bytes[i + 5]!,
          bytes[i + 6]!,
          bytes[i + 7]!,
        );
        const start = i + 8;
        const end = start + len;
        if (end + 4 > bytes.length) break;
        if (type === "IDAT") idats.push(bytes.subarray(start, end));
        if (type === "IEND") break;
        i = end + 4;
      }
      if (idats.length === 0) return null;
      const fused = new Uint8Array(idats.reduce((n, c) => n + c.length, 0));
      let off = 0;
      for (const c of idats) {
        fused.set(c, off);
        off += c.length;
      }
      const raw = new Uint8Array(
        await new Response(
          new Blob([fused]).stream().pipeThrough(new DecompressionStream("deflate")),
        ).arrayBuffer(),
      );
      const stride = 1 + w * bpp;
      if (raw.length < stride * h) return null;
      const stepY = Math.max(1, Math.floor(h / 64));
      const stepX = Math.max(1, Math.floor(w / 64));
      let sum = 0;
      let n = 0;
      for (let y = 0; y < h; y += stepY) {
        const row = y * stride + 1; // skip filter byte
        for (let x = 0; x < w; x += stepX) {
          const p = row + x * bpp;
          const r = raw[p] ?? 0;
          const g = raw[p + 1] ?? 0;
          const b = raw[p + 2] ?? 0;
          sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
          n += 1;
        }
      }
      return n ? sum / n : null;
    } catch {
      return null;
    }
  }

  return null;
}

/** Moteur effectivement utilisé pour un nettoyage réussi. */
export type MoteurNettoyage = "text_removal" | "replicate_text_removal";

export type ProviderNettoyage = "fal" | "replicate";

/** Identifiants d'étapes exposés au front (timeline de chargement). */
export type EtapeNettoyageId =
  | "text_removal"
  | "replicate_text_removal"
  | "upscale"
  | "c2pa"
  | "ready";

export interface EvenementEtape {
  etape: EtapeNettoyageId;
  statut: "encours" | "ok" | "echec" | "saute";
  detail?: string;
}

export interface ImageNettoyee {
  base64: string;
  moteur: MoteurNettoyage;
  mime: string;
  etapes: EvenementEtape[];
  /** SeedVR passé avec succès (import slideshow). */
  upscale?: boolean;
}

export type OnEtapeNettoyage = (e: EvenementEtape) => void | Promise<void>;

export interface CleanImageOpts {
  /**
   * Import slideshow TikTok : SeedVR (Fal) après text-removal,
   * avant strip C2PA. Défaut false (renettoyer / biblio inchangés).
   */
  upscaleAvantStrip?: boolean;
  /** Facteur SeedVR (défaut ×2). */
  upscaleFactor?: number;
}

async function lireProviderPrincipal(): Promise<ProviderNettoyage> {
  try {
    const sb = serviceClient();
    const { data } = await sb
      .from("reglages")
      .select("valeur")
      .eq("cle", "nettoyage")
      .maybeSingle();
    const v = (data?.valeur ?? {}) as { provider_principal?: string };
    return v.provider_principal === "replicate" ? "replicate" : "fal";
  } catch {
    return "fal";
  }
}

/**
 * Nettoyage : Fal + Replicate (ordre configurable via réglage `nettoyage`),
 * optionnellement SeedVR (import), puis retrait Content Credentials (C2PA).
 *
 * `onEtape` permet au front de tracer le déroulé en direct (stream NDJSON).
 */
export async function cleanImage(
  imageUrl: string,
  onEtape?: OnEtapeNettoyage,
  opts?: CleanImageOpts,
): Promise<ImageNettoyee | null> {
  const etapes: EvenementEtape[] = [];
  const emit = async (e: EvenementEtape) => {
    etapes.push(e);
    await onEtape?.(e);
  };

  const premier = await lireProviderPrincipal();
  const second: ProviderNettoyage = premier === "fal" ? "replicate" : "fal";
  const chaine: ProviderNettoyage[] = [premier, second];

  let base64: string | null = null;
  let moteur: MoteurNettoyage | null = null;
  let upscaleOk = false;

  for (let i = 0; i < chaine.length; i += 1) {
    const provider = chaine[i]!;
    const rang = i + 1;
    const estPremier = i === 0;
    const autre = provider === "fal" ? "Replicate" : "Fal";
    const etapeId: EtapeNettoyageId =
      provider === "fal" ? "text_removal" : "replicate_text_removal";
    const nom = provider === "fal" ? "Fal" : "Replicate";

    if (base64) {
      await emit({
        etape: etapeId,
        statut: "saute",
        detail: `${rang === 1 ? "①" : "②"} ${nom} non appelé (précédent OK)`,
      });
      continue;
    }

    await emit({
      etape: etapeId,
      statut: "encours",
      detail: estPremier
        ? `${rang === 1 ? "①" : "②"} ${nom} (principal) — si échec → FALLBACK ${autre}`
        : `${rang === 1 ? "①" : "②"} FALLBACK ${nom}`,
    });

    let polls = 0;
    try {
      const resultat =
        provider === "fal"
          ? await nettoyerViaFalTextRemoval(imageUrl, async (p) => {
              if (typeof p.polls === "number") polls = p.polls;
              if (p.phase === "submit") {
                await emit({
                  etape: etapeId,
                  statut: "encours",
                  detail: `${rang === 1 ? "①" : "②"} ${nom}: submit (${p.detail ?? "ok"})`,
                });
              } else if (p.phase === "poll") {
                await emit({
                  etape: etapeId,
                  statut: "encours",
                  detail: `${rang === 1 ? "①" : "②"} ${nom}: poll #${p.polls} statut=${p.statut ?? "?"}`,
                });
              } else if (p.phase === "result") {
                await emit({
                  etape: etapeId,
                  statut: "encours",
                  detail: `${rang === 1 ? "①" : "②"} ${nom}: terminé après ${polls} polls — fetch`,
                });
              } else if (p.phase === "download") {
                await emit({
                  etape: etapeId,
                  statut: "encours",
                  detail: `${rang === 1 ? "①" : "②"} ${nom}: téléchargement résultat`,
                });
              }
            })
          : await nettoyerViaReplicateTextRemoval(imageUrl, async (p) => {
              if (typeof p.polls === "number") polls = p.polls;
              if (p.phase === "submit") {
                await emit({
                  etape: etapeId,
                  statut: "encours",
                  detail: `${rang === 1 ? "①" : "②"} ${nom}: submit (${p.detail ?? "ok"})`,
                });
              } else if (p.phase === "poll") {
                await emit({
                  etape: etapeId,
                  statut: "encours",
                  detail: `${rang === 1 ? "①" : "②"} ${nom}: poll #${p.polls} statut=${p.statut ?? "?"}`,
                });
              } else if (p.phase === "result") {
                await emit({
                  etape: etapeId,
                  statut: "encours",
                  detail: `${rang === 1 ? "①" : "②"} ${nom}: succeeded après ${polls} polls — fetch`,
                });
              } else if (p.phase === "download") {
                await emit({
                  etape: etapeId,
                  statut: "encours",
                  detail: `${rang === 1 ? "①" : "②"} ${nom}: téléchargement résultat`,
                });
              }
            });

      if (resultat && !(await sembleDegeneree(resultat))) {
        base64 = resultat;
        moteur = etapeId === "text_removal" ? "text_removal" : "replicate_text_removal";
        await emit({
          etape: etapeId,
          statut: "ok",
          detail: `${rang === 1 ? "①" : "②"} ${nom} OK (${polls} polls)`,
        });
      } else if (resultat) {
        await emit({
          etape: etapeId,
          statut: "echec",
          detail: estPremier
            ? `${rang === 1 ? "①" : "②"} ${nom}: sortie noire/dégénérée → FALLBACK ${autre}`
            : `${rang === 1 ? "①" : "②"} ${nom}: sortie noire/dégénérée`,
        });
      } else {
        await emit({
          etape: etapeId,
          statut: "saute",
          detail: estPremier
            ? `${rang === 1 ? "①" : "②"} ${nom} SAUTÉ — clé absente → FALLBACK ${autre}`
            : `${rang === 1 ? "①" : "②"} ${nom} SAUTÉ — clé absente`,
        });
      }
    } catch (error) {
      await emit({
        etape: etapeId,
        statut: "echec",
        detail: estPremier
          ? `${rang === 1 ? "①" : "②"} ${nom} ÉCHEC: ${redactSecrets(messageErreur(error))} → FALLBACK ${autre}`
          : `${rang === 1 ? "①" : "②"} ${nom} ÉCHEC: ${redactSecrets(messageErreur(error))}`,
      });
    }
  }

  if (!base64 || !moteur) {
    await emit({
      etape: "ready",
      statut: "echec",
      detail: "Fal + Replicate text-removal indisponibles ou sorties noires",
    });
    throw new RefusRetouche(
      "nettoyage: Fal/Replicate text-removal indisponibles ou sorties noires",
    );
  }

  // Import slideshow : upscale Fal SeedVR AVANT le strip métadonnées
  // (Fal peut réinjecter des credentials — le C2PA doit rester en dernier).
  if (opts?.upscaleAvantStrip) {
    const factor =
      typeof opts.upscaleFactor === "number" &&
        opts.upscaleFactor >= 1 &&
        opts.upscaleFactor <= 4
        ? opts.upscaleFactor
        : 2;
    await emit({
      etape: "upscale",
      statut: "encours",
      detail: `③ Upscale Fal SeedVR ×${factor} (avant strip métadonnées)`,
    });
    try {
      const { mime: mimeIn } = mimeDepuisBase64(base64, "image/png");
      const bytesIn = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const ext =
        mimeIn.includes("png")
          ? "png"
          : mimeIn.includes("webp")
            ? "webp"
            : "jpg";
      const falUrl = await falHebergerOctets(
        bytesIn,
        mimeIn,
        `import-clean-${Date.now()}.${ext}`,
      );
      const up = await upscaleViaSeedVr(falUrl, async (p) => {
        if (p.phase === "poll") {
          await emit({
            etape: "upscale",
            statut: "encours",
            detail: `③ SeedVR: ${p.detail ?? `poll #${p.polls ?? 0}`}`,
          });
        } else if (p.detail) {
          await emit({
            etape: "upscale",
            statut: "encours",
            detail: `③ SeedVR: ${p.detail}`,
          });
        }
      }, factor);
      if (!up) {
        await emit({
          etape: "upscale",
          statut: "saute",
          detail: "③ SeedVR SAUTÉ — FAL_KEY absente (image non upscalée)",
        });
      } else {
        let binaire = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < up.bytes.length; i += CHUNK) {
          binaire += String.fromCharCode(...up.bytes.subarray(i, i + CHUNK));
        }
        base64 = btoa(binaire);
        upscaleOk = true;
        await emit({
          etape: "upscale",
          statut: "ok",
          detail: `③ SeedVR OK · ${up.bytes.length} octets · ${up.mime}`,
        });
      }
    } catch (error) {
      await emit({
        etape: "upscale",
        statut: "echec",
        detail: `③ SeedVR ÉCHEC: ${redactSecrets(messageErreur(error))} — on continue sans upscale`,
      });
    }
  }

  const rangC2pa = opts?.upscaleAvantStrip ? "④" : "③";
  await emit({
    etape: "c2pa",
    statut: "encours",
    detail: `${rangC2pa} Strip C2PA lossless (pas de ré-encode JPEG)`,
  });
  try {
    const stripped = await retirerContentCredentials(base64);
    base64 = stripped.base64;
    await emit({
      etape: "c2pa",
      statut: "ok",
      detail: stripped.retire
        ? `${rangC2pa} C2PA retiré (bitstream lossless, pixels inchangés)`
        : `${rangC2pa} Pas de C2PA — octets inchangés`,
    });
    return {
      base64,
      moteur,
      mime: stripped.mime,
      etapes,
      upscale: upscaleOk,
    };
  } catch (error) {
    await emit({
      etape: "c2pa",
      statut: "echec",
      detail: `${rangC2pa} Strip C2PA ÉCHEC: ${redactSecrets(messageErreur(error))} — image livrée quand même`,
    });
    // fallback mime : détecter PNG/JPEG depuis les octets (pas forcer jpeg).
    const { mime } = mimeDepuisBase64(base64, "image/png");
    return {
      base64,
      moteur,
      mime,
      etapes,
      upscale: upscaleOk,
    };
  }
}

/** Masque tokens / clés éventuels dans les messages d'erreur des logs. */
function redactSecrets(s: string): string {
  return s
    .replace(/(?:api[_-]?key|token|authorization|bearer)\s*[:=]\s*["']?[^\s"',}]+/gi, "$1=[REDACTED]")
    .replace(/\bKey\s+[A-Za-z0-9_\-]{12,}/g, "Key [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9]{10,}/g, "sk-[REDACTED]");
}

/**
 * Détecte les zones de texte incrusté, puis les efface par inpainting. La
 * détection est une simple lecture (jamais bloquée), l'effacement ne touche que
 * les zones repérées. Les erreurs remontent (elles ne sont plus gobées) pour
 * que la vraie cause d'un échec soit visible.
 */
async function inpaintFallback(image: Part, imageUrl: string): Promise<string | null> {
  const base64 = image.inline_data?.data ?? image.inlineData?.data;
  const mime = image.inline_data?.mime_type ?? image.inlineData?.mimeType ?? "image/jpeg";
  if (!base64) return null;

  const zones = await detecterZonesTexte(image);
  if (zones.length === 0) return null;

  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return await effacerTexte(imageUrl, bytes, mime, zones);
}

/**
 * Renvoie les rectangles (fractions 0..1) des textes/stickers/watermarks
 * incrustés. Tâche de détection pure, donc non soumise au refus d'édition.
 */
async function detecterZonesTexte(image: Part): Promise<Zone[]> {
  const prompt = `Tu localises tout ce qui a été AJOUTÉ par-dessus la photo : textes, sous-titres, légendes, stickers, watermarks, pseudos, boutons, logos d'interface. Il y en a presque toujours.
Regroupe les lignes d'un MÊME bloc de texte en UN seul rectangle, et prends une marge GÉNÉREUSE autour (mieux vaut englober un peu trop que laisser un bord de lettre).
Donne chaque rectangle en FRACTIONS de 0 à 1 (origine coin haut-gauche).
Réponds UNIQUEMENT par un tableau JSON, rien avant ni après :
[{"x":0.1,"y":0.05,"w":0.8,"h":0.35}]
Réponds [] seulement si l'image est réellement vierge de tout texte ou sticker.`;

  // Deux tentatives : la détection est le maillon fragile (une réponse vide ou
  // mal formée bloque tout le nettoyage), mais trois passes faisaient dépasser
  // le temps de l'Edge Function. Le parseur gère maintenant le JSON en bloc de
  // code, cas le plus fréquent — une seule passe suffit presque toujours.
  for (let essai = 0; essai < 2; essai += 1) {
    const parts = await callWithFallback(TEXT_MODELS, [image, { text: prompt }]);
    const zones = parserZones(textOf(parts));
    if (zones.length > 0) return zones;
  }
  return [];
}

/** Extrait le premier tableau JSON de la réponse (même noyé dans du texte). */
function parserZones(texte: string): Zone[] {
  const trouve = texte.match(/\[[\s\S]*\]/);
  if (!trouve) return [];
  let data: unknown;
  try {
    data = JSON.parse(trouve[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const zones: Zone[] = [];
  for (const item of data) {
    const z = normaliserZone(item);
    if (z) zones.push(z);
  }
  return zones;
}

/**
 * Accepte les formats rencontrés : {x,y,w,h}, {box_2d:[ymin,xmin,ymax,xmax]},
 * ou [ymin,xmin,ymax,xmax] brut. Gère l'échelle 0-1000 (convention Gemini) et
 * ajoute une marge de sécurité autour du texte.
 */
// deno-lint-ignore no-explicit-any
function normaliserZone(item: any): Zone | null {
  let x: number, y: number, w: number, h: number;

  if (item && typeof item === "object" && !Array.isArray(item)) {
    if (typeof item.x === "number" && typeof item.w === "number") {
      ({ x, y, w, h } = item);
    } else if (Array.isArray(item.box_2d) && item.box_2d.length === 4) {
      const [ymin, xmin, ymax, xmax] = item.box_2d;
      x = xmin; y = ymin; w = xmax - xmin; h = ymax - ymin;
    } else return null;
  } else if (Array.isArray(item) && item.length === 4) {
    const [ymin, xmin, ymax, xmax] = item;
    x = xmin; y = ymin; w = xmax - xmin; h = ymax - ymin;
  } else return null;

  if ([x, y, w, h].some((n) => typeof n !== "number" || Number.isNaN(n))) return null;

  // Coordonnées en 0-1000 → fractions.
  if (Math.max(x, y, w, h) > 1.5) {
    x /= 1000; y /= 1000; w /= 1000; h /= 1000;
  }
  if (w <= 0 || h <= 0) return null;

  // Marge large (3 % de chaque côté) : LaMa n'efface QUE le masque et n'invente
  // rien, donc un masque trop serré laisse un liseré de texte. Mieux vaut
  // mordre un peu autour — sur les fonds unis où le texte se pose, c'est sans
  // conséquence.
  const marge = 0.03;
  const x0 = Math.max(0, x - marge);
  const y0 = Math.max(0, y - marge);
  const x1 = Math.min(1, x + w + marge);
  const y1 = Math.min(1, y + h + marge);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Le modèle a répondu mais refusé de retoucher l'image. À distinguer d'une
 * panne : changer de modèle n'y changera rien, et le motif mérite d'être
 * remonté jusqu'en base plutôt que d'être avalé silencieusement.
 */
export class RefusRetouche extends Error {
  constructor(motif: string) {
    super(`Retouche refusée — ${motif}`);
    this.name = "RefusRetouche";
  }
}

export interface PersonaProposee {
  pseudos: string[];
  bio: string;
}

/**
 * Propose des pseudos et une bio pour un nouveau compte de publication.
 *
 * Le compte de référence n'est jamais transmis au modèle : on ne lui donne que
 * la niche. C'est ce qui empêche les propositions de ressembler à la source et
 * de trahir d'où vient la matière.
 */
export async function genererPersona(input: {
  niche: string;
  langue: string;
  /** @ du compte de référence : inspire les pseudos « dans la même veine ». */
  referenceHandle?: string;
  /** Bio du compte de référence : inspire la nouvelle bio, sans la copier. */
  referenceBio?: string;
}): Promise<PersonaProposee | null> {
  const langue = LANGUES[input.langue] ?? input.langue;

  const prompt = `Tu crées l'identité d'un nouveau compte TikTok qui publiera du
contenu de culture générale dans la niche : ${input.niche || "culture générale"}.

TOUT ce que tu écris (pseudos ET bio) doit être en ${langue.toUpperCase()}.
${input.referenceHandle ? `\nCompte de référence dont il faut s'inspirer (SANS copier) : @${input.referenceHandle}.` : ""}${
    input.referenceBio ? `\nBio de ce compte de référence, à reprendre EN ESPRIT (pas mot à mot) :\n"${input.referenceBio}"` : ""
  }

Propose 4 pseudos et une bio.

Règles pour les pseudos :
- DANS LA MÊME VEINE que le @ de référence, mais NOUVEAUX (jamais le même mot-clé).
- Courts, faciles à retenir et à taper, en minuscules, en ${langue}.
- Uniquement lettres, chiffres, points et underscores.
- Crédibles pour un vrai compte tenu par une personne, pas une marque.
- Quatre directions différentes, pas quatre variantes du même mot.

Règles pour la bio :
- Dans la même veine que la bio de référence, mais RÉÉCRITE, en ${langue}.
- Deux lignes maximum, ton naturel, tutoiement.
- Pas de jargon marketing, pas de tiret cadratin, pas d'emoji en rafale.

Réponds uniquement en JSON, sans bloc de code :
{"pseudos": ["...", "...", "...", "..."], "bio": "..."}`;

  const parts = await callWithFallback(TEXT_MODELS, [{ text: prompt }]);
  const raw = textOf(parts).replace(/^```(?:json)?|```$/g, "").trim();

  try {
    const parsed = JSON.parse(raw);
    const pseudos = (parsed.pseudos ?? [])
      .map((p: unknown) => String(p ?? "").trim().toLowerCase())
      .filter(Boolean);
    if (pseudos.length === 0) return null;
    return { pseudos, bio: String(parsed.bio ?? "").trim() };
  } catch {
    return null;
  }
}

/**
 * Un visuel montrant un visage identifiable ne peut pas servir de photo de
 * profil : le compte est public et la personne n'a rien demandé. Renvoie null
 * si le modèle n'a pas su trancher — l'appelant traite alors le doute comme un
 * refus.
 */
export async function contientVisageIdentifiable(imageUrl: string): Promise<boolean | null> {
  try {
    const image = await fetchImageAsInline(imageUrl);
    const parts = await callWithFallback(TEXT_MODELS, [
      {
        text: `Cette image montre-t-elle le visage d'une personne réelle, reconnaissable ?
Un visage flou, de dos, de très loin, partiellement masqué ou dessiné ne compte pas.
Réponds uniquement par OUI ou NON.`,
      },
      image,
    ]);

    const answer = textOf(parts).toUpperCase();
    if (answer.includes("OUI")) return true;
    if (answer.includes("NON")) return false;
    return null;
  } catch {
    return null;
  }
}

/**
 * Traduit un DOCUMENT (guide/FAQ) du français vers l'anglais en préservant le
 * balisage HTML (le contenu vient d'un éditeur riche). On ne traduit que le
 * texte visible, jamais les balises. Format à délimiteur (pas de JSON) : du HTML
 * dans du JSON casse au moindre guillemet d'attribut mal échappé.
 *
 * Sert au bouton « Traduire en anglais » : l'admin n'écrit qu'en français, la
 * version anglaise est générée, pas éditée deux fois.
 */
export async function translateDocumentToEnglish(input: {
  titre: string;
  contenuHtml: string;
}): Promise<{ titre_en: string; contenu_en: string }> {
  const prompt = `Translate the following document from French to ENGLISH.

STRICT RULES:
- The body is HTML from a rich-text editor. Keep every HTML tag, attribute and
  structure EXACTLY as-is. Translate ONLY the human-readable text between tags.
  Never add, remove or reorder tags. Leave URLs, code and proper nouns unchanged.
- Natural, direct English. Address the reader as "you". Write the way a person
  talks, not like marketing copy. Short sentences.
- FORBIDDEN: the em dash (—) and en dash (–). Use a comma, period or colon.
- Do not add emoji or exclamation marks that were not there.
- "Sophia" stays "Sophia". "poster" (the role) stays "poster".

Output EXACTLY in this format and nothing else (no code fence, no comment):
TITLE: <translated title, one line>
===BODY===
<translated HTML body>

TITLE: ${input.titre}
===BODY===
${input.contenuHtml}`;

  const parts = await callWithFallback(TEXT_MODELS, [{ text: prompt }]);
  const out = textOf(parts).replace(/^```(?:\w+)?\n?|```$/g, "").trim();
  const m = out.match(/TITLE:\s*([\s\S]*?)\n===BODY===\n?([\s\S]*)$/);
  if (!m) throw new Error("Traduction illisible (format inattendu)");
  return { titre_en: m[1].trim(), contenu_en: m[2].trim() };
}

/** Détecte JPEG/PNG depuis les magic bytes (Fal/Replicate sortent en PNG). */
export function mimeDepuisBase64(
  base64: string,
  fallback = "image/jpeg",
): { mime: string; ext: "jpg" | "png" } {
  try {
    const head = atob(base64.slice(0, 24));
    const b0 = head.charCodeAt(0);
    const b1 = head.charCodeAt(1);
    if (b0 === 0xff && b1 === 0xd8) return { mime: "image/jpeg", ext: "jpg" };
    if (b0 === 0x89 && b1 === 0x50) return { mime: "image/png", ext: "png" };
  } catch {
    /* ignore */
  }
  if (fallback.includes("png")) return { mime: "image/png", ext: "png" };
  return { mime: "image/jpeg", ext: "jpg" };
}

/**
 * PAUSE — plus aucun appel Gemini.
 * Avant : vision OUI/NON après chaque nettoyage + audit cron → dépenses continues.
 * Remettre en service = supprimer le early-return et restaurer l'appel TEXT_MODELS.
 */
export async function verifyClean(
  _base64Image: string,
  _mimeType: string,
): Promise<boolean> {
  return true;
}
