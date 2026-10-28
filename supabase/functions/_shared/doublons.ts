/**
 * Doublons d'accroche et de couverture (décision d'Adrien du 28/10).
 *
 * Un compte ne doit pas recevoir, à moins de N jours, deux posts qui portent la
 * même accroche (texte de la slide 1) ou la même image de couverture, même s'ils
 * viennent de deux contenus différents. Le stock weird_alpha avait 27 originaux
 * à l'accroche identique, et 11 images de couverture présentes sous plusieurs
 * `media_id` : la règle « même contenu » (0271) ne voyait rien.
 *
 * Ce module porte la partie pure, testée à part :
 *  - l'accroche normalisée (casse, ponctuation, émojis et espaces ignorés) ;
 *  - l'empreinte d'une image : un dHash de 64 bits, en 16 caractères
 *    hexadécimaux. L'image réduite à 9 × 8 cases en niveaux de gris, chaque
 *    case comparée à sa voisine de droite. Une même photo recompressée,
 *    légèrement recadrée ou éclaircie garde presque la même empreinte ; deux
 *    photos différentes en diffèrent d'une trentaine de bits ;
 *  - la distance entre deux empreintes, et les doublons d'un pool face aux
 *    posts récents d'un compte.
 *
 * Les empreintes sont calculées À L'AVANCE (fonction `empreintes`, cron toutes
 * les 10 minutes) et rangées dans `contenus` : l'assignation ne fait que
 * comparer des chaînes, sans jamais télécharger d'image. Une empreinte absente
 * ne change rien : la règle ne relègue que sur une égalité prouvée. Les labels
 * 100 % podz (page blanche, remakes) n'ont pas de signature : ils reprennent à
 * dessein une même photo sous des accroches différentes.
 */

/**
 * Écart maximal (en bits sur 64) entre deux empreintes d'une même image.
 * Calibré le 28/10 sur 723 couvertures de 14 labels : la même photo recadrée ou
 * recompressée reste à 9 bits ou moins ; deux photos différentes, à 10 et plus.
 * Seule exception, les pages blanches, où le fond commun rapproche deux photos
 * différentes à 8 bits : c'est un label 100 % podz, donc sans signature.
 */
export const SEUIL_EMPREINTE = 8;

/** Côté (en pixels) de la miniature lue pour calculer une empreinte. */
export const COTE_MINIATURE = 64;

/** Ce qui identifie un post aux yeux d'un abonné : l'accroche et la couverture. */
export interface Signature {
  accroche: string | null;
  empreinte: string | null;
}

/**
 * Accroche comparable : sans accents, en minuscules, lettres et chiffres
 * seulement (toutes écritures), espaces resserrés. Deux accroches égales ici
 * sont la même accroche pour un abonné, à la ponctuation, aux émojis et à la
 * casse près (le « ı » turc compte pour « i », sinon « İPUÇLARI » et
 * « ipuçları » différeraient). `null` si le texte est vide ou fait moins de 3
 * caractères (rien à comparer).
 */
export function normaliserAccroche(texte: string | null | undefined): string | null {
  if (!texte) return null;
  const t = texte
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return t.length >= 3 ? t : null;
}

/** Une empreinte valide : 16 caractères hexadécimaux minuscules. */
export function estEmpreinte(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{16}$/.test(v);
}

