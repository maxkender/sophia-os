// Ce qui se dessine sur l'écran de l'iPad : les modèles de prise de notes
// (cadres et étiquettes de ses slides) et les notes remplies, écrites à la
// main façon GoodNotes. Repère : l'écran, 0..696 × 0..997.

import { COULEUR, type Ctx, rectArrondi } from "./dessin.ts";
import { POLICE } from "./polices.ts";

export type Modele = "base" | "cornell" | "blocs" | "carte";

/** Les étiquettes d'un modèle, dans la langue du deck. */
export type Etiquettes = {
  titre: string;
  /** base : les 3 cadres ; carte : les 4 bulles. */
  notions?: string[];
  /** cornell : la colonne (écrite à la verticale), le centre, le bas. */
  colonne?: string;
  principal?: string;
  resume?: string;
  /** blocs : les 4 cadres. */
  blocs?: [string, string, string, string];
};

const TRAIT = "#262626";
const ENCRE = "#1f1f1f";

/** Un cadre à angles droits, trait fin. */
function cadre(ctx: Ctx, x: number, y: number, l: number, h: number) {
  ctx.save();
  ctx.strokeStyle = TRAIT;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x + 0.5, y + 0.5, l, h);
  ctx.restore();
}

function etiquette(ctx: Ctx, texte: string, x: number, y: number, taille = 38, align: "left" | "center" | "right" = "center") {
  ctx.save();
  ctx.font = `${taille}px "${POLICE.modele}"`;
  ctx.fillStyle = COULEUR.marine;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(texte, x, y);
  ctx.restore();
}

/** Une flèche fine (trait + pointe), droite ou courbée. */
export function fleche(
  ctx: Ctx,
  de: [number, number],
  a: [number, number],
  o: { couleur?: string; courbe?: number; epaisseur?: number; pointe?: number } = {},
) {
  const [x1, y1] = de;
  const [x2, y2] = a;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const d = Math.hypot(x2 - x1, y2 - y1) || 1;
  // Point de contrôle décalé perpendiculairement (courbe > 0 : vers la gauche du trajet).
  const k = o.courbe ?? 0;
  const cx = mx - ((y2 - y1) / d) * k;
  const cy = my + ((x2 - x1) / d) * k;
  ctx.save();
  ctx.strokeStyle = o.couleur ?? ENCRE;
  ctx.lineWidth = o.epaisseur ?? 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo(cx, cy, x2, y2);
  ctx.stroke();
  // La pointe suit la tangente d'arrivée.
  const ang = Math.atan2(y2 - cy, x2 - cx);
  const p = o.pointe ?? 7;
  ctx.beginPath();
  ctx.moveTo(x2 - p * Math.cos(ang - 0.5), y2 - p * Math.sin(ang - 0.5));
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - p * Math.cos(ang + 0.5), y2 - p * Math.sin(ang + 0.5));
  ctx.stroke();
  ctx.restore();
}

/** Un lien de carte mentale : courbe fine terminée par une petite pointe. */
function lien(ctx: Ctx, de: [number, number], c1: [number, number], c2: [number, number], a: [number, number]) {
  ctx.save();
  ctx.strokeStyle = TRAIT;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(...de);
  ctx.bezierCurveTo(...c1, ...c2, ...a);
  ctx.stroke();
  const ang = Math.atan2(a[1] - c2[1], a[0] - c2[0]);
  ctx.beginPath();
  ctx.moveTo(a[0] - 5 * Math.cos(ang - 0.6), a[1] - 5 * Math.sin(ang - 0.6));
  ctx.lineTo(...a);
  ctx.lineTo(a[0] - 5 * Math.cos(ang + 0.6), a[1] - 5 * Math.sin(ang + 0.6));
  ctx.stroke();
  ctx.restore();
}

