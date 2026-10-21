// Géométrie d'une slide @mentalapp : où sont les textes (lignes, blocs) et les
// images, sur un fond uni gris-vert. Aucune IA : on lit les pixels.
//
// Principe : le texte est noir (ou gris pour le filigrane) et fin. On prend les
// composantes connexes des pixels d'encre ; une composante de forme et de
// couleur de lettre, posée sur un aplat, est un caractère sûr. Les caractères
// forment des mots (trois passes : lettres, signes, lettres collées à une
// image), les mots des lignes, les lignes empilées des blocs. Une ligne dont
// les lettres ne partagent pas une même ligne de base est un pictogramme ou un
// morceau de photo : son bloc est marqué « autre » (laissé tel quel par défaut).

import { createCanvas, loadImage } from "@napi-rs/canvas";

/** [x, y, largeur, hauteur] en pixels de la slide source. */
export type Boite = [number, number, number, number];

export type BlocGeo = {
  id: string;
  boite: Boite;
  lignes: Boite[];
  alignement: "centre" | "gauche" | "droite";
  /** Couleur du texte (médiane de son encre), « #rrggbb ». */
  couleur: string;
  /** Fond autour du bloc (médiane d'un anneau), « #rrggbb ». */
  fond: string;
  /** Espace libre à gauche et à droite du bloc, sur ses lignes : [x min, x max]. */
  libre: [number, number];
  /** texte : des lettres sur une ligne de base ; autre : lettre isolée, pictogramme, photo. */
  probable: "texte" | "autre";
};

export type ImageGeo = { id: string; boite: Boite };

export type GeometrieSlide = {
  largeur: number;
  hauteur: number;
  fond: string;
  blocs: BlocGeo[];
  images: ImageGeo[];
};

/** Plus grande lettre d'un titre @mentalapp (« l » de couverture : ~135 px). */
const HAUTEUR_LETTRE_MAX = 160;
/** Écart au fond (somme des |Δ| RGB) au-delà duquel un pixel n'est pas du fond. */
const SEUIL_FOND = 36;

/**
 * Trois passes : le texte noir ; le texte gris (filigrane, « pt2 ») ; le texte
 * teinté posé sur une case colorée (sous-titres des rangs, « real, earned,
 * lasts » en rouge foncé sur rouge).
 */
const PASSES = [
  { nom: "noir", encreMax: 125, coeurMax: 70, chromaMax: 45 },
  { nom: "gris", encreMax: 205, coeurMax: 190, chromaMax: 22 },
  { nom: "teinte", encreMax: 255, coeurMax: 255, chromaMax: 255 },
] as const;
type Passe = (typeof PASSES)[number];

export type Pixels = { L: number; H: number; px: Uint8ClampedArray };

export async function lirePixels(chemin: string): Promise<Pixels> {
  const img = await loadImage(chemin);
  const c = createCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  return { L: img.width, H: img.height, px: ctx.getImageData(0, 0, img.width, img.height).data };
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

export function rgb(hexa: string): [number, number, number] {
  const v = hexa.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

const mediane = (v: number[]) => {
  if (!v.length) return 0;
  const t = [...v].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
};

const luminance = (px: Uint8ClampedArray, i: number) => 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
const chroma = (px: Uint8ClampedArray, i: number) => Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2]);

/** Couleur la plus fréquente d'une bande de 12 px sur les bords. */
export function couleurFond({ L, H, px }: Pixels): [number, number, number] {
  const compte = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < L; x += 2) {
      if (!(x < 12 || y < 12 || x >= L - 12 || y >= H - 12)) continue;
      const i = (y * L + x) * 4;
      const cle = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
      const e = compte.get(cle) ?? { n: 0, r: 0, g: 0, b: 0 };
      e.n++;
      e.r += px[i];
      e.g += px[i + 1];
      e.b += px[i + 2];
      compte.set(cle, e);
    }
  }
  const best = [...compte.values()].sort((a, b) => b.n - a.n)[0];
  return [best.r / best.n, best.g / best.n, best.b / best.n];
}

