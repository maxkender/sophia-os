/** Burn-in texte style TikTok + emojis Apple/iOS (PNG), preview test. */

import { contientLettresRtl } from "./langues";

export interface ZoneBurn {
  x: number;
  y: number;
  w: number;
  h: number;
  couleur: string;
  /** true = contour/ombre visible sur le brut ; false = fill seul. */
  ombre: boolean;
  texte: string;
  /** Nombre de lignes visuelles sur le brut (hint wrap). */
  nbLignes?: number;
  /** Distinction titre / corps (taille). */
  role?: "titre" | "corps";
  /** Texte source OCR (pour infos / debug). */
  texteSource?: string;
}

export type SlideBurnInput = {
  position: number;
  propreUrl: string;
  /** Image brute (texte encore visible) — pour échantillonner la vraie couleur. */
  brutUrl?: string;
  zones: ZoneBurn[];
};

const APPLE_EMOJI_CDN =
  "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64";

const EMOJI_RE = /\p{Extended_Pictographic}/u;

/** Palette TikTok fréquente — matching tolérant lors du sampling. */
const PALETTE = [
  { hex: "#FFFFFF", r: 255, g: 255, b: 255 },
  { hex: "#000000", r: 0, g: 0, b: 0 },
  { hex: "#FE2C55", r: 254, g: 44, b: 85 },
  { hex: "#FFE600", r: 255, g: 230, b: 0 },
  { hex: "#25F4EE", r: 37, g: 244, b: 238 },
  { hex: "#FF6A3D", r: 255, g: 106, b: 61 },
  { hex: "#A855F7", r: 168, g: 85, b: 247 },
  { hex: "#22C55E", r: 34, g: 197, b: 94 },
  { hex: "#3B82F6", r: 59, g: 130, b: 246 },
] as const;

let fontReady: Promise<void> | null = null;
const emojiCache = new Map<string, HTMLImageElement | null>();

const FONT_STACK =
  '"TikTok Sans", "Noto Sans Arabic", "Noto Sans Hebrew", "Arial Black", Impact, sans-serif';

/** Charge TikTok Sans + Noto arabe/hébreu (Google Fonts) — fallback Arial Black / Impact. */
export function assurerPoliceTikTok(): Promise<void> {
  if (fontReady) return fontReady;
  fontReady = (async () => {
    if (typeof document === "undefined") return;
    const id = "sophia-tiktok-sans";
    if (!document.getElementById(id)) {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=TikTok+Sans:wght@600;700&family=Noto+Sans+Arabic:wght@600;700&family=Noto+Sans+Hebrew:wght@600;700&display=swap";
      document.head.appendChild(link);
    }
    try {
      await document.fonts.load('700 48px "TikTok Sans"');
      await document.fonts.load('700 48px "Noto Sans Arabic"');
      await document.fonts.load('700 48px "Noto Sans Hebrew"');
      await document.fonts.ready;
    } catch {
      // fallback système
    }
  })();
  return fontReady;
}