function pilule(ctx: Ctx, x: number, y: number, l: number, h: number, fond = "#ffffff") {
  ctx.save();
  rectArrondi(ctx, x, y, l, h, Math.min(h / 2, 40));
  ctx.fillStyle = fond;
  ctx.fill();
  ctx.strokeStyle = TRAIT;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.restore();
}

/** Le cadre du titre, commun aux trois modèles en cadres. */
const BOITE_TITRE = { x: 25, y: 24, l: 649, h: 72 } as const;

/**
 * Un modèle de prise de notes, mesuré sur ses slides. Sans `e` : les cadres
 * seuls (pour une page remplie qui garde la structure du modèle).
 */
export function modele(ctx: Ctx, m: Modele, e?: Etiquettes) {
  if (m === "carte") return carteMentale(ctx, e);
  cadre(ctx, BOITE_TITRE.x, BOITE_TITRE.y, BOITE_TITRE.l, BOITE_TITRE.h);
  if (e) etiquette(ctx, e.titre, 348, 76, 39);
  if (m === "base") {
    const cadres = [
      [125, 270],
      [424, 259],
      [712, 254],
    ] as const;
    cadres.forEach(([y, h], i) => {
      cadre(ctx, 25, y, 649, h);
      if (e?.notions?.[i]) etiquette(ctx, e.notions[i], 50, y + 69, 38, "left");
    });
  } else if (m === "cornell") {
    ctx.save();
    ctx.strokeStyle = TRAIT;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(137.5, 96);
    ctx.lineTo(137.5, 842);
    ctx.stroke();
    ctx.restore();
    cadre(ctx, 25, 842, 649, 131);
    if (e) {
      ctx.save();
      ctx.translate(83, 469);
      ctx.rotate(-Math.PI / 2);
      etiquette(ctx, e.colonne ?? "", 0, 0, 30);
      ctx.restore();
      etiquette(ctx, e.principal ?? "", 406, 473, 39);
      etiquette(ctx, e.resume ?? "", 348, 920, 31);
    }
  } else if (m === "blocs") {
    const cadres = [
      [25, 121, 377, 211],
      [428, 121, 246, 211],
      [25, 357, 649, 211],
      [25, 593, 649, 373],
    ] as const;
    cadres.forEach(([x, y, l, h], i) => {
      cadre(ctx, x, y, l, h);
      const t = e?.blocs?.[i];
      if (t) etiquette(ctx, t, x + l / 2, y + h / 2 + 12, i < 2 ? 32 : 34);
    });
  }
}

/** Le modèle « carte mentale » : un titre rose, quatre notions, des bulles vides. */
function carteMentale(ctx: Ctx, e?: Etiquettes) {
  lien(ctx, [138, 272], [98, 230], [92, 160], [94, 130]);
  lien(ctx, [198, 272], [230, 240], [250, 210], [254, 182]);
  lien(ctx, [530, 272], [560, 240], [580, 200], [586, 158]);
  lien(ctx, [244, 463], [205, 450], [172, 405], [168, 362]);
  lien(ctx, [444, 455], [480, 440], [520, 405], [529, 362]);
  lien(ctx, [248, 541], [200, 556], [168, 586], [167, 620]);
  lien(ctx, [444, 541], [490, 552], [528, 580], [529, 620]);
  lien(ctx, [131, 709], [134, 750], [130, 784], [112, 803]);
  lien(ctx, [210, 709], [232, 752], [268, 790], [302, 803]);
  pilule(ctx, 38, 79, 112, 50);
  pilule(ctx, 225, 131, 112, 50);
  pilule(ctx, 530, 107, 112, 50);
  pilule(ctx, 55, 804, 112, 50);
  pilule(ctx, 269, 804, 112, 50);
  pilule(ctx, 243, 444, 211, 108, "#fce4f3");
  if (e) etiquette(ctx, e.titre, 348, 510, 32);
  const notions: [number, number][] = [
    [95, 274],
    [457, 274],
    [95, 621],
    [457, 621],
  ];
  notions.forEach(([x, y], i) => {
    pilule(ctx, x, y, 146, 87);
    if (e?.notions?.[i]) etiquette(ctx, e.notions[i], x + 73, y + 55, 31);
  });
}