/**
 * Couleur de l'aplat autour d'une boîte : médiane d'un anneau, une fois écarté
 * ce qui est nettement plus sombre (lettres voisines, traits du tableau).
 */
export function fondAutour({ L, H, px }: Pixels, [x, y, l, h]: Boite, marge = 6): [number, number, number] {
  const anneau: number[] = [];
  for (let yy = Math.max(0, y - marge); yy <= Math.min(H - 1, y + h + marge); yy++) {
    for (let xx = Math.max(0, x - marge); xx <= Math.min(L - 1, x + l + marge); xx++) {
      if (xx >= x - 2 && xx < x + l + 2 && yy >= y - 2 && yy < y + h + 2) continue;
      anneau.push((yy * L + xx) * 4);
    }
  }
  const repere = mediane(anneau.map((i) => luminance(px, i)));
  const clairs = anneau.filter((i) => luminance(px, i) >= 0.75 * repere);
  return [0, 1, 2].map((k) => mediane(clairs.map((i) => px[i + k]))) as [number, number, number];
}

type Comp = { x0: number; y0: number; x1: number; y1: number; n: number };

/** Composantes connexes (8-connexité) d'un masque binaire. */
function composantes(masque: Uint8Array, L: number, H: number): Comp[] {
  const etiquette = new Int32Array(L * H).fill(-1);
  const comps: Comp[] = [];
  const pile = new Int32Array(L * H);
  for (let depart = 0; depart < L * H; depart++) {
    if (!masque[depart] || etiquette[depart] !== -1) continue;
    const id = comps.length;
    const c: Comp = { x0: L, y0: H, x1: -1, y1: -1, n: 0 };
    let haut = 0;
    pile[haut++] = depart;
    etiquette[depart] = id;
    while (haut) {
      const p = pile[--haut];
      const x = p % L;
      const y = (p - x) / L;
      c.n++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= L) continue;
          const q = yy * L + xx;
          if (masque[q] && etiquette[q] === -1) {
            etiquette[q] = id;
            pile[haut++] = q;
          }
        }
      }
    }
    comps.push(c);
  }
  return comps;
}

const hauteur = (c: Comp) => c.y1 - c.y0 + 1;
const largeur = (c: Comp) => c.x1 - c.x0 + 1;

class Union {
  p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  trouver(i: number): number {
    while (this.p[i] !== i) i = this.p[i] = this.p[this.p[i]];
    return i;
  }
  unir(a: number, b: number) {
    this.p[this.trouver(a)] = this.trouver(b);
  }
}

const boiteDe = (cs: Comp[]): Comp =>
  cs.reduce(
    (b, c) => ({ x0: Math.min(b.x0, c.x0), y0: Math.min(b.y0, c.y0), x1: Math.max(b.x1, c.x1), y1: Math.max(b.y1, c.y1), n: b.n + c.n }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, n: 0 },
  );
const enBoite = (c: Comp): Boite => [c.x0, c.y0, c.x1 - c.x0 + 1, c.y1 - c.y0 + 1];

/**
 * Caractère plausible : pas plus haut qu'une lettre de titre, pas trop large,
 * peu dense (traits fins). Un trait mince (« i », « l », un point) est dense
 * dans sa boîte : on le laisse passer.
 */
function formeDeCaractere(c: Comp): boolean {
  const h = hauteur(c);
  const l = largeur(c);
  if (c.n < 4 || h > HAUTEUR_LETTRE_MAX || l > 2.6 * h + 24) return false;
  if (Math.min(h, l) <= Math.max(7, 0.12 * h)) return true;
  return c.n / (h * l) <= 0.62;
}

/**
 * Le cœur d'un caractère n'a presque pas de couleur (texte noir ou gris). On ne
 * regarde que ses pixels les plus sombres : sur une case rouge, le bord
 * anticrénelé d'une lettre noire est rougeâtre, pas son cœur.
 */
