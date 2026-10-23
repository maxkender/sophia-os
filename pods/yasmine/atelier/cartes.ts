// Les cartes d'applis de « my favorite productivity apps » : sur l'écran
// blanc de l'iPad des cartes, l'icône et le nom de l'appli, puis deux
// paragraphes courts. Mesuré sur ses slides (repère de l'écran, 0..632 × 0..906).

import { type Image } from "@napi-rs/canvas";
import { type Ctx, rectArrondi } from "./dessin.ts";
import { POLICE } from "./polices.ts";

export type Carte = {
  /** Le nom de l'appli, tel que sur l'App Store (« micabo » en minuscules). */
  nom: string;
  /** L'icône, chemin depuis le dossier du pod (carrée). */
  icone: string;
  /** Les lignes du texte, coupées à la main comme les siennes ; "" sépare deux paragraphes. */
  lignes: string[];
  /** 44 à 48 px chez elle, selon la longueur. */
  taille?: number;
};

const ENCRE = "#323232";

/** Une carte d'appli, dessinée dans le repère de l'écran de l'iPad des cartes. */
export function carte(ctx: Ctx, c: Carte, icone: Image) {
  // L'icône : 168 px, coins arrondis d'iOS (22,4 %), en haut à gauche.
  const ix = 44;
  const iy = 46;
  const t = 168;
  ctx.save();
  rectArrondi(ctx, ix, iy, t, t, Math.round(t * 0.224));
  ctx.clip();
  ctx.drawImage(icone, ix, iy, t, t);
  ctx.restore();
  // Le cadre très fin des icônes claires sur fond blanc.
  ctx.save();
  rectArrondi(ctx, ix + 0.5, iy + 0.5, t - 1, t - 1, Math.round(t * 0.224));
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  // Le nom, centré dans la place à droite de l'icône, sur l'axe de l'icône.
  ctx.save();
  ctx.fillStyle = ENCRE;
  ctx.textBaseline = "alphabetic";
  let tn = 57;
  ctx.font = `${tn}px "${POLICE.modele}"`;
  const place = 632 - (ix + t) - 40;
  while (ctx.measureText(c.nom).width > place && tn > 36) ctx.font = `${--tn}px "${POLICE.modele}"`;
  ctx.textAlign = "center";
  ctx.fillText(c.nom, (ix + t + 632) / 2 + 2, iy + t / 2 + Math.round(tn * 0.36));
  // Le texte : un bloc calé à gauche, centré dans l'écran, à partir de y 320.
  const taille = c.taille ?? 48;
  ctx.font = `${taille}px "${POLICE.modele}"`;
  ctx.textAlign = "left";
  const largeur = Math.max(...c.lignes.map((l) => ctx.measureText(l).width));
  if (largeur > 540) throw new Error(`carte ${c.nom} : une ligne déborde (${Math.round(largeur)} px)`);
  const x = Math.round((632 - largeur) / 2);
  const interligne = Math.round(taille * 1.3);
  const y0 = 285 + Math.round(taille * 0.727);
  const bas = y0 + (c.lignes.length - 1) * interligne;
  if (bas > 860) throw new Error(`carte ${c.nom} : le texte déborde en bas (${bas})`);
  c.lignes.forEach((l, i) => l && ctx.fillText(l, x, y0 + i * interligne));
  ctx.restore();
}
