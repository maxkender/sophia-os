// La carte YouTube de ses slides (appli iOS en mode sombre : miniature, durée,
// puis sur fond noir l'avatar rond, le titre sur deux lignes, chaîne · vues ·
// date, à 48 px des bords de la slide) et la
// recherche des VRAIES vidéos : page de résultats et page de la vidéo, sans
// clé d'API. Une carte ne montre jamais une vidéo inventée ni des chiffres
// arrondis à la main : `npm run youtube` les relève et les écrit au format de
// l'appli. Repris du podz 13 (Kaja) ; la carte passe en mode sombre.

import { loadImage, type Image } from "@napi-rs/canvas";
import { type Ctx, COULEUR, imageRemplie, rectArrondi } from "./dessin.ts";
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

/**
 * Géométrie relevée sur ses slides (15/11, slides de 1 170 px ramenées à
 * 1 080) : la carte fait 984 px de large à x 48, la miniature sans arrondi ;
 * dessous, sur le noir de l'appli, l'avatar (92 px) 30 px sous la miniature,
 * le titre (Inter Medium 40 px, 52 px d'une ligne à l'autre), la méta en gris
 * (30 px), les trois points à x 960 ; le noir s'arrête 43 px sous la méta.
 */
export const CARTE = {
  x: 48,
  l: 984,
  rayon: 0,
  /** Écart entre la miniature et l'avatar. */
  ecart: 30,
  avatar: 92,
  xAvatar: 78,
  /** Début du titre (après l'avatar) et largeur utile avant les trois points. */
  xTexte: 202,
  lTexte: 720,
  tailleTitre: 40,
  pasTitre: 52,
  /** Base de la première ligne du titre, sous le haut de l'avatar. */
  baseTitre: 35,
  tailleMeta: 30,
  /** Base de la méta, sous la dernière ligne du titre. */
  baseMeta: 48,
  /** Le bas du noir, sous la base de la méta. */
  basNoir: 43,
  /** Les trois points du menu : centre x, premier point sous le haut de l'avatar, pas, rayon. */
  points: { x: 960, y: 15, pas: 14, r: 5 },
} as const;

/** Hauteur de la miniature (16:9). */
export const hauteurMiniature = Math.round((CARTE.l * 9) / 16);
/** Hauteur d'une carte à deux lignes de titre : miniature, puis le noir (avatar, titre, méta). */
export const hauteurCarte = hauteurMiniature + CARTE.ecart + CARTE.baseTitre + CARTE.pasTitre + CARTE.baseMeta + CARTE.basNoir;

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