function neutre({ L, px }: Pixels, c: Comp, encre: Uint8Array, passe: Passe): boolean {
  const moyenne = (seuil: number) => {
    let somme = 0;
    let n = 0;
    for (let y = c.y0; y <= c.y1; y++) {
      for (let x = c.x0; x <= c.x1; x++) {
        const p = y * L + x;
        if (!encre[p]) continue;
        const i = p * 4;
        if (luminance(px, i) >= seuil) continue;
        somme += chroma(px, i);
        n++;
      }
    }
    return n >= 3 ? somme / n : null;
  };
  if (passe.nom === "teinte") return true;
  const m = moyenne(passe.coeurMax) ?? moyenne(passe.encreMax);
  return m !== null && m <= passe.chromaMax;
}

/**
 * Un caractère est posé sur un aplat (le fond, ou la case colorée d'un rang) :
 * l'anneau autour de sa boîte est presque uniforme. Un morceau sombre de
 * photo, lui, est entouré d'autres pixels de la photo.
 */
function surUnAplat({ L, H, px }: Pixels, c: Comp): boolean {
  const anneau: [number, number, number][] = [];
  for (let y = c.y0 - 3; y <= c.y1 + 3; y++) {
    if (y < 0 || y >= H) continue;
    for (let x = c.x0 - 3; x <= c.x1 + 3; x++) {
      if (x < 0 || x >= L) continue;
      if (x >= c.x0 - 1 && x <= c.x1 + 1 && y >= c.y0 - 1 && y <= c.y1 + 1) continue;
      const i = (y * L + x) * 4;
      anneau.push([px[i], px[i + 1], px[i + 2]]);
    }
  }
  if (anneau.length < 8) return false;
  // L'encre voisine (lettres d'à côté, de n'importe quelle couleur) est
  // nettement plus sombre que l'aplat : on l'écarte avant de juger.
  const lum = (p: [number, number, number]) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  const repere = mediane(anneau.map(lum));
  const echantillon = anneau.filter((p) => lum(p) >= 0.75 * repere);
  if (echantillon.length < 8) return false;
  const m = [0, 1, 2].map((k) => mediane(echantillon.map((p) => p[k])));
  const proches = echantillon.filter((p) => Math.abs(p[0] - m[0]) + Math.abs(p[1] - m[1]) + Math.abs(p[2] - m[2]) <= 40).length;
  return proches / echantillon.length >= 0.8;
}

type LigneBrute = Comp & { lettres: Comp[] };

