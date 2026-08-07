/** Burn-in texte TikTok-like sur Canvas (preview test, aucune sauvegarde). */

export interface ZoneBurn {
  x: number;
  y: number;
  w: number;
  h: number;
  couleur: string;
  ombre: boolean;
  texte: string;
}

let fontReady: Promise<void> | null = null;

/** Charge TikTok Sans (Google Fonts) — fallback Arial Black / Impact. */
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
        "https://fonts.googleapis.com/css2?family=TikTok+Sans:wght@600;700&display=swap";
      document.head.appendChild(link);
    }
    try {
      await document.fonts.load('700 48px "TikTok Sans"');
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

function wrapLines(
  ctx: CanvasRenderingContext2D,
  texte: string,
  maxW: number,
): string[] {
  const paragraphs = texte.split(/\n/).map((p) => p.trim());
  const lines: string[] = [];
  for (const p of paragraphs) {
    if (!p) {
      lines.push("");
      continue;
    }
    const words = p.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(trial).width <= maxW || !cur) {
        cur = trial;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines.length ? lines : [texte];
}

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  texte: string,
  maxW: number,
  maxH: number,
  family: string,
): { size: number; lines: string[] } {
  let lo = 12;
  let hi = Math.max(18, Math.floor(maxH * 0.9));
  let best = lo;
  let bestLines = [texte];
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    ctx.font = `700 ${mid}px ${family}`;
    const lines = wrapLines(ctx, texte, maxW);
    const lineH = mid * 1.15;
    const totalH = lines.length * lineH;
    const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    if (totalH <= maxH && maxLineW <= maxW) {
      best = mid;
      bestLines = lines;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  ctx.font = `700 ${best}px ${family}`;
  return { size: best, lines: bestLines };
}

/**
 * Dessine le texte traduit dans les zones (fractions 0..1) sur l'image propre.
 * Renvoie un dataURL JPEG.
 */
export async function brulerTexteSurImage(
  propreUrl: string,
  zones: ZoneBurn[],
): Promise<string> {
  await assurerPoliceTikTok();
  const img = await chargerImage(propreUrl);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const family = '"TikTok Sans", "Arial Black", Impact, sans-serif';
  for (const z of zones) {
    const texte = (z.texte ?? "").trim();
    if (!texte) continue;
    const x = z.x * canvas.width;
    const y = z.y * canvas.height;
    const w = z.w * canvas.width;
    const h = z.h * canvas.height;
    const padX = w * 0.04;
    const padY = h * 0.06;
    const { size, lines } = fitFontSize(
      ctx,
      texte,
      Math.max(8, w - padX * 2),
      Math.max(8, h - padY * 2),
      family,
    );
    const lineH = size * 1.15;
    const blockH = lines.length * lineH;
    let cy = y + (h - blockH) / 2 + lineH * 0.8;
    const cx = x + w / 2;
    const fill = z.couleur || "#FFFFFF";
    const stroke = contrasteStroke(fill);

    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 ${size}px ${family}`;
    ctx.lineJoin = "round";

    for (const line of lines) {
      if (z.ombre) {
        ctx.lineWidth = Math.max(2, size * 0.14);
        ctx.strokeStyle = stroke;
        ctx.strokeText(line, cx, cy);
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = size * 0.15;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = size * 0.04;
      } else {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = fill;
      ctx.fillText(line, cx, cy);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      cy += lineH;
    }
  }

  return canvas.toDataURL("image/jpeg", 0.92);
}

function chargerImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Chargement image échoué: ${url.slice(0, 80)}`));
    img.src = url;
  });
}
