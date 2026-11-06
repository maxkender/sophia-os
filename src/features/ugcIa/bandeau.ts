// UGC IA : le bandeau style Snapchat (barre noire translucide sur toute la
// largeur, texte blanc centré), dessiné dans le navigateur à la taille exacte
// de la vidéo. La même image sert d'aperçu dans la page et part au serveur, qui
// la pose sur la vidéo (fal ffmpeg-api/compose) : ce qu'on voit est ce qu'on a.
//
// Calé le 6/11 sur 4 vrais bandeaux Snapchat (sources TikTok en 720×1280),
// mesurés au pixel puis comparés côte à côte : texte ≈ 2,28 % de la hauteur
// (29 px), bande d'une ligne 65 px, + 35 px par ligne, noir à 58 %, emoji
// visible ≈ 30 px tous les 39 px, retour à la ligne au-delà de 93,5 % de la
// largeur, centre de la bande vers 30-39 % de la hauteur.
// La police est embarquée (Inter, proche du San Francisco d'iOS) et les emojis
// sont les images Apple, pour un rendu identique sur Mac, Windows ou Android.

import "@fontsource/inter/400.css";

export const POLICE_BANDEAU = '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';

/** Les emojis Apple (paquet emoji-datasource-apple), servis par jsDelivr avec CORS. */
export const URL_EMOJIS_APPLE = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/img/apple/64/";

/** Hauteur par défaut du centre du bandeau, en % de la hauteur de la vidéo (vrais bandeaux : 30 à 39 %). */
export const POSITION_BANDEAU_DEFAUT = 36;

/** Proportions mesurées sur de vrais bandeaux Snapchat. */
const TEXTE_SUR_HAUTEUR = 0.0228;
const INTERLIGNE_SUR_TEXTE = 1.22;
const MARGE_SUR_TEXTE = 0.515;
const LARGEUR_UTILE = 0.935;
const OPACITE_BANDE = 0.58;
/** Un emoji avance de 1,345 fois la taille du texte ; son image (marges comprises) fait 1,31 fois. */
const EMOJI_AVANCE = 1.345;
const EMOJI_TAILLE = 1.31;

/** Taille de la vidéo selon la résolution demandée à Genjutsu, si le lecteur ne la donne pas. */
export function tailleSelonResolution(resolution: string): { largeur: number; hauteur: number } {
  if (resolution === "1080p") return { largeur: 1080, hauteur: 1920 };
  if (resolution === "480p") return { largeur: 480, hauteur: 854 };
  return { largeur: 720, hauteur: 1280 };
}

const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

export type Morceau = { emoji: boolean; texte: string };

// Intl.Segmenter (ES2022) : présent dans tous les navigateurs récents, absent des types du projet.
type Segmenteur = { segment(s: string): Iterable<{ segment: string }> };
const Segmenter = (Intl as unknown as { Segmenter?: new (langue: string, o: { granularity: "grapheme" }) => Segmenteur }).Segmenter;

/** Les graphies d'une ligne (un emoji ZWJ ou teinté = une seule) ; à défaut, ses caractères. */
function graphies(ligne: string): string[] {
  return Segmenter ? [...new Segmenter("fr", { granularity: "grapheme" }).segment(ligne)].map((s) => s.segment) : [...ligne];
}

/** Découpe une ligne en morceaux de texte et en emojis (un emoji = une graphie, ZWJ et teintes compris). */
export function decouperEmojis(ligne: string): Morceau[] {
  const morceaux: Morceau[] = [];
  for (const g of graphies(ligne)) {
    const emoji = EMOJI.test(g);
    const dernier = morceaux[morceaux.length - 1];
    if (!emoji && dernier && !dernier.emoji) dernier.texte += g;
    else morceaux.push({ emoji, texte: g });
  }
  return morceaux;
}

/**
 * Les noms de fichier possibles d'un emoji dans emoji-datasource-apple : ses
 * points de code en hexadécimal, avec puis sans sélecteur de variante (FE0F),
 * ou avec FE0F ajouté (un « ❤ » tapé sans lui est rangé « 2764-fe0f »).
 */
export function fichiersEmojiApple(emoji: string): string[] {
  const codes = [...emoji].map((c) => c.codePointAt(0)!.toString(16));
  const sans = codes.filter((c) => c !== "fe0f");
  const noms = [codes.join("-"), sans.join("-"), sans.length === 1 ? `${sans[0]}-fe0f` : null];
  return [...new Set(noms.filter((n): n is string => Boolean(n)))].map((n) => `${n}.png`);
}

/** Largeur d'une ligne : le texte mesuré par la police, les emojis à leur avance fixe. */
export function largeurLigne(ligne: string, taille: number, mesurerTexte: (s: string) => number): number {
  return decouperEmojis(ligne).reduce((l, m) => l + (m.emoji ? taille * EMOJI_AVANCE : mesurerTexte(m.texte)), 0);
}