/** Lignes de texte d'une passe (noir ou gris). */
function lignesDeTexte(pix: Pixels, passe: Passe): LigneBrute[] {
  const { L, H, px } = pix;
  const encre = new Uint8Array(L * H);
  // L'encre est noire ou grise : sombre ET peu colorée. Une case rouge (aussi
  // sombre que du texte) n'en est pas, et ses lettres noires s'en détachent.
  // Passe « teinte » : sur une case colorée unie, tout ce qui est nettement
  // plus sombre que la case.
  if (passe.nom === "teinte") {
    const C = 16;
    const GL = Math.ceil(L / C);
    const GH = Math.ceil(H / C);
    // Couleur de chaque case de 16 px (médiane), et si elle est colorée.
    const caseRgb = new Float32Array(GL * GH * 3);
    const caseCouleur = new Uint8Array(GL * GH);
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GL; gx++) {
        const canaux: number[][] = [[], [], []];
        const chromas: number[] = [];
        for (let y = gy * C; y < Math.min(H, gy * C + C); y += 2) {
          for (let x = gx * C; x < Math.min(L, gx * C + C); x += 2) {
            const i = (y * L + x) * 4;
            for (let k = 0; k < 3; k++) canaux[k].push(px[i + k]);
            chromas.push(chroma(px, i));
          }
        }
        for (let k = 0; k < 3; k++) caseRgb[(gy * GL + gx) * 3 + k] = mediane(canaux[k]);
        caseCouleur[gy * GL + gx] = mediane(chromas) >= 60 ? 1 : 0;
      }
    }
    // Encre teintée : plus sombre que sa case, et nettement d'une autre
    // couleur (rouge foncé sur rouge vif : peu d'écart de luminance).
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < L; x++) {
        const k = Math.floor(y / C) * GL + Math.floor(x / C);
        if (!caseCouleur[k]) continue;
        const i = (y * L + x) * 4;
        const [cr, cg, cb] = [caseRgb[k * 3], caseRgb[k * 3 + 1], caseRgb[k * 3 + 2]];
        const ecart = Math.abs(px[i] - cr) + Math.abs(px[i + 1] - cg) + Math.abs(px[i + 2] - cb);
        if (luminance(px, i) < 0.299 * cr + 0.587 * cg + 0.114 * cb - 12 && ecart > 60) encre[y * L + x] = 1;
      }
    }
  } else {
    const chromaEncre = passe.nom === "noir" ? 60 : passe.chromaMax + 10;
    for (let p = 0, i = 0; p < L * H; p++, i += 4) {
      if (luminance(px, i) < passe.encreMax && chroma(px, i) <= chromaEncre) encre[p] = 1;
    }
  }
  const cars = composantes(encre, L, H).filter((c) => formeDeCaractere(c) && neutre(pix, c, encre, passe));
  const sur = cars.map((c) => surUnAplat(pix, c));

  // Mots, en trois passes.
  //  1. Lettres sûres voisines, de hauteurs proches.
  //  2. Signes (point du « i », accent, point, virgule, apostrophe) : un
  //     petit caractère ne se rattache qu'à un mot d'au moins deux lettres, ou
  //     à une lettre de taille courante. Jamais à un pictogramme seul : un
  //     morceau de photo de la taille d'une lettre de titre l'avalerait.
  //  3. Lettres incertaines (collées à une image) : elles complètent un mot
  //     voisin à leur hauteur, sans jamais en créer.
  const lettresVoisines = (A: Comp, B: Comp): boolean => {
    const ecart = B.x0 - A.x1;
    const hMax = Math.max(hauteur(A), hauteur(B));
    const hMin = Math.min(hauteur(A), hauteur(B));
    if (ecart > 0.3 * hMax + 1 || hMax > 2.4 * hMin) return false;
    const recouvre = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) + 1;
    return recouvre >= 0.45 * hMin;
  };
  /**
   * `petit` est-il un signe de la lettre `grand` (au-dessus, ou juste à côté) ?
   * Jamais dessous : une légende sous un pictogramme s'y collerait. Le point
   * d'un « ? » reste seul ; le rendu efface l'encre isolée autour d'un bloc.
   */
  const signeDe = (grand: Comp, petit: Comp): boolean => {
    const hG = hauteur(grand);
    if (hauteur(petit) > 0.42 * hG || largeur(petit) > 0.6 * hG || petit.n > 0.04 * hG * hG + 12) return false;
    const ecart = petit.x0 >= grand.x0 ? petit.x0 - grand.x1 : grand.x0 - petit.x1;
    const dansColonne = petit.x0 >= grand.x0 - 3 && petit.x1 <= grand.x1 + 3;
    // Les sources sont en anglais : pas d'accents, seulement le point d'un « i »
    // ou d'un « j », petit et rond, sur un trait mince. Un morceau de verre
    // posé au-dessus d'une légende n'en est pas un.
    const rond = largeur(petit) <= 1.8 * hauteur(petit) && hauteur(petit) <= 1.8 * largeur(petit);
    const accent = dansColonne && rond && largeur(grand) <= 0.4 * hG && petit.y1 <= grand.y0 + 0.1 * hG && grand.y0 - petit.y1 <= 0.35 * hG;
    const ponctuation = ecart >= -2 && ecart <= 0.3 * hG && (
      (petit.y0 >= grand.y0 + 0.5 * hG && petit.y1 <= grand.y1 + 0.4 * hG) || // point, virgule
      (petit.y0 >= grand.y0 - 0.15 * hG && petit.y1 <= grand.y0 + 0.5 * hG) // apostrophe, guillemet
    );
    return accent || ponctuation;
  };
  const ordre = [...cars.keys()].sort((a, b) => cars[a].x0 - cars[b].x0);
  const u = new Union(cars.length);
  const hRef = cars.map(hauteur);
  const hBas = cars.map(hauteur);
  const taille = cars.map(() => 1);
  const unir = (i: number, j: number) => {
    const ri = u.trouver(i);
    const rj = u.trouver(j);
    if (ri === rj) return;
    const h = Math.max(hRef[ri], hRef[rj]);
    const b = Math.min(hBas[ri], hBas[rj]);
    const n = taille[ri] + taille[rj];
    u.unir(i, j);
    hRef[u.trouver(i)] = h;
    hBas[u.trouver(i)] = b;
    taille[u.trouver(i)] = n;
  };
  /**
   * Les lettres d'un mot ont des hauteurs proches (x, ascendantes, jambages) :
   * jamais plus de 2,4 fois d'écart entre la plus petite et la plus grande.
   * Sans ça, une chaîne 20 → 40 → 80 px soude une légende à un pictogramme.
   */
  const compatibles = (i: number, j: number) => {
    const ri = u.trouver(i);
    const rj = u.trouver(j);
    return Math.max(hRef[ri], hRef[rj]) <= 2.4 * Math.min(hBas[ri], hBas[rj]);
  };
  const sures = ordre.filter((i) => sur[i]);
  for (let a = 0; a < sures.length; a++) {
    for (let b = a + 1; b < sures.length; b++) {
      const A = cars[sures[a]];
      const B = cars[sures[b]];
      if (B.x0 - A.x1 > 60) break;
      if (lettresVoisines(A, B) && compatibles(sures[a], sures[b])) unir(sures[a], sures[b]);
    }
  }
  // Un mot ne reçoit des signes que si ses lettres ont une taille de légende ou
  // de titre de tableau (≤ 70 px) : une silhouette faite de deux morceaux
  // avalerait la légende collée sous elle comme une « virgule ». Les points
  // d'un titre de couverture restent seuls : le rendu efface l'encre isolée.
  const peutRecevoir = (j: number) => {
    const r = u.trouver(j);
    return (taille[r] >= 2 && hRef[r] <= 70) || hauteur(cars[j]) <= 40;
  };
  for (const i of sures) {
    if (taille[u.trouver(i)] > 1) continue;
    const P = cars[i];
    for (const j of sures) {
      if (j === i || u.trouver(j) === u.trouver(i)) continue;
      const G = cars[j];
      if (Math.abs(G.x0 - P.x0) > 120) continue;
      if (peutRecevoir(j) && signeDe(G, P)) {
        unir(i, j);
        break;
      }
    }
  }
  const pris = new Set(sures);
  for (let passeLettres = 0; passeLettres < 6; passeLettres++) {
    let change = false;
    for (const i of ordre) {
      if (pris.has(i)) continue;
      const C = cars[i];
      for (const j of pris) {
        const J = cars[j];
        if (Math.abs(J.x0 - C.x0) > 160) continue;
        const r = u.trouver(j);
        if (taille[r] < 2 && hauteur(J) > 40) continue; // pas un pictogramme seul
        const [A, B] = J.x0 <= C.x0 ? [J, C] : [C, J];
        if ((lettresVoisines(A, B) && compatibles(i, j)) || (peutRecevoir(j) && signeDe(J, C))) {
          unir(i, j);
          pris.add(i);
          change = true;
          break;
        }
      }
    }
    if (!change) break;
  }
  type Mot = { b: Comp; lettres: Comp[]; hRef: number };
  const parRacine = new Map<number, number[]>();
  for (const i of pris) {
    const r = u.trouver(i);
    parRacine.set(r, [...(parRacine.get(r) ?? []), i]);
  }
  const mots: Mot[] = [...parRacine.entries()].map(([r, ids]) => ({
    b: boiteDe(ids.map((i) => cars[i])),
    lettres: ids.map((i) => cars[i]),
    hRef: hRef[r],
  }));

  // Lignes : mots voisins à la même hauteur. Une espace fait ~0,3 fois la
  // hauteur des lettres ; deux légendes de cases voisines sont plus loin.
  const ordreMots = [...mots.keys()].sort((a, b) => mots[a].b.x0 - mots[b].b.x0);
  const um = new Union(mots.length);
  // Comme pour les lettres : pas de chaîne de mots de tailles qui dérivent.
  const hMaxLigne = mots.map((m) => m.hRef);
  const hMinLigne = mots.map((m) => m.hRef);
  for (let a = 0; a < ordreMots.length; a++) {
    const A = mots[ordreMots[a]];
    for (let b = a + 1; b < ordreMots.length; b++) {
      const B = mots[ordreMots[b]];
      const ecart = B.b.x0 - A.b.x1;
      if (ecart > 100) break;
      if (ecart > 0.62 * Math.max(A.hRef, B.hRef)) continue;
      const ra = um.trouver(ordreMots[a]);
      const rb = um.trouver(ordreMots[b]);
      const hMax = Math.max(hMaxLigne[ra], hMaxLigne[rb]);
      const hMin = Math.min(hMinLigne[ra], hMinLigne[rb]);
      if (hMax > 2.2 * hMin) continue;
      const recouvre = Math.min(A.b.y1, B.b.y1) - Math.max(A.b.y0, B.b.y0) + 1;
      if (recouvre >= 0.5 * Math.min(hauteur(A.b), hauteur(B.b))) {
        um.unir(ordreMots[a], ordreMots[b]);
        const r = um.trouver(ordreMots[a]);
        hMaxLigne[r] = hMax;
        hMinLigne[r] = hMin;
      }
    }
  }
  const lignes = new Map<number, Mot[]>();
  mots.forEach((m, i) => {
    const r = um.trouver(i);
    lignes.set(r, [...(lignes.get(r) ?? []), m]);
  });
  return [...lignes.values()]
    .map((ms) => ({ ...boiteDe(ms.map((m) => m.b)), lettres: ms.flatMap((m) => m.lettres) }))
    .flatMap(extraireLegende)
    .filter((l) => hauteur(l) <= HAUTEUR_LETTRE_MAX + 20 && (l.lettres.length >= 2 || (hauteur(l) >= 14 && hauteur(l) <= HAUTEUR_LETTRE_MAX)));
}

