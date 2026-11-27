// Usage :
//   npm run compte -- <slide.jpg> <nom> --encre blanc|noir --zone x0,y0,x1,y1 [--zone …] --post <url> --slide <n> [--seuil 45]
//
// Reprend une image de son compte (demande d'Adrien du 27/11 : « reprendre le
// compte », sans IA) : sa slide de 1440 × 1440 (donnees/cache/tt_<post>_<n>.jpg,
// écrite par `npm run veille`), dont on garde la carte (sans le cadre noir ni
// les coins) et dont on EFFACE son texte, sans aucun modèle d'IA :
// - dans chaque `--zone` (repère 1440, autour de ses lignes, avec 10 px de
//   marge), les pixels de son encre (`--encre` : la couleur de SON texte) sont
//   repérés par rapport au fond de la zone (plus clairs ou plus sombres de
//   `--seuil`), puis élargis de 3 px pour prendre l'anticrénelage ;
// - ces pixels sont remplis par COPIE DE TEXTURE, carreau par carreau (64 px) :
//   chaque carreau reprend la même forme prise un peu plus haut, plus bas ou
//   à côté, là où la photo est intacte (le décalage dont le bord colle le
//   mieux), avec sa luminosité recalée sur le bord ; les coins et les
//   carreaux sans décalage possible, par diffusion depuis les voisins
//   (`--lisse <écart-type>` diffuse aussi les carreaux dont le bord varie
//   moins que ça : à essayer seulement si la copie laisse des carrés).
// - Les raccords restent visibles sur un ciel à nuages fins : pose ta phrase
//   par-dessus la zone effacée (elle y était), ou prends une autre image.
// Sort images/compte/<nom>.jpg (la carte, 1043 px, sans métadonnées), l'aperçu
// sortie/compte/<nom>.jpg (avant · masque · après) À REGARDER avec Read, et
// note la provenance dans images/compte/index.json : recopie-la dans `compte`
// du post (chemin → url du post et numéro de slide).
// Jamais une célébrité, un personnage (Spider-Man, Deadpool, Pokémon…), une
// marque lisible ni un visage mis en avant : il en poste beaucoup, on ne les
// reprend pas. Un reste de lettre visible : agrandis la zone ou baisse
// `--seuil`, et relance.

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";
import { RACINE } from "./slides.ts";

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const [source, nom] = args;
const encre = opt("--encre");
const post = opt("--post");
const slide = Number(opt("--slide"));
const seuil = Number(opt("--seuil") ?? 45);
const zones = args.flatMap((a, i) => (a === "--zone" ? [args[i + 1].split(",").map(Number)] : []));
if (!source || !nom || !/^[a-z0-9-]{2,50}$/.test(nom) || (encre !== "blanc" && encre !== "noir") || !post || !slide) {
  throw new Error("usage : npm run compte -- <slide.jpg> <nom> --encre blanc|noir --zone x0,y0,x1,y1 [--zone …] --post <url> --slide <n> [--seuil 45]");
}
if (!/^https:\/\/www\.tiktok\.com\/@ssazem\/(photo|video)\/\d+$/.test(post)) throw new Error("--post : l'url de son post (https://www.tiktok.com/@ssazem/photo/<id>)");
if (!zones.length || zones.some((z) => z.length !== 4 || z.some((v) => !Number.isFinite(v)))) throw new Error("--zone x0,y0,x1,y1 (repère 1440) : au moins une");

const img = await loadImage(readFileSync(source));
if (img.width !== 1440 || img.height !== 1440) throw new Error(`${source} : ${img.width} × ${img.height}, une de ses slides fait 1440 × 1440`);

// Sa carte : de (24, 25) à (1415, 1414), rayon 34.
const C = { x: 24, y: 25, l: 1391, h: 1389, r: 34 };
const c = createCanvas(C.l, C.h);
const ctx = c.getContext("2d");
ctx.drawImage(img, C.x, C.y, C.l, C.h, 0, 0, C.l, C.h);
const d = ctx.getImageData(0, 0, C.l, C.h);
const px = d.data;
const W = C.l;
const Hh = C.h;
const lum = (i: number) => 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];