/** Coupe le texte en lignes qui tiennent dans la largeur (mots entiers ; les retours à la ligne sont gardés). */
export function couperLignes(texte: string, largeurMax: number, mesurer: (s: string) => number): string[] {
  const lignes: string[] = [];
  for (const paragraphe of texte.split("\n")) {
    let ligne = "";
    for (const mot of paragraphe.split(/\s+/).filter(Boolean)) {
      const essai = ligne ? `${ligne} ${mot}` : mot;
      if (!ligne || mesurer(essai) <= largeurMax) ligne = essai;
      else {
        lignes.push(ligne);
        ligne = mot;
      }
    }
    if (ligne) lignes.push(ligne);
  }
  return lignes;
}

/**
 * La géométrie du bandeau, en pixels de la vidéo : taille du texte,
 * interligne, marge et position de la bande, centrée sur `position` (% de la
 * hauteur) sans sortir de l'image.
 */
export function geometrieBandeau(hauteur: number, nbLignes: number, position: number) {
  const taille = Math.max(12, Math.round(hauteur * TEXTE_SUR_HAUTEUR));
  const interligne = Math.round(taille * INTERLIGNE_SUR_TEXTE);
  const marge = Math.round(taille * MARGE_SUR_TEXTE);
  const hBande = nbLignes * interligne + 2 * marge;
  const centre = (Math.min(100, Math.max(0, position)) / 100) * hauteur;
  const y = Math.min(Math.max(0, Math.round(centre - hBande / 2)), Math.max(0, hauteur - hBande));
  return { taille, interligne, marge, hBande, y };
}

/** Les images Apple déjà chargées (null : introuvable, on retombe sur l'emoji du système). */
export type ImagesEmojis = ReadonlyMap<string, HTMLImageElement | null>;

/** Dessine le bandeau sur un calque transparent de la taille de la vidéo. */
export function dessinerBandeau(
  ctx: CanvasRenderingContext2D,
  largeur: number,
  hauteur: number,
  texte: string,
  position: number,
  images: ImagesEmojis = new Map(),
): void {
  ctx.clearRect(0, 0, largeur, hauteur);
  const { taille } = geometrieBandeau(hauteur, 1, position);
  ctx.font = `400 ${taille}px ${POLICE_BANDEAU}`;
  const mesurerTexte = (s: string) => ctx.measureText(s).width;
  const lignes = couperLignes(texte.trim(), largeur * LARGEUR_UTILE, (s) => largeurLigne(s, taille, mesurerTexte));
  if (lignes.length === 0) return;
  const g = geometrieBandeau(hauteur, lignes.length, position);
  ctx.fillStyle = `rgba(0, 0, 0, ${OPACITE_BANDE})`;
  ctx.fillRect(0, g.y, largeur, g.hBande);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  lignes.forEach((ligne, i) => {
    const milieu = g.y + g.marge + g.interligne * (i + 0.5);
    let x = (largeur - largeurLigne(ligne, taille, mesurerTexte)) / 2;
    for (const m of decouperEmojis(ligne)) {
      if (!m.emoji) {
        ctx.fillText(m.texte, x, milieu);
        x += mesurerTexte(m.texte);
        continue;
      }
      const avance = taille * EMOJI_AVANCE;
      const image = images.get(m.texte);
      if (image) {
        const cote = taille * EMOJI_TAILLE;
        ctx.drawImage(image, x + (avance - cote) / 2, milieu - cote / 2, cote, cote);
      } else {
        ctx.fillText(m.texte, x, milieu);
      }
      x += avance;
    }
  });
}

const cacheEmojis = new Map<string, Promise<HTMLImageElement | null>>();

function chargerImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Sans CORS, le canevas serait « sali » et l'image du bandeau impossible à exporter.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** L'image Apple d'un emoji (en cache), ou null si aucun fichier ne correspond. */
export function imageEmojiApple(emoji: string): Promise<HTMLImageElement | null> {
  let p = cacheEmojis.get(emoji);
  if (!p) {
    p = (async () => {
      for (const fichier of fichiersEmojiApple(emoji)) {
        const img = await chargerImage(`${URL_EMOJIS_APPLE}${fichier}`);
        if (img) return img;
      }
      return null;
    })();
    cacheEmojis.set(emoji, p);
  }
  return p;
}

/**
 * Le bandeau en PNG transparent (data URL), prêt pour l'aperçu et pour le
 * serveur : attend la police et les images Apple des emojis avant de dessiner.
 */
export async function bandeauPng(largeur: number, hauteur: number, texte: string, position: number): Promise<string> {
  const { taille } = geometrieBandeau(hauteur, 1, position);
  try {
    await document.fonts.load(`400 ${taille}px "Inter"`, texte);
  } catch {
    // police indisponible : le dessin retombe sur Helvetica / Arial
  }
  const emojis = [...new Set(decouperEmojis(texte).filter((m) => m.emoji).map((m) => m.texte))];
  const images = new Map(await Promise.all(emojis.map(async (e) => [e, await imageEmojiApple(e)] as const)));
  const canvas = document.createElement("canvas");
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Ce navigateur ne sait pas dessiner le bandeau");
  dessinerBandeau(ctx, largeur, hauteur, texte, position, images);
  return canvas.toDataURL("image/png");
}