/**
 * Une ligne qui mêle un pictogramme et une légende collée dessous (« toxic »
 * sous deux silhouettes) : les petites lettres posées sur une même ligne de
 * base, côte à côte, en sortent comme une ligne à part.
 */
function extraireLegende(l: LigneBrute): LigneBrute[] {
  const petites = l.lettres.filter((c) => hauteur(c) <= 0.45 * hauteur(l));
  if (petites.length < 3 || petites.length === l.lettres.length) return [l];
  const base = mediane(petites.map((c) => c.y1));
  const hType = mediane(petites.map(hauteur));
  const surBase = petites.filter((c) => Math.abs(c.y1 - base) <= Math.max(3, 0.25 * hType) || (c.y1 > base && c.y1 - base <= 0.5 * hType));
  if (surBase.length < 3) return [l];
  surBase.sort((a, b) => a.x0 - b.x0);
  // Côte à côte : pas de trou plus grand qu'une espace.
  for (let k = 1; k < surBase.length; k++) if (surBase[k].x0 - surBase[k - 1].x1 > 0.8 * hType + 2) return [l];
  const legende = new Set(surBase);
  const reste = l.lettres.filter((c) => !legende.has(c));
  return [
    { ...boiteDe(reste), lettres: reste },
    { ...boiteDe(surBase), lettres: surBase },
  ];
}