// ---------------------------------------------------------------------------
// Les notes remplies : une petite langue de dessin, écrite dans posts/<id>.json
// ---------------------------------------------------------------------------

/** Un bout de texte d'une ligne écrite à la main ; `{ "fleche": true }` dessine une petite flèche (la police n'a pas « → »). */
export type Morceau =
  | string
  | { fleche: true; couleur?: string }
  | {
      texte: string;
      /** Surligneur : `true` = le jaune de ses notes, sinon une couleur. */
      surligne?: boolean | string;
      couleur?: string;
      /** En indice (CO₂) ou en exposant (H⁺). */
      indice?: boolean;
      exposant?: boolean;
      souligne?: boolean;
    };

export type Ecrit =
  /** Un titre en capitales, avec le trait de surligneur qui file à droite. */
  | { t: "titre"; x: number; y: number; texte: string; taille?: number; barre?: boolean | string; couleur?: string }
  /** Un sous-titre en couleur (le jaune de ses notes par défaut). */
  | { t: "sous-titre"; x: number; y: number; texte: string; taille?: number; couleur?: string; souligne?: boolean }
  /** Une ligne, avec une flèche ou un point devant. */
  | { t: "ligne"; x: number; y: number; morceaux: Morceau[]; taille?: number; puce?: "fleche" | "point"; couleur?: string }
  /** Du texte libre, aligné, éventuellement tourné (degrés). */
  | {
      t: "texte";
      x: number;
      y: number;
      morceaux: Morceau[];
      taille?: number;
      align?: "gauche" | "centre" | "droite";
      rotation?: number;
      couleur?: string;
      /** Trait repassé, comme ses titres. */
      gras?: boolean;
    }
  | { t: "boite"; x: number; y: number; l: number; h: number; couleur?: string; epaisseur?: number; r?: number; fond?: string }
  | { t: "fleche"; de: [number, number]; a: [number, number]; couleur?: string; courbe?: number; epaisseur?: number }
  /** Une bulle de carte mentale, avec une ou plusieurs lignes centrées. */
  | { t: "bulle"; x: number; y: number; l: number; h: number; lignes?: Morceau[][]; fond?: string; taille?: number; couleur?: string }
  /** Un tracé libre (triangle, schéma) ; `fond` le remplit. */
  | { t: "trait"; points: [number, number][]; couleur?: string; epaisseur?: number; ferme?: boolean; fond?: string }
  | { t: "ellipse"; cx: number; cy: number; rx: number; ry: number; couleur?: string; epaisseur?: number; fond?: string }
  /** Un arc de cercle (angle d'un triangle), en degrés. */
  | { t: "arc"; cx: number; cy: number; r: number; de: number; a: number; couleur?: string; epaisseur?: number };

export type Page = {
  /** Les cadres du modèle, sous les notes (sans ses étiquettes). */
  modele?: Modele;
  ecrits: Ecrit[];
};

/** Les couleurs d'encre de ses notes. */
export const ENCRES: Record<string, string> = {
  noir: ENCRE,
  jaune: "#e9c443",
  rose: "#e5739d",
  bleu: "#3d86c6",
  vert: "#4f9e6a",
  gris: "#8a8a8a",
};
const encre = (c: string | undefined, defaut = ENCRE) => (c ? (ENCRES[c] ?? c) : defaut);