// Le masque : son encre dans les zones, et les coins hors de sa carte arrondie.
const masque = new Uint8Array(W * Hh);
for (const [x0, y0, x1, y1] of zones) {
  const ax = Math.max(0, Math.round(x0 - C.x));
  const ay = Math.max(0, Math.round(y0 - C.y));
  const bx = Math.min(W, Math.round(x1 - C.x));
  const by = Math.min(Hh, Math.round(y1 - C.y));
  if (bx - ax < 10 || by - ay < 10) throw new Error(`zone ${[x0, y0, x1, y1].join(",")} : vide`);
  const ls: number[] = [];
  for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) ls.push(lum(y * W + x));
  ls.sort((a, b) => a - b);
  // Le fond : la médiane de la zone (le texte n'en couvre qu'une petite part).
  const fond = ls[Math.floor(ls.length / 2)];
  for (let y = ay; y < by; y++)
    for (let x = ax; x < bx; x++) {
      const v = lum(y * W + x);
      if (encre === "blanc" ? v > Math.min(fond + seuil, 238) : v < Math.max(fond - seuil, 50)) masque[y * W + x] = 1;
    }
}
// Élargi de 4 px (l'anticrénelage et le halo des lettres).
let elargi = masque;
for (let k = 0; k < 4; k++) {
  const e = new Uint8Array(elargi);
  for (let y = 1; y < Hh - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (elargi[i]) e[i - 1] = e[i + 1] = e[i - W] = e[i + W] = 1;
    }
  elargi = e;
}
// Les coins : hors de l'arc de rayon 34 (et 4 px de sécurité), on remplit aussi.
const R = C.r + 4;
for (let y = 0; y < R; y++)
  for (let x = 0; x < R; x++) {
    if (Math.hypot(R - x, R - y) <= R - 2) continue;
    for (const [cx, cy] of [[x, y], [W - 1 - x, y], [x, Hh - 1 - y], [W - 1 - x, Hh - 1 - y]]) elargi[cy * W + cx] = 1;
  }
const avant = createCanvas(W, Hh);
avant.getContext("2d").putImageData(d, 0, 0);
const part = elargi.reduce((s, v) => s + v, 0) / (W * Hh);

// Copie de texture, carreau par carreau.
const T = 64;
const ANNEAU = 6;
const LISSE = Number(opt("--lisse") ?? 0);
const decalages: [number, number][] = [];
for (let v = 24; v <= 420; v += 6) for (const dx of [0, -30, 30, -60, 60]) (decalages.push([dx, -v]), decalages.push([dx, v]));
for (let v = 24; v <= 300; v += 6) (decalages.push([-v, 0]), decalages.push([v, 0]));
const inconnu = new Uint8Array(elargi);
const src = new Uint8ClampedArray(px);
let copies = 0;
let diffuses = 0;
for (let ty = 0; ty < Hh; ty += T)
  for (let tx = 0; tx < W; tx += T) {
    const trous: number[] = [];
    for (let y = ty; y < Math.min(Hh, ty + T); y++) for (let x = tx; x < Math.min(W, tx + T); x++) if (elargi[y * W + x]) trous.push(x, y);
    if (!trous.length) continue;
    // Le bord : les pixels intacts autour du carreau (ANNEAU px).
    const bord: number[] = [];
    for (let y = Math.max(0, ty - ANNEAU); y < Math.min(Hh, ty + T + ANNEAU); y++)
      for (let x = Math.max(0, tx - ANNEAU); x < Math.min(W, tx + T + ANNEAU); x++) if (!elargi[y * W + x]) bord.push(x, y);
    if (bord.length < 40) continue;
    // Un fond lisse (écart-type du bord sous LISSE) : la diffusion, plus bas.
    let m0 = 0, m2 = 0;
    for (let k = 0; k < bord.length; k += 2) {
      const i = bord[k + 1] * W + bord[k];
      const v = 0.2126 * src[i * 4] + 0.7152 * src[i * 4 + 1] + 0.0722 * src[i * 4 + 2];
      m0 += v; m2 += v * v;
    }
    const n2 = bord.length / 2;
    if (Math.sqrt(Math.max(0, m2 / n2 - (m0 / n2) ** 2)) < LISSE) continue;
    let meilleur: { dx: number; dy: number; score: number } | null = null;
    for (const [dx, dy] of decalages) {
      let ok = true;
      for (let k = 0; k < trous.length; k += 2) {
        const X = trous[k] + dx, Y = trous[k + 1] + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= Hh || elargi[Y * W + X]) { ok = false; break; }
      }
      if (!ok) continue;
      let e = 0, n = 0;
      for (let k = 0; k < bord.length; k += 2) {
        const X = bord[k] + dx, Y = bord[k + 1] + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= Hh || elargi[Y * W + X]) continue;
        const i = bord[k + 1] * W + bord[k], j = Y * W + X;
        e += Math.abs(src[i * 4] - src[j * 4]) + Math.abs(src[i * 4 + 1] - src[j * 4 + 1]) + Math.abs(src[i * 4 + 2] - src[j * 4 + 2]);
        n++;
      }
      if (n < bord.length / 4) continue;
      const score = e / n + Math.hypot(dx, dy) * 0.01;
      if (!meilleur || score < meilleur.score) meilleur = { dx, dy, score };
    }
    if (!meilleur) continue;
    // La luminosité recalée : l'écart moyen du bord, par canal.
    const corr = [0, 0, 0];
    let n = 0;
    for (let k = 0; k < bord.length; k += 2) {
      const X = bord[k] + meilleur.dx, Y = bord[k + 1] + meilleur.dy;
      if (X < 0 || Y < 0 || X >= W || Y >= Hh || elargi[Y * W + X]) continue;
      const i = bord[k + 1] * W + bord[k], j = Y * W + X;
      for (let c = 0; c < 3; c++) corr[c] += src[i * 4 + c] - src[j * 4 + c];
      n++;
    }
    for (let k = 0; k < trous.length; k += 2) {
      const i = trous[k + 1] * W + trous[k], j = (trous[k + 1] + meilleur.dy) * W + trous[k] + meilleur.dx;
      for (let c = 0; c < 3; c++) px[i * 4 + c] = src[j * 4 + c] + corr[c] / n;
      inconnu[i] = 0;
    }
    copies++;
  }

