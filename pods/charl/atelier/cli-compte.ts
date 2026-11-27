// Usage :
//   npm run compte                      découpe les photos de ses slides (donnees/cache/tt_*.jpg, relevées par `npm run veille`)
//   npm run compte -- --garder <case> <nom>   garde une case dans images/photos/c-<nom>.jpg (réencodée sans métadonnées)
//
// Les images de @charl.focus (Adrien, 27/11 : on peut reprendre ses images, célébrités comprises).
// Ses slides : la couverture en six cases, puis des photos à droite ou en bas, à des places qui varient. Pour chaque slide en
// cache : les six cases de la couverture, puis sur les autres slides chaque bloc plein (une photo, pas une ligne de texte) :
// sortie/compte/<case>.jpg et les planches sortie/compte/planche-<n>.jpg, à REGARDER avec Read.
// Le nom d'une case : <id du post>_<slide>_<cadre> (couv0…couv5 sur la couverture, p0, p1… ailleurs).
// Jamais une image de lui sur la slide Sophia si une personne y est reconnaissable (pods/ROUTINE.md §4).
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { retirerMetadonnees } from "./metadonnees.ts";

const RACINE = join(import.meta.dirname, "..");
const CACHE = join(RACINE, "donnees", "cache");
const SORTIE = join(RACINE, "sortie", "compte");
const args = process.argv.slice(2);

if (args[0] === "--garder") {
  const [, cas, nom] = args;
  if (!cas || !nom || !/^[a-z0-9-]{2,50}$/.test(nom)) throw new Error("usage : compte --garder <case> <nom-en-minuscules>");
  const src = join(SORTIE, `${cas}.jpg`);
  if (!existsSync(src)) throw new Error(`case introuvable : ${src} (lance d'abord npm run compte)`);
  const dst = join(RACINE, "images", "photos", `c-${nom}.jpg`);
  copyFileSync(src, dst);
  console.log(`${cas} → images/photos/c-${nom}.jpg`);
  process.exit(0);
}

type R = { nom: string; x: number; y: number; l: number; h: number };
// La couverture (slide 1) : ses six cases mesurées (360 × 330, y = 0 et 750).
const COUV: R[] = [
  ...[0, 360, 720].map((x, i) => ({ nom: `couv${i}`, x, y: 0, l: 360, h: 330 })),
  ...[0, 360, 720].map((x, i) => ({ nom: `couv${i + 3}`, x, y: 750, l: 360, h: 330 })),
];
const C = 6; // les autres slides : une grille de 6 px, puis les blocs pleins (une photo), pas les lignes de texte.
function photos(ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>): R[] {
  const n = 1080 / C, d = ctx.getImageData(0, 0, 1080, 1080).data;
  const on = new Uint8Array(n * n);
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
    let c = 0;
    for (let y = gy * C; y < gy * C + C; y += 2) for (let x = gx * C; x < gx * C + C; x += 2) {
      const i = (y * 1080 + x) * 4;
      if ((d[i] + d[i + 1] + d[i + 2]) / 3 > 16) c++;
    }
    on[gy * n + gx] = c >= 3 ? 1 : 0;
  }
  const vu = new Uint8Array(n * n), out: R[] = [];
  for (let s = 0; s < n * n; s++) {
    if (!on[s] || vu[s]) continue;
    const pile = [s]; vu[s] = 1; let x0 = n, y0 = n, x1 = 0, y1 = 0, k = 0;
    while (pile.length) {
      const p = pile.pop()!, x = p % n, y = (p - x) / n; k++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const q of [p - 1, p + 1, p - n, p + n]) if (q >= 0 && q < n * n && Math.abs((q % n) - x) <= 1 && on[q] && !vu[q]) { vu[q] = 1; pile.push(q); }
    }
    const l = x1 - x0 + 1, h = y1 - y0 + 1;
    if (l >= 25 && h >= 25 && k / (l * h) >= 0.6) out.push({ nom: "", x: x0 * C, y: y0 * C, l: l * C, h: h * C });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x).map((r, i) => ({ ...r, nom: `p${i}` }));
}

mkdirSync(SORTIE, { recursive: true });
const slides = readdirSync(CACHE).filter((f) => /^tt_\d+_\d+\.jpg$/.test(f)).sort();
const gardees: string[] = [];
for (const f of slides) {
  const img = await loadImage(join(CACHE, f));
  const c = createCanvas(1080, Math.round((img.height * 1080) / img.width));
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  if (Math.abs(c.height - 1080) > 8) continue; // son gabarit carré seulement
  const couverture = /_1\.jpg$/.test(f);
  for (const r of couverture ? COUV : photos(ctx)) {
    const nom = `${f.replace(/^tt_/, "").replace(/\.jpg$/, "")}_${r.nom}`;
    const o = createCanvas(r.l, r.h);
    o.getContext("2d").drawImage(c, r.x, r.y, r.l, r.h, 0, 0, r.l, r.h);
    writeFileSync(join(SORTIE, `${nom}.jpg`), retirerMetadonnees(o.toBuffer("image/jpeg", 92)));
    gardees.push(nom);
  }
}
// Les planches : 24 cases par planche, le nom sous chaque case.
const P = 24, W = 300, H = 300;
for (let p = 0; p * P < gardees.length; p++) {
  const lot = gardees.slice(p * P, p * P + P);
  const c = createCanvas(6 * W, Math.ceil(lot.length / 6) * (H + 26));
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#222"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = "15px sans-serif";
  for (const [i, nom] of lot.entries()) {
    const im = await loadImage(join(SORTIE, `${nom}.jpg`));
    const s = Math.min(W / im.width, H / im.height);
    const x = (i % 6) * W, y = Math.floor(i / 6) * (H + 26);
    ctx.drawImage(im, x, y + 22, im.width * s - 4, im.height * s - 4);
    ctx.fillStyle = "#ff0"; ctx.fillText(nom, x + 3, y + 16);
  }
  writeFileSync(join(SORTIE, `planche-${p + 1}.jpg`), c.toBuffer("image/jpeg", 85));
}
console.log(`${slides.length} slides → ${gardees.length} cases → sortie/compte/ (${Math.ceil(gardees.length / P)} planches)`);