/** Écrit des morceaux à partir de (x, y) ; rend le x de fin. */
function ecrireMorceaux(ctx: Ctx, x: number, y: number, morceaux: Morceau[], taille: number, couleur: string, gras = false): number {
  let cx = x;
  for (const m of morceaux) {
    if (typeof m !== "string" && "fleche" in m) {
      const l = taille * 0.9;
      fleche(ctx, [cx + taille * 0.12, y - taille * 0.32], [cx + l, y - taille * 0.32], { couleur: encre(m.couleur, couleur), pointe: taille * 0.26, epaisseur: 1.5 });
      cx += l + taille * 0.18;
      continue;
    }
    const o = typeof m === "string" ? { texte: m } : m;
    const petit = o.indice || o.exposant;
    const t = petit ? Math.round(taille * 0.64) : taille;
    const dy = o.indice ? taille * 0.2 : o.exposant ? -taille * 0.42 : 0;
    ctx.font = `${t}px "${POLICE.main}"`;
    const l = ctx.measureText(o.texte).width;
    if (o.surligne) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      rectArrondi(ctx, cx - 3, y - taille * 0.74, l + 6, taille * 0.94, 5);
      ctx.fillStyle = o.surligne === true ? COULEUR.surligneur : encre(o.surligne);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = encre(o.couleur, couleur);
    ctx.fillText(o.texte, cx, y + dy);
    if (gras) {
      ctx.strokeStyle = encre(o.couleur, couleur);
      ctx.lineWidth = 0.8;
      ctx.strokeText(o.texte, cx, y + dy);
    }
    if (o.souligne) {
      ctx.save();
      ctx.strokeStyle = encre(o.couleur, couleur);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(cx, y + 4);
      ctx.lineTo(cx + l, y + 4);
      ctx.stroke();
      ctx.restore();
    }
    cx += l;
  }
  return cx;
}

function largeurMorceaux(ctx: Ctx, morceaux: Morceau[], taille: number) {
  let l = 0;
  for (const m of morceaux) {
    if (typeof m !== "string" && "fleche" in m) {
      l += taille * 1.08;
      continue;
    }
    const o = typeof m === "string" ? { texte: m } : m;
    ctx.font = `${o.indice || o.exposant ? Math.round(taille * 0.64) : taille}px "${POLICE.main}"`;
    l += ctx.measureText(o.texte).width;
  }
  return l;
}

