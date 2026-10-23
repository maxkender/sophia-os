// La carte YouTube de ses slides (appli iOS : miniature arrondie, durée,
// avatar rond, titre sur deux lignes, chaîne · vues · date) et la recherche des
// VRAIES vidéos : page de résultats et page de la vidéo, sans clé d'API.
// Une carte ne montre jamais une vidéo inventée ni des chiffres arrondis à la
// main : `npm run youtube` les relève et les écrit au format de l'appli.

import { loadImage, type Image } from "@napi-rs/canvas";
import { type Ctx, COULEUR, imageRemplie, L, rectArrondi } from "./dessin.ts";
import { image } from "./planche.ts";
import { POLICE, POLICE_EMOJI } from "./polices.ts";

/** Une vidéo telle que la carte l'affiche, dans la langue de la slide. */
export type Video = {
  id: string;
  titre: string;
  chaine: string;
  /** « 3.4M views », « 381K views »… (format de l'appli, langue de la slide). */
  vues: string;
  /** « 8 years ago », « 2 weeks ago »… */
  date: string;
  /** « 10:50 », « 1:23:38 ». */
  duree: string;
  /** L'avatar de la chaîne (yt3.ggpht.com). */
  avatar: string;
};

/** Géométrie relevée sur ses slides (1 124 px de large, ramenés à 1 080). */
export const CARTE = {
  x: 21,
  l: L - 42,
  rayon: 18,
  /** Écart entre la miniature et la ligne avatar / titre. */
  ecart: 30,
  avatar: 104,
  /** Début du titre (après l'avatar) et largeur utile avant les trois points. */
  xTexte: 171,
  lTexte: 812,
  tailleTitre: 40,
  pasTitre: 53,
  tailleMeta: 35,
} as const;

/** Hauteur de la miniature (16:9). */
export const hauteurMiniature = Math.round((CARTE.l * 9) / 16);
/** Hauteur totale d'une carte : miniature, écart, deux lignes de titre et la ligne de méta. */
export const hauteurCarte = hauteurMiniature + CARTE.ecart + 2 * CARTE.pasTitre + 40;

/** La meilleure miniature disponible, et s'il faut couper ses bandes noires (4:3). */
async function miniature(id: string): Promise<{ img: Image; bandes: boolean }> {
  for (const [nom, bandes] of [
    ["maxresdefault", false],
    ["sddefault", true],
    ["hqdefault", true],
  ] as const) {
    try {
      return { img: await loadImage(await image(`yt_${id}_${nom}`, `https://i.ytimg.com/vi/${id}/${nom}.jpg`)), bandes };
    } catch {
      // miniature suivante
    }
  }
  throw new Error(`${id} : aucune miniature YouTube`);
}

/** Coupe un texte trop long avec « ... » comme l'appli. */
function couper(ctx: Ctx, t: string, largeur: number): string {
  if (ctx.measureText(t).width <= largeur) return t;
  let s = t;
  while (s.length > 1 && ctx.measureText(`${s.trimEnd()}...`).width > largeur) s = s.slice(0, -1);
  return `${s.trimEnd()}...`;
}

/** Le titre sur deux lignes au plus, la seconde coupée si besoin. */
function lignesTitre(ctx: Ctx, t: string, largeur: number): string[] {
  const mots = t.split(/\s+/);
  const lignes: string[] = [];
  let cur = "";
  for (const [i, m] of mots.entries()) {
    const essai = cur ? `${cur} ${m}` : m;
    if (ctx.measureText(essai).width <= largeur) cur = essai;
    else if (lignes.length === 0 && cur) {
      lignes.push(cur);
      cur = m;
    } else {
      lignes.push(couper(ctx, [cur, ...mots.slice(i)].join(" "), largeur));
      return lignes;
    }
  }
  if (cur) lignes.push(cur);
  return lignes;
}

