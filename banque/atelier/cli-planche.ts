// Usage : node atelier/cli-planche.ts [--requete "mots"] [--n 2] [--par 40] [--refaire 3]
//
// Planches des candidates à TRIER À L'ŒIL : sortie/planches/<numéro>.jpg, 40
// images par planche, chacune montrée comme elle sera versée (recadrage 9:16
// centré) avec les 6 premiers caractères de son empreinte et sa taille. Une
// étiquette rouge signale une description qui sent la pub ou la marque.
//   --requete "mots"  seulement les candidates d'une recherche qui contient chacun de
//                     ces mots (mots entiers : « men » ne prend pas « women ») ;
//                     plusieurs recherches se séparent par | : "men|man|male"
//   --n N             nombre de planches à sortir (1 par défaut)
//   --refaire N       redessine la planche N (mêmes images)
//
// Une candidate posée sur une planche n'est plus reproposée : la planche se
// règle d'un coup avec npm run verser -- --planche <numéro> (les images gardées
// entrent en banque, les autres sont écartées). Les images déjà en banque sont
// retirées avant (il faut BANQUE_JETON ; sans lui, on ne le sait pas).
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import { PLANCHES, STOCK, dejaEnBanque, ecrire, lire, lireStock } from "./api.ts";
import { type Candidat, zone } from "./pinterest.ts";

const ICI = dirname(fileURLToPath(import.meta.url));
GlobalFonts.registerFromPath(join(ICI, "..", "..", "pods", "page-blanche", "polices", "Inter-Medium.ttf"), "Inter Medium");

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const par = Math.min(Math.max(Number(opt("--par") ?? 40) || 40, 8), 64);
const combien = Math.min(Math.max(Number(opt("--n") ?? 1) || 1, 1), 10);
const mots = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const filtres = (opt("--requete") ?? "").split("|").map(mots).filter((m) => m.length);
const garde = (c: Candidat) => !filtres.length || c.requetes.some((r) => filtres.some((f) => f.every((m) => mots(r).includes(m))));
const refaire = opt("--refaire");

const COLONNES = 8;
const L = 250;
const H = Math.round((L * 16) / 9);
const BANDE = 22;
const CACHE = "donnees/cache";

async function vignette(c: Candidat): Promise<Buffer> {
  mkdirSync(CACHE, { recursive: true });
  const chemin = join(CACHE, `${c.ref}.jpg`);
  if (existsSync(chemin)) return readFileSync(chemin);
  const url = c.vignette.replace("/236x/", "/474x/");
  let derniere: unknown;
  for (let essai = 0; essai < 2; essai++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const octets = Buffer.from(await r.arrayBuffer());
      writeFileSync(chemin, octets);
      return octets;
    } catch (e) {
      derniere = e;
    }
  }
  throw derniere;
}

async function dessiner(numero: number, candidates: Candidat[]): Promise<string> {
  const rangs = Math.ceil(candidates.length / COLONNES);
  const c = createCanvas(COLONNES * (L + 6) - 6, rangs * (H + BANDE + 6) - 6);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, c.width, c.height);
  const octets = await Promise.all(candidates.map((k) => vignette(k).catch(() => null)));
  for (const [i, k] of candidates.entries()) {
    const x = (i % COLONNES) * (L + 6);
    const y = Math.floor(i / COLONNES) * (H + BANDE + 6);
    const o = octets[i];
    if (o) {
      const im = await loadImage(o);
      const z = zone(im.width, im.height);
      ctx.drawImage(im, z.x, z.y, z.l, z.h, x, y, L, H);
    } else {
      ctx.fillStyle = "#500";
      ctx.fillRect(x, y, L, H);
    }
    ctx.fillStyle = k.alerte ? "#b00020" : "#000";
    ctx.fillRect(x, y + H, L, BANDE);
    ctx.fillStyle = k.alerte ? "#fff" : "#ffd84d";
    ctx.font = '15px "Inter Medium"';
    ctx.textBaseline = "middle";
    ctx.fillText(`${k.ref.slice(0, 6)}  ${k.largeur}×${k.hauteur}${k.alerte ? `  ⚠ ${k.alerte}` : ""}`.slice(0, 34), x + 5, y + H + BANDE / 2);
  }
  const sortie = `sortie/planches/${numero}.jpg`;
  mkdirSync(dirname(sortie), { recursive: true });
  writeFileSync(sortie, await c.encode("jpeg", 84));
  return sortie;
}

const stock = lireStock();
const planches = lire<Record<string, { le: string; refs: string[] }>>(PLANCHES, {});

if (refaire) {
  const p = planches[refaire];
  if (!p) throw new Error(`planche ${refaire} inconnue`);
  console.log(await dessiner(Number(refaire), p.refs.map((r) => stock[r]).filter(Boolean)));
} else {
  const surPlanche = new Set(Object.values(planches).flatMap((p) => p.refs));
  let libres = Object.values(stock).filter((c) => !c.decision && !surPlanche.has(c.ref));
  libres = libres.filter(garde);
  libres = libres.slice(0, par * combien);
  const connues = await dejaEnBanque(libres.map((c) => c.ref));
  for (const c of libres) {
    if (connues.has(c.ref)) {
      c.decision = "versee";
      c.motif = "déjà en banque";
    }
  }
  libres = libres.filter((c) => !c.decision);
  if (!libres.length) console.log("Rien à trier : lance une recherche (npm run chercher).");
  let numero = Math.max(0, ...Object.keys(planches).map(Number));
  for (let i = 0; i < libres.length; i += par) {
    const tranche = libres.slice(i, i + par);
    numero += 1;
    planches[numero] = { le: new Date().toISOString(), refs: tranche.map((c) => c.ref) };
    console.log(`\nPlanche ${numero} : ${await dessiner(numero, tranche)} (${tranche.length} images)`);
    for (const c of tranche) {
      console.log(`  ${c.ref.slice(0, 6)} · ${c.largeur}×${c.hauteur}${c.alerte ? ` · ⚠ ${c.alerte}` : ""}${c.domaine ? ` · ${c.domaine}` : ""}${c.description ? ` · ${c.description.slice(0, 90)}` : ""}`);
    }
  }
  ecrire(STOCK, stock);
  ecrire(PLANCHES, planches);
  if (connues.size) console.log(`\n${connues.size} image(s) déjà en banque, retirées du tri.`);
}
