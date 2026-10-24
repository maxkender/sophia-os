/**
 * Banque des captures d'applis et de leurs mises en scène (migration 0344,
 * fonction `mises-en-scene`). Logique pure : prompts Nano Banana Pro, contrôle
 * des paramètres, budget Fal de la semaine, taille des images, chemins.
 */

import { nomLangue } from "./comment_masters.ts";

/** Le support d'une capture, d'un intégrateur et de leur mise en scène. */
export const SUPPORTS = ["iphone", "tablette", "ordinateur"] as const;
export const STATUTS = ["a_valider", "validee", "rejetee"] as const;

export type Support = (typeof SUPPORTS)[number];
export type Statut = (typeof STATUTS)[number];

const ECRAN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** parcours, notes, a-retenir, lecons, site… (minuscules et tirets). */
export function ecranValide(ecran: unknown): ecran is string {
  return typeof ecran === "string" && ecran.length <= 40 && ECRAN.test(ecran);
}

/** Une langue que l'OS sait nommer au modèle (fr, en, es, es-419, pt-BR…). */
export function langueValide(langue: unknown): langue is string {
  return typeof langue === "string" && /^[a-z]{2}(-[A-Za-z0-9]{2,3})?$/.test(langue) &&
    nomLangue(langue) !== langue;
}

export function supportValide(s: unknown): s is Support {
  return (SUPPORTS as readonly unknown[]).includes(s);
}

// ---------------------------------------------------------------------------
// Prompts (clés `prompts` éditables : mise_en_scene_traduction,
// mise_en_scene_incrustation ; {langue}, {app} et {appareil} remplacés ici).
// ---------------------------------------------------------------------------

export const PROMPT_TRADUCTION_DEFAUT = `This image is a real screenshot of a mobile app.

Translate ALL the text of the interface into {langue}, exactly as the app itself would display it natively in {langue}: natural, idiomatic UI wording, correct accents and punctuation for {langue}.

Keep EVERYTHING else exactly identical: same layout, same positions, same fonts and font weights, same text sizes, same colors, same icons, same images, same status bar, same image size and aspect ratio.
The app name "{app}" is never translated and keeps its exact spelling and case. Brand names stay as they are.
Do not add, remove or move anything. Do not add any text that is not a translation of the original text.`;

export const PROMPT_INCRUSTATION_DEFAUT = `Image 1 is a real photo (the scene). Image 2 is a real app screenshot.

Replace the content of the {appareil} screen in image 1 with image 2, exactly as it is: the whole screenshot, uncropped, unaltered, every word identical, following the perspective, curvature and rounded corners of the screen.
Keep the hand and fingers that pass in front of the screen IN FRONT of it, untouched. Keep the scene's reflections, glare and lighting on the glass, so the screen looks really lit inside this photo.
Do not change anything else in the photo: same framing, same objects, same colors, same grain. Do not add any text, logo or person.
Output at the size and aspect ratio of image 1, high definition.`;

const NOM_SUPPORT: Record<Support, string> = {
  iphone: "phone",
  tablette: "tablet",
  ordinateur: "computer",
};

export function promptTraduction(modele: string | undefined, langue: string, nomApp: string): string {
  return (modele ?? PROMPT_TRADUCTION_DEFAUT).replaceAll("{langue}", nomLangue(langue)).replaceAll("{app}", nomApp);
}

export function promptIncrustation(modele: string | undefined, support: Support): string {
  return (modele ?? PROMPT_INCRUSTATION_DEFAUT).replaceAll("{appareil}", NOM_SUPPORT[support]);
}

// ---------------------------------------------------------------------------
// Budget Fal (semaine glissante, journal `depenses_fal`).
// ---------------------------------------------------------------------------

export interface ReglagesMisesEnScene {
  budget_fal_usd_semaine: number;
  prix_image_usd: number;
}

export const REGLAGES_DEFAUT: ReglagesMisesEnScene = {
  budget_fal_usd_semaine: 5,
  prix_image_usd: 0.15,
};

export function lireReglagesMisesEnScene(valeur: unknown): ReglagesMisesEnScene {
  const v = (valeur ?? {}) as Partial<Record<keyof ReglagesMisesEnScene, unknown>>;
  const nombre = (x: unknown, d: number) => {
    const n = Number(x);
    return Number.isFinite(n) && n >= 0 ? n : d;
  };
  return {
    budget_fal_usd_semaine: nombre(v.budget_fal_usd_semaine, REGLAGES_DEFAUT.budget_fal_usd_semaine),
    prix_image_usd: nombre(v.prix_image_usd, REGLAGES_DEFAUT.prix_image_usd),
  };
}

export interface EtatBudget {
  depense_semaine: number;
  budget_semaine: number;
  prix_image: number;
  reste: number;
  /** Une image de plus tient dans le budget. */
  possible: boolean;
}