/**
 * Une vraie ligne de texte : au moins trois caractères dont la plupart posent
 * sur la même ligne de base (hors jambages et signes).
 */
function estTexte(l: LigneBrute): boolean {
  const grandes = l.lettres.filter((c) => hauteur(c) >= 0.45 * hauteur(l));
  if (grandes.length < 3) return false;
  const base = mediane(grandes.map((c) => c.y1));
  const tolerance = Math.max(3, 0.08 * hauteur(l));
  return grandes.filter((c) => Math.abs(c.y1 - base) <= tolerance).length >= 0.6 * grandes.length;
}

export async function analyserSlide(chemin: string): Promise<GeometrieSlide> {
  const pix = await lirePixels(chemin);
  const { L, H, px } = pix;
  const fond = couleurFond(pix);

  // Lignes noires, puis grises qui ne recouvrent aucune ligne noire.
  const lignes: (LigneBrute & { passe: Passe })[] = [];
  for (const passe of PASSES) {
    const noires = [...lignes];
    for (const l of lignesDeTexte(pix, passe)) {
      // Une ligne grise qui double une ligne noire (bord anticrénelé) est
      // écartée ; un filigrane qui la frôle (@mentalapp sur « Dopamine ») reste.
      const recouvre = noires.some((m) => {
        const l2 = Math.min(m.x1, l.x1) - Math.max(m.x0, l.x0);
        const h2 = Math.min(m.y1, l.y1) - Math.max(m.y0, l.y0);
        return l2 > 0 && h2 > 0 && l2 * h2 >= 0.5 * largeur(l) * hauteur(l);
      });
      if (!recouvre) lignes.push({ ...l, passe });
    }
  }

  // Blocs : lignes empilées, alignées (centre ou gauche), de tailles proches.
  lignes.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const ub = new Union(lignes.length);
  for (let a = 0; a < lignes.length; a++) {
    for (let b = a + 1; b < lignes.length; b++) {
      const A = lignes[a];
      const B = lignes[b];
      if (A.passe !== B.passe || estTexte(A) !== estTexte(B)) continue;
      const hA = hauteur(A);
      const hB = hauteur(B);
      const ecart = B.y0 - A.y1;
      if (ecart > 0.75 * Math.max(hA, hB) || ecart < -0.5 * Math.min(hA, hB)) continue;
      if (Math.max(hA, hB) > 1.9 * Math.min(hA, hB)) continue;
      const lMax = Math.max(largeur(A), largeur(B));
      const centre = Math.abs((A.x0 + A.x1) / 2 - (B.x0 + B.x1) / 2) <= Math.max(14, 0.18 * lMax);
      const gauche = Math.abs(A.x0 - B.x0) <= 10;
      const recouvreX = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > 0;
      if ((centre || gauche) && recouvreX) ub.unir(a, b);
    }
  }
  const groupes = new Map<number, (LigneBrute & { passe: Passe })[]>();
  lignes.forEach((l, i) => {
    const r = ub.trouver(i);
    groupes.set(r, [...(groupes.get(r) ?? []), l]);
  });

  // Masque du texte (pour l'espace libre et les images).
  const masqueTexte = new Uint8Array(L * H);
  for (const ls of groupes.values()) {
    const b = boiteDe(ls);
    for (let y = Math.max(0, b.y0 - 2); y <= Math.min(H - 1, b.y1 + 2); y++) {
      for (let x = Math.max(0, b.x0 - 2); x <= Math.min(L - 1, b.x1 + 2); x++) masqueTexte[y * L + x] = 1;
    }
  }

  const blocs: BlocGeo[] = [...groupes.values()]
    .map((ls) => ls.sort((a, b) => a.y0 - b.y0))
    .sort((a, b) => boiteDe(a).y0 - boiteDe(b).y0 || boiteDe(a).x0 - boiteDe(b).x0)
    .map((ls, k) => {
      const b = boiteDe(ls);
      const centres = ls.map((l) => (l.x0 + l.x1) / 2);
      const etendue = (v: number[]) => Math.max(...v) - Math.min(...v);
      const alignement: BlocGeo["alignement"] =
        ls.length < 2
          ? "centre"
          : etendue(ls.map((l) => l.x0)) <= 6 && etendue(centres) > 8
            ? "gauche"
            : etendue(ls.map((l) => l.x1)) <= 6 && etendue(centres) > 8
              ? "droite"
              : "centre";
      // Couleur du texte : médiane de l'encre de ses lettres (pour un texte
      // teinté : ce qui est nettement plus sombre que sa case).
      const passe = ls[0].passe;
      const fondBloc = fondAutour(pix, enBoite(b));
      const seuilEncre = passe.nom === "teinte" ? 0.62 * (0.299 * fondBloc[0] + 0.587 * fondBloc[1] + 0.114 * fondBloc[2]) : passe.coeurMax;
      const r: number[] = [];
      const g: number[] = [];
      const bl: number[] = [];
      for (const c of ls.flatMap((l) => l.lettres)) {
        for (let y = c.y0; y <= c.y1; y++) {
          for (let x = c.x0; x <= c.x1; x++) {
            const i = (y * L + x) * 4;
            if (luminance(px, i) < seuilEncre) {
              r.push(px[i]);
              g.push(px[i + 1]);
              bl.push(px[i + 2]);
            }
          }
        }
      }
      const boite = enBoite(b);
      return {
        id: `t${k + 1}`,
        boite,
        lignes: ls.map(enBoite),
        alignement,
        couleur: hex(mediane(r), mediane(g), mediane(bl)),
        fond: hex(...fondBloc),
        libre: espaceLibre(pix, fondBloc, boite, masqueTexte),
        probable: ls.every(estTexte) ? ("texte" as const) : ("autre" as const),
      };
    });

  // Images : zones hors fond et hors texte, sur une grille de 6 px.
  const C = 6;
  const GL = Math.ceil(L / C);
  const GH = Math.ceil(H / C);
  const grille = new Uint8Array(GL * GH);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < L; x++) {
      const p = y * L + x;
      if (masqueTexte[p]) continue;
      const i = p * 4;
      const d = Math.abs(px[i] - fond[0]) + Math.abs(px[i + 1] - fond[1]) + Math.abs(px[i + 2] - fond[2]);
      if (d > SEUIL_FOND) grille[Math.floor(y / C) * GL + Math.floor(x / C)]++;
    }
  }
  const pleine = new Uint8Array(GL * GH);
  for (let k = 0; k < GL * GH; k++) if (grille[k] >= 6) pleine[k] = 1;
  const images = composantes(pleine, GL, GH)
    .filter((c) => c.n >= 8)
    .map((c) => ({ x0: c.x0 * C, y0: c.y0 * C, x1: Math.min(L - 1, c.x1 * C + C - 1), y1: Math.min(H - 1, c.y1 * C + C - 1), n: c.n }))
    .filter((c) => largeur(c) < L - 20 || hauteur(c) < H - 20);

  return {
    largeur: L,
    hauteur: H,
    fond: hex(...fond),
    blocs,
    images: images.map((c, k) => ({ id: `i${k + 1}`, boite: enBoite(c) })),
  };
}