/** Nombre de bits qui diffèrent entre deux empreintes valides (0 à 64). */
export function distanceEmpreintes(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** Deux signatures désignent-elles le même post pour un abonné ? */
export function memeSignature(a: Signature, b: Signature, seuil = SEUIL_EMPREINTE): boolean {
  if (a.accroche && b.accroche && a.accroche === b.accroche) return true;
  return estEmpreinte(a.empreinte) && estEmpreinte(b.empreinte) &&
    distanceEmpreintes(a.empreinte, b.empreinte) <= seuil;
}

/**
 * Empreinte d'une image décodée (`canaux` octets par pixel : 4 pour RGBA, 3
 * pour RGB, 1 ou 2 pour du gris). Réduction à 9 × 8 par moyenne de zone, sur
 * la luminance, puis un bit par case : plus claire que sa voisine de droite.
 */
export function empreinteDepuisPixels(
  data: ArrayLike<number>,
  largeur: number,
  hauteur: number,
  canaux = 4,
): string {
  if (largeur < 1 || hauteur < 1) throw new Error("image vide");
  const gris = new Float64Array(9 * 8);
  for (let y = 0; y < 8; y += 1) {
    const y0 = Math.floor((y * hauteur) / 8);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * hauteur) / 8));
    for (let x = 0; x < 9; x += 1) {
      const x0 = Math.floor((x * largeur) / 9);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * largeur) / 9));
      let somme = 0;
      let n = 0;
      for (let yy = y0; yy < Math.min(y1, hauteur); yy += 1) {
        for (let xx = x0; xx < Math.min(x1, largeur); xx += 1) {
          const i = (yy * largeur + xx) * canaux;
          somme += canaux >= 3
            ? 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
            : data[i];
          n += 1;
        }
      }
      gris[y * 9 + x] = n ? somme / n : 0;
    }
  }
  let hex = "";
  for (let y = 0; y < 8; y += 1) {
    let octet = 0;
    for (let x = 0; x < 8; x += 1) {
      octet = (octet << 1) | (gris[y * 9 + x] > gris[y * 9 + x + 1] ? 1 : 0);
    }
    hex += octet.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Une image décodée, prête pour `empreinteDepuisPixels`. */
export interface ImageDecodee {
  data: ArrayLike<number>;
  largeur: number;
  hauteur: number;
  canaux: number;
}

/**
 * Décode une miniature JPEG ou PNG (les deux formats de la banque ; une image
 * WebP rend `null` et reste sans empreinte). Les décodeurs sont chargés à la
 * demande : une panne de l'un ne touche que les images de ce format.
 */
export async function decoderImage(octets: Uint8Array): Promise<ImageDecodee | null> {
  if (octets[0] === 0xff && octets[1] === 0xd8) {
    const { decode } = await import("npm:jpeg-js@0.4.4");
    const img = decode(octets, { useTArray: true, maxMemoryUsageInMB: 64 });
    return { data: img.data, largeur: img.width, hauteur: img.height, canaux: 4 };
  }
  if (octets[0] === 0x89 && octets[1] === 0x50 && octets[2] === 0x4e && octets[3] === 0x47) {
    const { decode } = await import("npm:fast-png@8.0.0");
    const img = decode(octets);
    const n = img.width * img.height;
    // Palette : un indice par pixel, résolu en RGB.
    if (img.palette && img.channels === 1) {
      const rgb = new Uint8Array(n * 3);
      for (let p = 0; p < n; p += 1) {
        const c = img.palette[img.data[p]] ?? [0, 0, 0];
        rgb[p * 3] = c[0];
        rgb[p * 3 + 1] = c[1];
        rgb[p * 3 + 2] = c[2];
      }
      return { data: rgb, largeur: img.width, hauteur: img.height, canaux: 3 };
    }
    // 16 bits par canal : ramené à 8.
    const data = img.depth === 16 ? Uint8Array.from(img.data as ArrayLike<number>, (v) => v >> 8) : img.data;
    return { data, largeur: img.width, hauteur: img.height, canaux: img.channels };
  }
  return null;
}

/**
 * Adresse d'une miniature (côté `cote` px, proportions gardées) d'une image du
 * stockage public : quelques Ko au lieu d'un Mo. `null` hors stockage Supabase.
 */
export function urlMiniature(urlPublique: string, cote = COTE_MINIATURE): string | null {
  const m = urlPublique.match(/^(https:\/\/[^/]+\/storage\/v1)\/object\/public\/([^?#]+)/);
  if (!m) return null;
  return `${m[1]}/render/image/public/${m[2]}?width=${cote}&height=${cote}&resize=contain`;
}

/** Un post récent du compte : son contenu et son écart (en jours) au jour visé. */
export interface PostRecent {
  contenuId: string;
  ecart: number;
}

/**
 * Doublons d'un pool face aux posts récents d'un compte : pour chaque candidat
 * qui partage l'accroche ou la couverture d'un post récent d'un AUTRE contenu,
 * l'écart (en jours) au plus proche de ces posts. Le même contenu n'est pas
 * compté ici : c'est la règle 0271 (`ecartMinMemeContenu`).
 */
export function ecartsDoublons(args: {
  candidats: Iterable<[string, Signature]>;
  recents: PostRecent[];
  signatures: Map<string, Signature>;
  seuil?: number;
}): Map<string, number> {
  const seuil = args.seuil ?? SEUIL_EMPREINTE;
  const recents = args.recents
    .map((p) => ({ ...p, sig: args.signatures.get(p.contenuId) }))
    .filter((p): p is PostRecent & { sig: Signature } =>
      p.sig !== undefined && (p.sig.accroche !== null || estEmpreinte(p.sig.empreinte))
    );
  const ecarts = new Map<string, number>();
  if (recents.length === 0) return ecarts;
  for (const [cid, sig] of args.candidats) {
    if (!sig.accroche && !estEmpreinte(sig.empreinte)) continue;
    for (const p of recents) {
      if (p.contenuId === cid || !memeSignature(sig, p.sig, seuil)) continue;
      const connu = ecarts.get(cid);
      if (connu === undefined || p.ecart < connu) ecarts.set(cid, p.ecart);
    }
  }
  return ecarts;
}