// Le reste (coins, carreaux sans décalage possible) : diffusion, couche par couche,
// chaque pixel inconnu prend la moyenne de ses voisins connus (rayon 2).
let reste = inconnu.reduce((s, v) => s + v, 0);
const diffusePx = new Uint8Array(inconnu);
let tours = 0;
while (reste > 0 && tours < 400) {
  tours++;
  const couche: number[] = [];
  for (let y = 0; y < Hh; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!inconnu[i]) continue;
      let s0 = 0, s1 = 0, s2 = 0, n = 0;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= W || Y >= Hh) continue;
          const j = Y * W + X;
          if (inconnu[j]) continue;
          const p = 1 / (dx * dx + dy * dy || 1);
          s0 += px[j * 4] * p; s1 += px[j * 4 + 1] * p; s2 += px[j * 4 + 2] * p; n += p;
        }
      if (n > 0) couche.push(i, Math.round(s0 / n), Math.round(s1 / n), Math.round(s2 / n));
    }
  if (!couche.length) break;
  for (let k = 0; k < couche.length; k += 4) {
    const i = couche[k];
    px[i * 4] = couche[k + 1]; px[i * 4 + 1] = couche[k + 2]; px[i * 4 + 2] = couche[k + 3];
    inconnu[i] = 0;
    reste--;
    diffuses++;
  }
}
// Un grain comme le sien (écart-type ≈ 4) sur les pixels diffusés, sinon trop lisses.
let graine = 12345;
const alea = () => ((graine = (graine * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
for (let i = 0; i < W * Hh; i++) {
  if (!elargi[i] || !diffusePx[i]) continue;
  const g = (alea() + alea() + alea() - 1.5) * 8;
  for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.max(0, Math.min(255, px[i * 4 + c] + g));
}
ctx.putImageData(d, 0, 0);

// La carte gardée à la taille du rendu (1043 px de large).
const sortie = createCanvas(1043, Math.round((1043 * Hh) / W));
sortie.getContext("2d").drawImage(c, 0, 0, sortie.width, sortie.height);
mkdirSync(join(RACINE, "images", "compte"), { recursive: true });
const f = join("images", "compte", `${nom}.jpg`);
writeFileSync(join(RACINE, f), retirerMetadonnees(sortie.toBuffer("image/jpeg", 90)));

// L'aperçu : avant · masque · après.
const k = 0.4;
const ap = createCanvas(Math.round(W * k) * 3 + 16, Math.round(Hh * k));
const actx = ap.getContext("2d");
actx.fillStyle = "#111";
actx.fillRect(0, 0, ap.width, ap.height);
actx.drawImage(avant, 0, 0, W * k, Hh * k);
const m = createCanvas(W, Hh);
const mctx = m.getContext("2d");
mctx.drawImage(avant, 0, 0);
const md = mctx.getImageData(0, 0, W, Hh);
for (let i = 0; i < W * Hh; i++) if (elargi[i]) (md.data[i * 4] = 255), (md.data[i * 4 + 1] = 0), (md.data[i * 4 + 2] = 0);
mctx.putImageData(md, 0, 0);
actx.drawImage(m, W * k + 8, 0, W * k, Hh * k);
actx.drawImage(c, 2 * (W * k + 8), 0, W * k, Hh * k);
mkdirSync(join(RACINE, "sortie", "compte"), { recursive: true });
writeFileSync(join(RACINE, "sortie", "compte", `${nom}.jpg`), ap.toBuffer("image/jpeg", 85));

const fichier = join(RACINE, "images", "compte", "index.json");
const index = existsSync(fichier) ? (JSON.parse(readFileSync(fichier, "utf8")) as Record<string, unknown>) : {};
index[f] = { post, slide, encre_effacee: encre, zones };
writeFileSync(fichier, JSON.stringify(index, null, 1) + "\n");
console.log(`${f} ← ${post} slide ${slide} : ${(part * 100).toFixed(1)} % de la carte refait (${copies} carreaux copiés, ${diffuses} px diffusés) · aperçu sortie/compte/${nom}.jpg`);
if (reste > 0) console.warn(`  ${reste} pixels non remplis : agrandis le rayon ou réduis la zone`);