/** Dépenses des 7 derniers jours (à `maintenant`) et place pour une image de plus. */
export function etatBudget(
  depenses: { le: string; usd: number | string }[],
  reglages: ReglagesMisesEnScene,
  maintenant = Date.now(),
): EtatBudget {
  const depuis = maintenant - 7 * 86_400_000;
  const semaine = depenses
    .filter((d) => Date.parse(d.le) >= depuis)
    .reduce((s, d) => s + Number(d.usd || 0), 0);
  const depense = Math.round(semaine * 1000) / 1000;
  const reste = Math.round((reglages.budget_fal_usd_semaine - depense) * 1000) / 1000;
  return {
    depense_semaine: depense,
    budget_semaine: reglages.budget_fal_usd_semaine,
    prix_image: reglages.prix_image_usd,
    reste,
    possible: depense + reglages.prix_image_usd <= reglages.budget_fal_usd_semaine + 1e-9,
  };
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** Largeur × hauteur d'un PNG ou d'un JPEG (null si format inconnu). */
export function tailleImage(b: Uint8Array): { largeur: number; hauteur: number } | null {
  // PNG : signature puis IHDR (largeur, hauteur sur 4 octets big-endian).
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { largeur: v.getUint32(16), hauteur: v.getUint32(20) };
  }
  // JPEG : premier segment SOFn (hors DHT C4, JPG C8, DAC CC).
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marqueur = b[i + 1];
      if (marqueur === 0xff) {
        i += 1;
        continue;
      }
      if (marqueur === 0xd8 || marqueur === 0x01 || (marqueur >= 0xd0 && marqueur <= 0xd7)) {
        i += 2;
        continue;
      }
      const longueur = (b[i + 2] << 8) | b[i + 3];
      if (
        marqueur >= 0xc0 && marqueur <= 0xcf && marqueur !== 0xc4 && marqueur !== 0xc8 && marqueur !== 0xcc
      ) {
        return { hauteur: (b[i + 5] << 8) | b[i + 6], largeur: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + longueur;
    }
  }
  return null;
}

export function extensionImage(b: Uint8Array): "png" | "jpg" | null {
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  return null;
}

/** medias/captures/<app>/<langue>/<ecran>-<support>-<id>.<ext> */
export function cheminCapture(app: string, langue: string, ecran: string, support: string, id: string, ext: string) {
  return `captures/${app}/${langue}/${ecran}-${support}-${id.slice(0, 8)}.${ext}`;
}

/** medias/mises-en-scene/<app>/<langue>/<ecran>-<support>-<id>.<ext> */
export function cheminMiseEnScene(
  app: string,
  langue: string,
  ecran: string,
  support: string,
  id: string,
  ext: string,
) {
  return `mises-en-scene/${app}/${langue}/${ecran}-${support}-${id.slice(0, 8)}.${ext}`;
}

// ---------------------------------------------------------------------------
// Règles de la banque
// ---------------------------------------------------------------------------

/** Une relance de plus est-elle permise ? (« un essai, une seule relance, sinon rejet ») */
export function relancePermise(essai: number): boolean {
  return essai < 2;
}

/**
 * Une mise en scène est à refaire quand sa capture a été remplacée, ou quand
 * sa capture est une traduction d'une originale remplacée.
 */
export function aRefaire(capture: { remplacee_par: string | null }, originale?: { remplacee_par: string | null } | null) {
  return Boolean(capture.remplacee_par) || Boolean(originale?.remplacee_par);
}

export interface Couple {
  capture_id: string;
  integrateur_id: string;
}

/**
 * Les couples capture × intégrateur (même support) qui n'ont pas encore de
 * mise en scène vivante, dans un ordre qui varie : en diagonale, chaque
 * capture passe une fois avant qu'une capture ne revienne, et deux captures
 * de suite ne tombent pas sur la même photo. Un lot coupé au budget reste
 * donc varié.
 */
export function couplesManquants(
  captures: { id: string; support: string }[],
  integrateurs: { id: string; support: string }[],
  existants: Couple[],
): Couple[] {
  const deja = new Set(existants.map((e) => `${e.capture_id}|${e.integrateur_id}`));
  const sortie: Couple[] = [];
  for (const support of SUPPORTS) {
    const cs = captures.filter((c) => c.support === support);
    const is = integrateurs.filter((i) => i.support === support);
    for (let d = 0; d < is.length; d += 1) {
      for (let k = 0; k < cs.length; k += 1) {
        const couple = { capture_id: cs[k].id, integrateur_id: is[(k + d) % is.length].id };
        if (!deja.has(`${couple.capture_id}|${couple.integrateur_id}`)) sortie.push(couple);
      }
    }
  }
  return sortie;
}