function contrasteStroke(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#000000";
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.55 ? "#000000" : "#FFFFFF";
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function dist2(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function snapPalette(r: number, g: number, b: number): string {
  // Blanc / noir d'abord (seuils larges — fill réel souvent un peu gris)
  if (r > 210 && g > 210 && b > 210) return "#FFFFFF";
  if (r < 45 && g < 45 && b < 45) return "#000000";

  let bestHex: string = "#FFFFFF";
  let bestD = Infinity;
  for (const p of PALETTE) {
    const d = dist2({ r, g, b }, p);
    if (d < bestD) {
      bestD = d;
      bestHex = p.hex;
    }
  }
  // Si trop loin de toute palette connue, garder le hex mesuré
  if (bestD > 90 * 90 * 3) return rgbToHex(r, g, b);
  return bestHex;
}

/**
 * Échantillonne la VRAIE couleur de fill (+ présence de contour) depuis le brut.
 * Gemini se trompe souvent ; les pixels ne mentent pas.
 */
export async function echantillonnerStyleZone(
  brutUrl: string,
  zone: { x: number; y: number; w: number; h: number },
): Promise<{ couleur: string; ombre: boolean }> {
  const img = await chargerImage(brutUrl);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  // Canvas réduit pour vitesse
  const maxSide = 360;
  const scale = Math.min(1, maxSide / Math.max(iw, ih));
  const cw = Math.max(1, Math.round(iw * scale));
  const ch = Math.max(1, Math.round(ih * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { couleur: "#FFFFFF", ombre: false };
  ctx.drawImage(img, 0, 0, cw, ch);

  const pad = 0.06;
  const zx = Math.max(0, Math.floor((zone.x + zone.w * pad) * cw));
  const zy = Math.max(0, Math.floor((zone.y + zone.h * pad) * ch));
  const zw = Math.max(1, Math.floor(zone.w * (1 - 2 * pad) * cw));
  const zh = Math.max(1, Math.floor(zone.h * (1 - 2 * pad) * ch));
  const data = ctx.getImageData(zx, zy, Math.min(zw, cw - zx), Math.min(zh, ch - zy));
  const px = data.data;
  const n = px.length / 4;
  if (n < 20) return { couleur: "#FFFFFF", ombre: false };

  // Fond ≈ moyenne des bords de la zone
  let br = 0;
  let bg = 0;
  let bb = 0;
  let bn = 0;
  const ww = data.width;
  const hh = data.height;
  for (let y = 0; y < hh; y += 1) {
    for (let x = 0; x < ww; x += 1) {
      const edge = x < 2 || y < 2 || x >= ww - 2 || y >= hh - 2;
      if (!edge) continue;
      const i = (y * ww + x) * 4;
      br += px[i]!;
      bg += px[i + 1]!;
      bb += px[i + 2]!;
      bn += 1;
    }
  }
  if (bn === 0) {
    br = bg = bb = 128;
  } else {
    br /= bn;
    bg /= bn;
    bb /= bn;
  }

  // Buckets palette + compteur « texte » (pixels contrastés vs fond)
  const scores = new Map<string, number>();
  let darkNearBright = 0;
  let brightCount = 0;

  const step = Math.max(1, Math.floor(Math.sqrt(n) / 40));
  for (let y = 1; y < hh - 1; y += step) {
    for (let x = 1; x < ww - 1; x += step) {
      const i = (y * ww + x) * 4;
      const r = px[i]!;
      const g = px[i + 1]!;
      const b = px[i + 2]!;
      const contrast = Math.sqrt(dist2({ r, g, b }, { r: br, g: bg, b: bb }));
      if (contrast < 55) continue; // trop proche du fond

      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Ignore les pixels « photo » peu saturés et mi-gris (sauf blanc/noir fort)
      const isWhite = r > 210 && g > 210 && b > 210;
      const isBlack = r < 45 && g < 45 && b < 45;
      const isVivid = sat > 70 && (lum < 220 || sat > 100);
      if (!isWhite && !isBlack && !isVivid) continue;

      const hex = snapPalette(r, g, b);
      // Pondère les blancs/vivids (fill) plus que le noir (souvent stroke)
      const poids = hex === "#000000" ? 0.35 : isWhite || isVivid ? 1.4 : 1;
      scores.set(hex, (scores.get(hex) ?? 0) + poids);

      if (lum > 180) {
        brightCount += 1;
        // Voisins sombres → indice de contour
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const j = ((y + dy) * ww + (x + dx)) * 4;
          const lr = 0.2126 * px[j]! + 0.7152 * px[j + 1]! + 0.0722 * px[j + 2]!;
          if (lr < 70) {
            darkNearBright += 1;
            break;
          }
        }
      }
    }
  }

  // Retire le noir du ranking fill s'il y a une autre couleur dominante
  const entries = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  let couleur = "#FFFFFF";
  if (entries.length > 0) {
    const top = entries[0]!;
    if (top[0] === "#000000" && entries.length > 1 && entries[1]![1] > top[1] * 0.35) {
      couleur = entries[1]![0];
    } else if (top[0] === "#000000" && brightCount > 10) {
      // Noir dominant mais beaucoup de pixels clairs → fill blanc + stroke
      couleur = "#FFFFFF";
    } else {
      couleur = top[0];
    }
  }

  const ombre =
    brightCount > 8 && darkNearBright / Math.max(1, brightCount) > 0.28;

  return { couleur, ombre };
}

/** Remplace couleur/ombre Gemini par l'échantillon pixel du brut. */
export async function affinerZonesDepuisBrut(
  brutUrl: string,
  zones: ZoneBurn[],
): Promise<ZoneBurn[]> {
  const out: ZoneBurn[] = [];
  for (const z of zones) {
    try {
      const style = await echantillonnerStyleZone(brutUrl, z);
      out.push({ ...z, couleur: style.couleur, ombre: style.ombre });
    } catch {
      out.push(z);
    }
  }
  return out;
}

function emojiToUnified(emoji: string): string {
  const cps: string[] = [];
  for (const ch of emoji) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    if (cp === 0xfe0f) continue;
    cps.push(cp.toString(16));
  }
  return cps.join("-");
}

function segmenterGraphemes(texte: string): string[] {
  const IntlAny = Intl as typeof Intl & {
    Segmenter?: new (
      locales?: string | string[],
      options?: { granularity: "grapheme" | "word" | "sentence" },
    ) => { segment: (input: string) => Iterable<{ segment: string }> };
  };
  if (typeof IntlAny.Segmenter === "function") {
    const seg = new IntlAny.Segmenter(undefined, { granularity: "grapheme" });
    return [...seg.segment(texte)].map((s) => s.segment);
  }
  return [...texte];
}

type Run = { kind: "text"; value: string } | { kind: "emoji"; value: string };

function tokenizerRuns(texte: string): Run[] {
  const graphemes = segmenterGraphemes(texte);
  const runs: Run[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      runs.push({ kind: "text", value: buf });
      buf = "";
    }
  };
  for (const g of graphemes) {
    if (EMOJI_RE.test(g)) {
      flush();
      runs.push({ kind: "emoji", value: g });
    } else {
      buf += g;
    }
  }
  flush();
  return runs;
}

async function chargerEmojiApple(emoji: string): Promise<HTMLImageElement | null> {
  const unified = emojiToUnified(emoji);
  if (!unified) return null;
  if (emojiCache.has(unified)) return emojiCache.get(unified) ?? null;

  const urls = [
    `${APPLE_EMOJI_CDN}/${unified}.png`,
    `${APPLE_EMOJI_CDN}/${[...emoji].map((c) => c.codePointAt(0)!.toString(16)).join("-")}.png`,
  ];

  for (const url of urls) {
    try {
      const img = await chargerImage(url);
      emojiCache.set(unified, img);
      return img;
    } catch {
      // try next
    }
  }
  emojiCache.set(unified, null);
  return null;
}

async function prechargerEmojis(texte: string): Promise<void> {
  const runs = tokenizerRuns(texte);
  await Promise.all(
    runs.filter((r) => r.kind === "emoji").map((r) => chargerEmojiApple(r.value)),
  );
}

function largeurEmoji(size: number): number {
  return size * 1.05;
}

function mesurerLigne(
  ctx: CanvasRenderingContext2D,
  line: string,
  size: number,
): number {
  let w = 0;
  for (const run of tokenizerRuns(line)) {
    if (run.kind === "emoji") {
      w += largeurEmoji(size) + size * 0.06;
    } else {
      w += ctx.measureText(run.value).width;
    }
  }
  return w;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  texte: string,
  maxW: number,
  size: number,
): string[] {
  const paragraphs = texte.replace(/\r/g, "").split(/\n/);
  const lines: string[] = [];

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) {
      if (paragraphs.length > 1) lines.push("");
      continue;
    }
    const rawTokens = trimmed.split(/(\s+)/).filter((t) => t.length > 0);
    const tokens: string[] = [];
    for (const t of rawTokens) {
      if (/^\s+$/.test(t)) continue;
      const parts = segmenterGraphemes(t);
      let word = "";
      for (const g of parts) {
        if (EMOJI_RE.test(g)) {
          if (word) tokens.push(word);
          word = "";
          tokens.push(g);
        } else {
          word += g;
        }
      }
      if (word) tokens.push(word);
    }

    let cur = "";
    for (const tok of tokens) {
      const trial = cur ? `${cur} ${tok}` : tok;
      const glued = cur && EMOJI_RE.test(tok) ? `${cur} ${tok}` : trial;
      if (mesurerLigne(ctx, glued, size) <= maxW || !cur) {
        cur = glued;
      } else {
        lines.push(cur);
        cur = tok;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines.length ? lines : [texte];
}

function geometryZone(
  z: ZoneBurn,
  canvasW: number,
  canvasH: number,
): { x: number; y: number; w: number; h: number; maxW: number; maxH: number } {
  let zx = z.x;
  let zw = z.w;
  if (zw < 0.72) {
    const cible = 0.84;
    zx = Math.max(0.04, z.x + z.w / 2 - cible / 2);
    zw = Math.min(0.92, cible);
  }
  const x = zx * canvasW;
  const y = z.y * canvasH;
  const w = zw * canvasW;
  // Hauteur de zone : on élargit un peu pour ne pas forcer un shrink de police
  const h = Math.max(z.h * canvasH, canvasH * 0.2);
  const padX = w * 0.03;
  const padY = h * 0.02;
  return {
    x,
    y,
    w,
    h,
    maxW: Math.max(8, w - padX * 2),
    maxH: Math.max(8, h - padY * 2),
  };
}

function roleZone(z: ZoneBurn): "titre" | "corps" {
  // Rôle explicite Gemini / edge — ne pas reclasseer selon le texte traduit
  if (z.role === "titre") return "titre";
  if (z.role === "corps") return "corps";
  return "corps";
}

/** Wrap à taille fixée. Réduit au plus de 8 % pour éviter les écarts inter-slides. */
function wrapATaille(
  ctx: CanvasRenderingContext2D,
  texte: string,
  maxW: number,
  maxH: number,
  family: string,
  tailleCible: number,
  nbLignesHint?: number,
): { size: number; lines: string[] } {
  const prevDir = ctx.direction;
  ctx.direction = contientLettresRtl(texte) ? "rtl" : "ltr";
  const cible = Math.max(12, Math.round(tailleCible));
  const plancher = Math.max(12, Math.round(cible * 0.92));
  let size = cible;

  while (size >= plancher) {
    ctx.font = `700 ${size}px ${family}`;
    let lines = wrapLines(ctx, texte, maxW, size);
    if (nbLignesHint && nbLignesHint > 1 && lines.length < nbLignesHint) {
      let virtW = maxW;
      for (let i = 0; i < 6 && lines.length < nbLignesHint; i += 1) {
        virtW *= 0.9;
        lines = wrapLines(ctx, texte, virtW, size);
      }
    }
    const lineH = size * 1.2;
    const totalH = lines.length * lineH;
    const maxLineW = Math.max(...lines.map((l) => mesurerLigne(ctx, l, size)), 0);
    if (totalH <= maxH * 1.08 && maxLineW <= maxW * 1.03) {
      ctx.direction = prevDir;
      return { size, lines };
    }
    size -= 1;
  }

  // Dernier recours : garder le plancher même si ça déborde un peu
  ctx.font = `700 ${plancher}px ${family}`;
  const fallback = { size: plancher, lines: wrapLines(ctx, texte, maxW, plancher) };
  ctx.direction = prevDir;
  return fallback;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/**
 * Tailles en FRACTION de la hauteur d'image — cohérent même si résolutions varient.
 * Basé uniquement sur la géométrie source (h / nbLignes), pas sur le fit du texte traduit.
 */
export function calculerFractionsTaille(
  slides: SlideBurnInput[],
): { corpsFrac: number; titreFrac: number } {
  const corps: number[] = [];
  const titres: number[] = [];

  for (const slide of slides) {
    for (const z of slide.zones) {
      if (!(z.texte ?? "").trim()) continue;
      const nb = Math.max(1, z.nbLignes ?? 3);
      // hauteur d'une ligne / hauteur image
      const lineFrac = z.h / nb;
      // facteur empattement TikTok ≈ 0.78 du line-height
      const fontFrac = lineFrac * 0.78;
      if (roleZone(z) === "titre") titres.push(fontFrac);
      else corps.push(fontFrac);
    }
  }

  let corpsFrac = median(corps);
  if (!corpsFrac) corpsFrac = median(titres) || 0.035;
  // Bornes raisonnables 9:16 (~28–56 px sur 1080)
  corpsFrac = Math.max(0.024, Math.min(0.055, corpsFrac));

  let titreFrac = median(titres);
  if (!titreFrac) titreFrac = corpsFrac * 1.22;
  titreFrac = Math.max(corpsFrac * 1.1, Math.min(0.07, titreFrac));

  return { corpsFrac, titreFrac };
}

/** @deprecated alias — renvoie px pour une hauteur de référence 1080. */
export async function calculerTaillesSlideshow(
  slides: SlideBurnInput[],
): Promise<{ corps: number; titre: number }> {
  const { corpsFrac, titreFrac } = calculerFractionsTaille(slides);
  return {
    corps: Math.round(corpsFrac * 1080),
    titre: Math.round(titreFrac * 1080),
  };
}

function largeurRun(ctx: CanvasRenderingContext2D, run: Run, size: number): number {
  if (run.kind === "emoji") return largeurEmoji(size) + size * 0.06;
  return ctx.measureText(run.value).width;
}

function dessinerLigne(
  ctx: CanvasRenderingContext2D,
  line: string,
  cx: number,
  cy: number,
  size: number,
  fill: string,
  stroke: string,
  avecContour: boolean,
): void {
  const rtl = contientLettresRtl(line);
  ctx.direction = rtl ? "rtl" : "ltr";
  const runs = tokenizerRuns(line);
  const totalW = mesurerLigne(ctx, line, size);
  let x = rtl ? cx + totalW / 2 : cx - totalW / 2;
  const emojiH = size * 1.08;
  const strokeW = Math.max(3, size * 0.18);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  for (const run of runs) {
    const w = largeurRun(ctx, run, size);
    if (rtl) x -= w;
    if (run.kind === "emoji") {
      const unified = emojiToUnified(run.value);
      const img = emojiCache.get(unified) ?? null;
      const ew = largeurEmoji(size);
      if (img) {
        const ey = cy - size * 0.88;
        ctx.drawImage(img, x, ey, ew, emojiH);
      } else {
        ctx.fillStyle = fill;
        ctx.fillText(run.value, x, cy);
      }
    } else {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      if (avecContour) {
        ctx.lineWidth = strokeW;
        ctx.strokeStyle = stroke;
        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = size * 0.08;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = Math.max(1, size * 0.025);
        ctx.strokeText(run.value, x, cy);
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = fill;
      ctx.fillText(run.value, x, cy);
    }
    if (!rtl) x += w;
  }
  ctx.direction = "ltr";
}

export type OptionsBurn = {
  /** Fraction hauteur image pour le corps (ex. 0.034). */
  corpsFrac?: number;
  /** Fraction hauteur image pour le titre. */
  titreFrac?: number;
  /** @deprecated px absolus — préférer les fractions. */
  tailleCorps?: number;
  tailleTitre?: number;
};

/**
 * Dessine le texte traduit dans les zones (fractions 0..1) sur l'image propre.
 * Emojis = PNG Apple (iOS). Contour uniquement si zone.ombre === true.
 */
export async function brulerTexteSurImage(
  propreUrl: string,
  zones: ZoneBurn[],
  options: OptionsBurn = {},
): Promise<string> {
  await assurerPoliceTikTok();
  await Promise.all(zones.map((z) => prechargerEmojis(z.texte ?? "")));

  const img = await chargerImage(propreUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const family = FONT_STACK;
  const corpsPx =
    options.corpsFrac != null
      ? Math.round(options.corpsFrac * canvas.height)
      : options.tailleCorps;
  const titrePx =
    options.titreFrac != null
      ? Math.round(options.titreFrac * canvas.height)
      : options.tailleTitre ?? (corpsPx != null ? Math.round(corpsPx * 1.22) : undefined);

  for (const z of zones) {
    const texte = (z.texte ?? "").trim();
    if (!texte) continue;

    const g = geometryZone(z, canvas.width, canvas.height);
    const role = roleZone(z);
    const cible = role === "titre" ? (titrePx ?? corpsPx) : corpsPx;

    // Zone plus haute pour le wrap : on n'enferme pas trop le texte traduit
    const maxH = Math.max(g.maxH, (cible ?? 36) * (z.nbLignes ?? 5) * 1.25);

    const { size, lines } = cible
      ? wrapATaille(ctx, texte, g.maxW, maxH, family, cible, z.nbLignes)
      : wrapATaille(
          ctx,
          texte,
          g.maxW,
          maxH,
          family,
          Math.round(canvas.height * 0.034),
          z.nbLignes,
        );

    const lineH = size * 1.2;
    const blockH = lines.length * lineH;
    let cy = g.y + Math.max(g.h * 0.03, (g.h - blockH) * 0.12) + size * 0.85;
    const cx = g.x + g.w / 2;
    const fill = z.couleur || "#FFFFFF";
    const stroke = contrasteStroke(fill);
    const avecContour = z.ombre === true;

    ctx.font = `700 ${size}px ${family}`;
    for (const line of lines) {
      dessinerLigne(ctx, line, cx, cy, size, fill, stroke, avecContour);
      cy += lineH;
    }
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Burn toutes les slides d'un slideshow avec une taille corps/titre partagée.
 */
export async function brulerSlideshow(
  slides: SlideBurnInput[],
): Promise<Map<number, string>> {
  // Affine couleurs depuis brut
  const affinés: SlideBurnInput[] = [];
  for (const s of slides) {
    if (s.brutUrl) {
      affinés.push({
        ...s,
        zones: await affinerZonesDepuisBrut(s.brutUrl, s.zones),
      });
    } else {
      affinés.push(s);
    }
  }
  const { corpsFrac, titreFrac } = calculerFractionsTaille(affinés);
  const out = new Map<number, string>();
  for (const slide of affinés) {
    const dataUrl = await brulerTexteSurImage(slide.propreUrl, slide.zones, {
      corpsFrac,
      titreFrac,
    });
    out.set(slide.position, dataUrl);
  }
  return out;
}

function chargerImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`Chargement image échoué: ${url.slice(0, 80)}`));
    img.src = url;
  });
}