/** Les notes remplies d'une page. */
export function page(ctx: Ctx, p: Page) {
  if (p.modele) modele(ctx, p.modele);
  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  for (const e of p.ecrits) {
    switch (e.t) {
      case "titre": {
        const t = e.taille ?? 30;
        ctx.font = `${t}px "${POLICE.main}"`;
        ctx.fillStyle = encre(e.couleur);
        // Ses titres sont plus appuyés : on repasse le trait.
        ctx.strokeStyle = encre(e.couleur);
        ctx.lineWidth = 0.9;
        ctx.letterSpacing = "1px";
        ctx.fillText(e.texte, e.x, e.y);
        ctx.strokeText(e.texte, e.x, e.y);
        const fin = e.x + ctx.measureText(e.texte).width;
        ctx.letterSpacing = "0px";
        if (e.barre !== false) {
          ctx.save();
          rectArrondi(ctx, fin + 12, e.y - t * 0.62, 662 - fin - 12, t * 0.42, t * 0.21);
          ctx.fillStyle = typeof e.barre === "string" ? encre(e.barre) : COULEUR.surligneur;
          ctx.fill();
          ctx.restore();
        }
        break;
      }
      case "sous-titre": {
        const t = e.taille ?? 23;
        ctx.font = `${t}px "${POLICE.main}"`;
        ctx.fillStyle = encre(e.couleur, ENCRES.jaune);
        ctx.letterSpacing = "0.8px";
        ctx.fillText(e.texte, e.x, e.y);
        if (e.souligne) {
          ctx.strokeStyle = encre(e.couleur, ENCRES.jaune);
          ctx.lineWidth = 1.3;
          ctx.beginPath();
          ctx.moveTo(e.x, e.y + 5);
          ctx.lineTo(e.x + ctx.measureText(e.texte).width, e.y + 5);
          ctx.stroke();
        }
        ctx.letterSpacing = "0px";
        break;
      }
      case "ligne": {
        const t = e.taille ?? 20;
        const couleur = encre(e.couleur);
        let x = e.x;
        if (e.puce === "fleche") {
          fleche(ctx, [x, e.y - t * 0.32], [x + 15, e.y - t * 0.32], { couleur, pointe: 5, epaisseur: 1.5 });
          x += 23;
        } else if (e.puce === "point") {
          ctx.beginPath();
          ctx.arc(x + 3, e.y - t * 0.3, 2.6, 0, Math.PI * 2);
          ctx.fillStyle = couleur;
          ctx.fill();
          x += 12;
        }
        ecrireMorceaux(ctx, x, e.y, e.morceaux, t, couleur);
        break;
      }
      case "texte": {
        const t = e.taille ?? 20;
        const l = largeurMorceaux(ctx, e.morceaux, t);
        ctx.save();
        ctx.translate(e.x, e.y);
        if (e.rotation) ctx.rotate((e.rotation * Math.PI) / 180);
        const x0 = e.align === "centre" ? -l / 2 : e.align === "droite" ? -l : 0;
        ecrireMorceaux(ctx, x0, 0, e.morceaux, t, encre(e.couleur), e.gras);
        ctx.restore();
        break;
      }
      case "boite": {
        ctx.save();
        rectArrondi(ctx, e.x, e.y, e.l, e.h, e.r ?? 0);
        if (e.fond) {
          ctx.fillStyle = encre(e.fond);
          ctx.fill();
        }
        ctx.strokeStyle = encre(e.couleur, ENCRES.jaune);
        ctx.lineWidth = e.epaisseur ?? 2;
        ctx.stroke();
        ctx.restore();
        break;
      }
      case "fleche":
        fleche(ctx, e.de, e.a, { couleur: encre(e.couleur), courbe: e.courbe, epaisseur: e.epaisseur });
        break;
      case "bulle": {
        const t = e.taille ?? 19;
        ctx.save();
        rectArrondi(ctx, e.x, e.y, e.l, e.h, Math.min(e.h / 2, 30));
        ctx.fillStyle = e.fond ? encre(e.fond) : "#ffffff";
        ctx.fill();
        ctx.strokeStyle = encre(e.couleur, "#e5739d");
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
        const lignes = e.lignes ?? [];
        const interligne = t * 1.12;
        const y0 = e.y + e.h / 2 - ((lignes.length - 1) * interligne) / 2 + t * 0.32;
        lignes.forEach((m, i) => {
          const l = largeurMorceaux(ctx, m, t);
          ecrireMorceaux(ctx, e.x + e.l / 2 - l / 2, y0 + i * interligne, m, t, ENCRE);
        });
        break;
      }
      case "trait": {
        ctx.save();
        ctx.beginPath();
        e.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        if (e.ferme) ctx.closePath();
        if (e.fond) {
          ctx.fillStyle = encre(e.fond);
          ctx.fill();
        }
        ctx.strokeStyle = encre(e.couleur);
        ctx.lineWidth = e.epaisseur ?? 1.6;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
        break;
      }
      case "ellipse": {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
        if (e.fond) {
          ctx.fillStyle = encre(e.fond);
          ctx.fill();
        }
        ctx.strokeStyle = encre(e.couleur);
        ctx.lineWidth = e.epaisseur ?? 1.6;
        ctx.stroke();
        ctx.restore();
        break;
      }
      case "arc": {
        ctx.save();
        ctx.beginPath();
        ctx.arc(e.cx, e.cy, e.r, (e.de * Math.PI) / 180, (e.a * Math.PI) / 180, e.a < e.de);
        ctx.strokeStyle = encre(e.couleur);
        ctx.lineWidth = e.epaisseur ?? 1.6;
        ctx.stroke();
        ctx.restore();
        break;
      }
    }
  }
  ctx.restore();
}