/** Dessine la carte à partir de `y` (haut de la miniature) ; renvoie son bas. */
export async function carteYoutube(ctx: Ctx, v: Video, y: number): Promise<number> {
  const hm = hauteurMiniature;
  const { img, bandes } = await miniature(v.id);
  ctx.save();
  rectArrondi(ctx, CARTE.x, y, CARTE.l, hm, CARTE.rayon);
  ctx.clip();
  if (bandes) {
    const sh = (img.width * 9) / 16;
    ctx.drawImage(img, 0, (img.height - sh) / 2, img.width, sh, CARTE.x, y, CARTE.l, hm);
  } else imageRemplie(ctx, img, CARTE.x, y, CARTE.l, hm);
  ctx.restore();

  // La durée, en bas à droite de la miniature.
  ctx.save();
  ctx.font = `34px "${POLICE.youtube}"`;
  const lb = ctx.measureText(v.duree).width + 20;
  const hb = 46;
  const xb = CARTE.x + CARTE.l - 14 - lb;
  const yb = y + hm - 14 - hb;
  rectArrondi(ctx, xb, yb, lb, hb, 9);
  ctx.fillStyle = "rgba(0,0,0,0.78)";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(v.duree, xb + 10, yb + hb / 2 + 1);
  ctx.restore();

  // L'avatar rond de la chaîne.
  const ya = y + hm + CARTE.ecart;
  const av = await loadImage(await image(`yta_${v.id}`, v.avatar));
  ctx.save();
  ctx.beginPath();
  ctx.arc(CARTE.x + 11 + CARTE.avatar / 2, ya + CARTE.avatar / 2, CARTE.avatar / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(av, CARTE.x + 11, ya, CARTE.avatar, CARTE.avatar);
  ctx.restore();

  // Le titre (deux lignes au plus), puis chaîne · vues · date.
  ctx.save();
  ctx.font = `${CARTE.tailleTitre}px "${POLICE.youtube}"${POLICE_EMOJI}`;
  ctx.fillStyle = COULEUR.ytTitre;
  ctx.textBaseline = "alphabetic";
  const lignes = lignesTitre(ctx, v.titre, CARTE.lTexte);
  let base = ya + 38;
  for (const t of lignes) {
    ctx.fillText(t, CARTE.xTexte, base);
    base += CARTE.pasTitre;
  }
  ctx.font = `${CARTE.tailleMeta}px "${POLICE.youtubeMeta}"${POLICE_EMOJI}`;
  ctx.fillStyle = COULEUR.ytMeta;
  const meta = couper(ctx, `${v.chaine} · ${v.vues} · ${v.date}`, CARTE.lTexte + 40);
  ctx.fillText(meta, CARTE.xTexte, base - CARTE.pasTitre + 58);
  ctx.restore();

  // Les trois points du menu.
  ctx.save();
  ctx.fillStyle = COULEUR.ytTitre;
  for (const k of [0, 1, 2]) {
    ctx.beginPath();
    ctx.arc(CARTE.x + CARTE.l - 15, ya + 18 + k * 15, 4.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return base - CARTE.pasTitre + 58 + 10;
}

// ---------------------------------------------------------------------------
// Recherche des vraies vidéos (page de résultats, page de la vidéo)
// ---------------------------------------------------------------------------

/** Région et langue de l'interface YouTube pour chaque langue de deck. */
const REGION: Record<string, { hl: string; gl: string }> = {
  en: { hl: "en", gl: "US" },
  fr: { hl: "fr", gl: "FR" },
  de: { hl: "de", gl: "DE" },
  es: { hl: "es", gl: "ES" },
  it: { hl: "it", gl: "IT" },
  pt: { hl: "pt", gl: "PT" },
  tr: { hl: "tr", gl: "TR" },
};

const ENTETES = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  cookie: "CONSENT=YES+cb; SOCS=CAI",
};

async function page(url: string, langue: string): Promise<string> {
  const r = await fetch(url, { headers: { ...ENTETES, "accept-language": `${REGION[langue]?.hl ?? "en"};q=0.9` } });
  if (!r.ok) throw new Error(`YouTube HTTP ${r.status}`);
  return r.text();
}

/** L'objet JSON qui suit `var <variable> = ` dans la page, accolades appariées (du code le suit parfois). */
function json(html: string, variable: string): any {
  const i = html.indexOf(`var ${variable} = `);
  if (i < 0) return {};
  const debut = html.indexOf("{", i);
  let profondeur = 0;
  let chaine = false;
  for (let k = debut; k < html.length; k++) {
    const c = html[k];
    if (chaine) {
      if (c === "\\") k++;
      else if (c === '"') chaine = false;
    } else if (c === '"') chaine = true;
    else if (c === "{") profondeur++;
    else if (c === "}" && --profondeur === 0) return JSON.parse(html.slice(debut, k + 1));
  }
  return {};
}

function* parcourir(o: any, cle: string): Generator<any> {
  if (Array.isArray(o)) for (const v of o) yield* parcourir(v, cle);
  else if (o && typeof o === "object")
    for (const [k, v] of Object.entries(o)) {
      if (k === cle) yield v;
      yield* parcourir(v, cle);
    }
}

const texte = (t: any): string => String(t?.simpleText ?? (t?.runs ?? []).map((r: any) => r.text).join("") ?? "").trim();

export type Resultat = {
  id: string;
  titre: string;
  chaine: string;
  /** Tel que la page l'écrit (« 3,453,934 views »). */
  vues: string;
  /** Le nombre exact de vues, quand la page le donne en entier. */
  vues_exactes: number | null;
  /** Tel que la page l'écrit (« 8 years ago », parfois « 8y ago »). */
  date: string;
  duree: string;
  avatar: string;
  /** Le chiffre compact de YouTube dans la langue (« 1,2 Mio. », « 374 K », « 101 mi »). */
  vues_courtes: string;
};

/**
 * Les vidéos que YouTube renvoie pour une recherche, dans la langue du deck.
 * La page de résultats donne tout ce que montre la carte (vues exactes, date,
 * durée, chaîne, avatar) ; la page d'une vidéo, elle, demande souvent de
 * prouver qu'on n'est pas un robot.
 */
export async function chercher(requete: string, langue = "en", n = 12): Promise<Resultat[]> {
  const { hl, gl } = REGION[langue] ?? REGION.en;
  const html = await page(`https://www.youtube.com/results?search_query=${encodeURIComponent(requete)}&sp=EgIQAQ%253D%253D&hl=${hl}&gl=${gl}`, langue);
  const res: Resultat[] = [];
  for (const v of parcourir(json(html, "ytInitialData"), "videoRenderer")) {
    const vues = texte(v.viewCountText);
    const chiffres = vues.replace(/[^\d]/g, "");
    const avatar = [...parcourir(v.channelThumbnailSupportedRenderers ?? {}, "thumbnails")][0]?.at(-1)?.url ?? "";
    res.push({
      id: v.videoId,
      titre: texte(v.title),
      chaine: texte(v.ownerText),
      vues,
      // « 3,453,934 views » : entier ; « 3.4M views » : pas d'exact.
      vues_exactes: /^[\d.,\s  ]+\D*$/.test(vues) && !/[KMB]/i.test(vues) && chiffres ? Number(chiffres) : null,
      date: texte(v.publishedTimeText),
      duree: texte(v.lengthText),
      avatar: String(avatar).replace(/=s\d+-/, "=s176-"),
      vues_courtes: texte(v.shortViewCountText),
    });
    if (res.length >= n) break;
  }
  return res;
}

/** « 8y ago » → « 8 years ago » (la page de résultats abrège parfois, l'appli jamais). */
export function dateAppli(date: string, langue = "en"): string {
  // La page abrège aussi en français et en espagnol (« il y a 8 a », « hace 8 a ») ; l'appli écrit le mot entier.
  const n = (x: string) => Number(x) > 1;
  const fr = date.match(/^il y a (\d+)\s*(a|m\.|sem\.|j|h|min)$/);
  if (langue === "fr" && fr) {
    const mot = { a: n(fr[1]) ? "ans" : "an", "m.": "mois", "sem.": n(fr[1]) ? "semaines" : "semaine", j: n(fr[1]) ? "jours" : "jour", h: n(fr[1]) ? "heures" : "heure", min: "min" }[fr[2]];
    return `il y a ${fr[1]} ${mot}`;
  }
  const es = date.match(/^hace (\d+)\s*(a|m|sem\.|d|h|min)$/);
  if (langue === "es" && es) {
    const mot = { a: n(es[1]) ? "años" : "año", m: n(es[1]) ? "meses" : "mes", "sem.": n(es[1]) ? "semanas" : "semana", d: n(es[1]) ? "días" : "día", h: n(es[1]) ? "horas" : "hora", min: "min" }[es[2]];
    return `hace ${es[1]} ${mot}`;
  }
  const m = date.match(/^(\d+)\s*(y|yr|mo|w|wk|d|h|min)s?\s+ago$/i);
  if (!m || langue !== "en") return date;
  const unite = { y: "year", yr: "year", mo: "month", w: "week", wk: "week", d: "day", h: "hour", min: "minute" }[m[2].toLowerCase()] ?? m[2];
  return `${m[1]} ${unite}${Number(m[1]) > 1 ? "s" : ""} ago`;
}

/** Ce que la carte affiche pour une vidéo précise, relevé sur la page de résultats. */
export async function details(id: string, langue = "en", recherche?: string): Promise<Video & { vues_exactes: number | null }> {
  // La recherche par id rate parfois une vidéo bien publique : on reformule avant de conclure.
  let r: Resultat | undefined;
  // Le titre natif d'abord : par son id, YouTube rend parfois le titre traduit qu'a ajouté la chaîne.
  for (const requete of [...(recherche ? [recherche] : []), id, `"${id}"`, `youtube.com/watch?v=${id}`]) {
    r = (await chercher(requete, langue, 20)).find((x) => x.id === id);
    if (r) break;
  }
  if (!r) throw new Error(`${id} : introuvable dans les résultats de YouTube (vidéo privée, supprimée, ou id mal recopié)`);
  if (!r.avatar) throw new Error(`${id} : avatar de la chaîne introuvable`);
  return {
    id,
    titre: r.titre,
    chaine: r.chaine,
    vues: VUES_LOCALES[langue] && r.vues_courtes ? VUES_LOCALES[langue](r.vues_courtes) : r.vues_exactes !== null ? formatVues(r.vues_exactes, langue) : r.vues,
    date: dateAppli(r.date, langue),
    duree: r.duree,
    avatar: r.avatar,
    vues_exactes: r.vues_exactes,
  };
}

/**
 * Les vues comme l'appli les écrit en de, es, it et pt : le chiffre compact
 * que YouTube donne lui-même dans la langue, puis le mot (« 1,2 Mio. Aufrufe »,
 * « 1,2 M de visualizaciones », « 1,2 Mln visualizzazioni », « 1,2 mi visualizações »).
 */
const VUES_LOCALES: Record<string, (court: string) => string> = {
  de: (c) => `${c} Aufrufe`,
  es: (c) => (/\sM$/.test(c) ? `${c} de visualizaciones` : `${c} visualizaciones`),
  it: (c) => `${c} visualizzazioni`,
  pt: (c) => `${c} visualizações`,
};

/** « 3.4M views » : un chiffre après la virgule sous 10, tronqué comme l'appli. */
export function formatVues(n: number, langue = "en"): string {
  const tronque = (x: number) => (x < 10 ? Math.floor(x * 10) / 10 : Math.floor(x));
  const [v, u] = n >= 1e9 ? [tronque(n / 1e9), "B"] : n >= 1e6 ? [tronque(n / 1e6), "M"] : n >= 1e3 ? [tronque(n / 1e3), "K"] : [n, ""];
  if (langue === "fr") {
    const nombre = String(v).replace(".", ",");
    return u === "M" ? `${nombre} M de vues` : u === "B" ? `${nombre} Md de vues` : u === "K" ? `${nombre} k vues` : `${nombre} vues`;
  }
  return `${v}${u} views`;
}