/** Dessine la carte à partir de `y` (haut de la miniature) ; renvoie le bas du noir. */
export async function carteYoutube(ctx: Ctx, v: Video, y: number): Promise<number> {
  const hm = hauteurMiniature;
  const { img, bandes } = await miniature(v.id);
  // Le titre d'abord mesuré : le noir de l'appli s'arrête sous la méta.
  ctx.save();
  ctx.font = `${CARTE.tailleTitre}px "${POLICE.youtube}"${POLICE_EMOJI}`;
  const lignes = lignesTitre(ctx, v.titre, CARTE.lTexte);
  ctx.restore();
  const ya = y + hm + CARTE.ecart;
  const baseMeta = ya + CARTE.baseTitre + (lignes.length - 1) * CARTE.pasTitre + CARTE.baseMeta;
  const bas = baseMeta + CARTE.basNoir;
  ctx.fillStyle = COULEUR.ytFond;
  ctx.fillRect(CARTE.x, y + hm, CARTE.l, bas - (y + hm));
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
  ctx.font = `30px "${POLICE.duree}"`;
  const lb = ctx.measureText(v.duree).width + 22;
  const hb = 44;
  const xb = CARTE.x + CARTE.l - 22 - lb;
  const yb = y + hm - 20 - hb;
  rectArrondi(ctx, xb, yb, lb, hb, 10);
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(v.duree, xb + 11, yb + hb / 2 + 1);
  ctx.restore();

  // L'avatar rond de la chaîne.
  const av = await loadImage(await image(`yta_${v.id}`, v.avatar));
  ctx.save();
  ctx.beginPath();
  ctx.arc(CARTE.xAvatar + CARTE.avatar / 2, ya + CARTE.avatar / 2, CARTE.avatar / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(av, CARTE.xAvatar, ya, CARTE.avatar, CARTE.avatar);
  ctx.restore();

  // Le titre (deux lignes au plus), puis chaîne · vues · date.
  ctx.save();
  ctx.font = `${CARTE.tailleTitre}px "${POLICE.youtube}"${POLICE_EMOJI}`;
  ctx.fillStyle = COULEUR.ytTitre;
  ctx.textBaseline = "alphabetic";
  let base = ya + CARTE.baseTitre;
  for (const t of lignes) {
    ctx.fillText(t, CARTE.xTexte, base);
    base += CARTE.pasTitre;
  }
  ctx.font = `${CARTE.tailleMeta}px "${POLICE.youtubeMeta}"${POLICE_EMOJI}`;
  ctx.fillStyle = COULEUR.ytMeta;
  ctx.fillText(couper(ctx, `${v.chaine} · ${v.vues} · ${v.date}`, CARTE.lTexte + 40), CARTE.xTexte, baseMeta);
  ctx.restore();

  // Les trois points du menu.
  ctx.save();
  ctx.fillStyle = COULEUR.ytTitre;
  for (const k of [0, 1, 2]) {
    ctx.beginPath();
    ctx.arc(CARTE.points.x, ya + CARTE.points.y + k * CARTE.points.pas, CARTE.points.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  return bas;
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
  "pt-BR": { hl: "pt", gl: "BR" },
  "es-419": { hl: "es-419", gl: "MX" },
  tr: { hl: "tr", gl: "TR" },
  ro: { hl: "ro", gl: "RO" },
  cs: { hl: "cs", gl: "CZ" },
  hu: { hl: "hu", gl: "HU" },
  el: { hl: "el", gl: "GR" },
  sr: { hl: "sr", gl: "RS" },
  pl: { hl: "pl", gl: "PL" },
  sk: { hl: "sk", gl: "SK" },
  hr: { hl: "hr", gl: "HR" },
  sv: { hl: "sv", gl: "SE" },
  lv: { hl: "lv", gl: "LV" },
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
  if ((langue === "es" || langue === "es-419") && es) {
    const mot = { a: n(es[1]) ? "años" : "año", m: n(es[1]) ? "meses" : "mes", "sem.": n(es[1]) ? "semanas" : "semana", d: n(es[1]) ? "días" : "día", h: n(es[1]) ? "horas" : "hora", min: "min" }[es[2]];
    return `hace ${es[1]} ${mot}`;
  }
  // En tchèque, la page abrège (« před 2 r. », « před 6 l. », « před 2 měs. ») ; l'appli écrit « před 2 lety ».
  const cs = date.match(/^před (\d+)\s*(r\.|l\.|měs\.|týd\.|d\.|h\.|min\.)$/);
  if (langue === "cs" && cs) {
    const un = cs[1] === "1";
    const mot = { "r.": un ? "rokem" : "lety", "l.": un ? "rokem" : "lety", "měs.": un ? "měsícem" : "měsíci", "týd.": un ? "týdnem" : "týdny", "d.": un ? "dnem" : "dny", "h.": un ? "hodinou" : "hodinami", "min.": un ? "minutou" : "minutami" }[cs[2]];
    return `před ${cs[1]} ${mot}`;
  }
  if (langue === "sr") return dateSerbe(latin(date));
  // sk, hr, lv, sv : la page abrège (« pred 9 r. », « prije 3 g. », « pirms 1 g. », « för 5 år sen ») ; l'appli écrit le mot entier.
  const pl = date.match(/^(\d+)\s*(mies\.|tyg\.|godz\.|min\.)\s+temu$/);
  if (langue === "pl" && pl) {
    const k = Number(pl[1]);
    const forme = (un: string, peu: string, plus: string) => (k === 1 ? un : k % 10 >= 2 && k % 10 <= 4 && (k % 100 < 12 || k % 100 > 14) ? peu : plus);
    const mot = { "mies.": forme("miesiąc", "miesiące", "miesięcy"), "tyg.": forme("tydzień", "tygodnie", "tygodni"), "godz.": forme("godzinę", "godziny", "godzin"), "min.": forme("minutę", "minuty", "minut") }[pl[2]];
    return `${k} ${mot} temu`;
  }
  const sk = date.match(/^pred (\d+)\s*(r\.|mes\.|týž\.|d\.|hod\.|min\.)$/);
  if (langue === "sk" && sk) {
    const un = sk[1] === "1";
    const mot = { "r.": un ? "rokom" : "rokmi", "mes.": un ? "mesiacom" : "mesiacmi", "týž.": un ? "týždňom" : "týždňami", "d.": un ? "dňom" : "dňami", "hod.": un ? "hodinou" : "hodinami", "min.": un ? "minútou" : "minútami" }[sk[2]];
    return `pred ${sk[1]} ${mot}`;
  }
  const hr = date.match(/^prije (\d+)\s*(g\.|mj\.|tj\.|dan\.?|d\.|h\.|sat\.?|min\.)$/);
  if (langue === "hr" && hr) {
    const k = Number(hr[1]);
    const forme = (un: string, peu: string, plus: string) => (k % 10 === 1 && k % 100 !== 11 ? un : k % 10 >= 2 && k % 10 <= 4 && (k % 100 < 12 || k % 100 > 14) ? peu : plus);
    const mots: Record<string, string> = { "g.": forme("godinu", "godine", "godina"), "mj.": forme("mjesec", "mjeseca", "mjeseci"), "tj.": forme("tjedan", "tjedna", "tjedana"), "dan.": forme("dan", "dana", "dana"), dan: forme("dan", "dana", "dana"), "d.": forme("dan", "dana", "dana"), "h.": forme("sat", "sata", "sati"), "sat.": forme("sat", "sata", "sati"), sat: forme("sat", "sata", "sati"), "min.": forme("minutu", "minute", "minuta") };
    return `prije ${k} ${mots[hr[2]]}`;
  }
  const lv = date.match(/^pirms (\d+)\s*(g\.|mēn\.|ned\.|d\.|st\.|min\.)$/);
  if (langue === "lv" && lv) {
    const k = Number(lv[1]);
    const un = k % 10 === 1 && k % 100 !== 11;
    const mot = { "g.": un ? "gada" : "gadiem", "mēn.": un ? "mēneša" : "mēnešiem", "ned.": un ? "nedēļas" : "nedēļām", "d.": un ? "dienas" : "dienām", "st.": un ? "stundas" : "stundām", "min.": un ? "minūtes" : "minūtēm" }[lv[2]];
    return `pirms ${k} ${mot}`;
  }
  const sv = date.match(/^för (\d+)\s*(år|mån\.|v\.|veckor|vecka|d\.|dagar|dag|tim\.|min\.)\s+sen$/);
  if (langue === "sv" && sv) {
    const un = sv[1] === "1";
    const mot = { år: "år", "mån.": un ? "månad" : "månader", "v.": un ? "vecka" : "veckor", veckor: "veckor", vecka: "vecka", "d.": un ? "dag" : "dagar", dagar: "dagar", dag: "dag", "tim.": un ? "timme" : "timmar", "min.": un ? "minut" : "minuter" }[sv[2]];
    return `för ${sv[1]} ${mot} sedan`;
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
    // Sans unité (moins de 1 000 vues), la page écrit déjà le mot accordé au nombre : on le garde.
    vues: langue === "sv" && r.vues_exactes !== null ? vuesSuedoises(r.vues_exactes) : ["pl", "sk", "hr", "lv"].includes(langue) && !/[^\d\s.,]/.test(r.vues_courtes ?? "") ? r.vues : VUES_LOCALES[langue] && r.vues_courtes ? VUES_LOCALES[langue](r.vues_courtes) : r.vues_exactes !== null ? formatVues(r.vues_exactes, langue) : r.vues,
    date: dateAppli(r.date, langue),
    // En serbe, YouTube écrit « 9.48 » : la miniature affiche toujours « 9:48 ».
    duree: /^\d+(\.\d\d)+$/.test(r.duree) ? r.duree.replace(/\./g, ":") : r.duree,
    avatar: r.avatar,
    vues_exactes: r.vues_exactes,
  };
}

/**
 * Les vues comme l'appli les écrit en de, es, it, pt, tr, ro, cs, hu, el et sr : le chiffre compact
 * que YouTube donne lui-même dans la langue, puis le mot (« 1,2 Mio. Aufrufe »,
 * « 1,2 M de visualizaciones », « 1,2 Mln visualizzazioni », « 1,2 mi visualizações »).
 */
const VUES_LOCALES: Record<string, (court: string) => string> = {
  de: (c) => `${c} Aufrufe`,
  es: (c) => (/\sM$/.test(c) ? `${c} de visualizaciones` : `${c} visualizaciones`),
  it: (c) => `${c} visualizzazioni`,
  pt: (c) => `${c} visualizações`,
  "pt-BR": (c) => `${c} visualizações`,
  "es-419": (c) => (/\sM$/.test(c) ? `${c} de vistas` : `${c} vistas`),
  tr: (c) => `${c} görüntüleme`,
  ro: (c) => `${c} vizionări`,
  cs: (c) => `${c} zhlédnutí`,
  hu: (c) => `${c} megtekintés`,
  el: (c) => `${c} προβολές`,
  sr: (c) => `${latin(c)} pregleda`,
  pl: (c) => `${c} wyświetleń`,
  sk: (c) => `${c} zhliadnutí`,
  hr: (c) => `${c} pregleda`,
  lv: (c) => `${c} skatījumu`,
};

/** Vues en sv : la page n'abrège pas, l'appli écrit « 99 tn visningar », « 1,2 mn visningar ». */
function vuesSuedoises(n: number): string {
  const tronque = (x: number) => String(x < 10 ? Math.floor(x * 10) / 10 : Math.floor(x)).replace(".", ",");
  return n >= 1e9 ? `${tronque(n / 1e9)} md visningar` : n >= 1e6 ? `${tronque(n / 1e6)} mn visningar` : n >= 1e3 ? `${tronque(n / 1e3)} tn visningar` : `${n} visningar`;
}

/** « pre 8 god. » → « pre 8 godina » : l'appli écrit le mot entier, accordé au nombre. */
export function dateSerbe(date: string): string {
  const m = date.match(/^pre (\d+)\s*(god\.|mes\.|ned\.|dan\.?|sat\.?|min\.)$/);
  if (!m) return date;
  const n = Number(m[1]);
  const forme = (un: string, peu: string, plus: string) => (n % 10 === 1 && n % 100 !== 11 ? un : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? peu : plus);
  const mots: Record<string, string> = {
    "god.": forme("godinu", "godine", "godina"),
    "mes.": forme("mesec", "meseca", "meseci"),
    "ned.": forme("nedelju", "nedelje", "nedelja"),
    "dan.": forme("dan", "dana", "dana"),
    dan: forme("dan", "dana", "dana"),
    "sat.": forme("sat", "sata", "sati"),
    sat: forme("sat", "sata", "sati"),
    "min.": forme("minut", "minuta", "minuta"),
  };
  return `pre ${n} ${mots[m[2]]}`;
}

/** Le serbe des decks s'écrit en latin ; YouTube (hl=sr) répond en cyrillique : on translittère. */
const CYR: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "đ", е: "e", ж: "ž", з: "z", и: "i", ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t", ћ: "ć", у: "u", ф: "f", х: "h", ц: "c", ч: "č", џ: "dž", ш: "š" };
export function latin(t: string): string {
  return [...t].map((ch) => {
    const bas = ch.toLowerCase();
    const l = CYR[bas];
    if (l === undefined) return ch;
    return ch === bas ? l : l.charAt(0).toUpperCase() + l.slice(1);
  }).join("");
}

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