/**
 * Jusqu'où un texte peut s'élargir sur ses lignes sans toucher autre chose :
 * on part des bords du bloc et on avance tant que la bande reste du fond.
 */
function espaceLibre({ L, px }: Pixels, fond: [number, number, number], [x, y, l, h]: Boite, masqueTexte: Uint8Array): [number, number] {
  // Le cœur des lignes seulement : le bord d'une photo posée juste au-dessus
  // d'une légende ne doit pas la bloquer.
  const yHaut = Math.round(y + 0.2 * h);
  const yBas = Math.round(y + 0.8 * h);
  const obstacle = (xx: number) => {
    for (let yy = yHaut; yy <= yBas; yy++) {
      const p = yy * L + xx;
      if (masqueTexte[p]) return true;
      const i = p * 4;
      if (Math.abs(px[i] - fond[0]) + Math.abs(px[i + 1] - fond[1]) + Math.abs(px[i + 2] - fond[2]) > SEUIL_FOND) return true;
    }
    return false;
  };
  // On part un peu à l'écart du bloc : son propre anticrénelage n'arrête rien.
  // Contre un autre texte, on va jusqu'à lui : le rendu règle ensuite les
  // collisions entre traductions voisines.
  let gauche = x - 5;
  while (gauche > 0 && !obstacle(gauche)) gauche--;
  let droite = x + l + 4;
  while (droite < L - 1 && !obstacle(droite)) droite++;
  return [Math.min(gauche + 6, x), Math.max(droite - 6, x + l)];
}
