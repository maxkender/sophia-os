// Un remake (posts/<id>.json) et le rendu de ses slides, langue par langue.

import { createCanvas, type Image, loadImage } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ipad, iphone } from "./appareils.ts";
import { type Cadrage, type Couverture, fond, H, L, legende, titreCouverture } from "./dessin.ts";
import { retirerMetadonnees } from "./metadonnees.ts";
import { type Etiquettes, type Modele, modele, page, type Page } from "./notes.ts";

export type Langue = string;

/** Le contenu d'une slide dans une langue. */
export type ContenuSlide = {
  /** Couverture : le titre. */
  couverture?: Couverture;
  /** Légende jaune au-dessus de l'appareil (une chaîne par ligne). */
  haut?: string[];
  /** Légende jaune au-dessous. */
  bas?: string[];
  /** iPad : un modèle vide et ses étiquettes… */
  modele?: Modele;
  etiquettes?: Etiquettes;
  /** … ou une page de notes remplie. */
  page?: Page;
  /** iPhone : la capture d'écran de l'appli, chemin depuis le dossier du pod. */
  capture?: string;
};

export type Slide = {
  type: "couverture" | "ipad" | "iphone";
  /** La slide de l'appli (une seule par deck, jamais la couverture). */
  app?: boolean;
} & Record<Langue, ContenuSlide | string | boolean | undefined>;

export type Post = {
  /** Notre id : yp-001, yp-002… */
  id: string;
  /** Le post refait. */
  source: { url: string; vues: number; enregistrements?: number; publie_le: string; titre: string };
  /** L'accroche, dans la langue source du dépôt (lue par l'OS comme le hook). */
  titre: Record<Langue, string>;
  /** La légende TikTok de chaque langue, hashtags compris. */
  legendes: Record<Langue, string>;
  musique: { titre: string | null; url: string | null };
  /** La photo de fond (banque de l'OS) et son cadrage. */
  fond: { media_id: string; url: string; cadrage?: Cadrage };
  slides: Slide[];
  notes?: string;
};

export const RACINE = join(import.meta.dirname, "..");

export function lirePost(id: string): Post {
  return JSON.parse(readFileSync(join(RACINE, "posts", `${id}.json`), "utf8")) as Post;
}

export function contenu(s: Slide, langue: Langue): ContenuSlide {
  const c = s[langue];
  if (!c || typeof c !== "object") throw new Error(`slide ${s.type} : rien en ${langue}`);
  return c as ContenuSlide;
}

/** Les langues écrites pour TOUTES les slides du post. */
export function languesCompletes(p: Post): Langue[] {
  const toutes = new Set(p.slides.flatMap((s) => Object.keys(s).filter((k) => k !== "type" && k !== "app")));
  return [...toutes].filter((l) => p.slides.every((s) => typeof s[l] === "object") && p.titre[l] && p.legendes[l]);
}

/** La photo de fond, gardée en cache dans donnees/fonds/. */
export async function chargerFond(p: Post): Promise<Image> {
  const chemin = join(RACINE, "donnees", "fonds", `${p.fond.media_id}.jpg`);
  if (!existsSync(chemin)) {
    mkdirSync(dirname(chemin), { recursive: true });
    const r = await fetch(p.fond.url);
    if (!r.ok) throw new Error(`fond ${p.fond.media_id} : HTTP ${r.status}`);
    writeFileSync(chemin, Buffer.from(await r.arrayBuffer()));
  }
  return loadImage(chemin);
}

/** Assombrissement des slides intérieures, mesuré sur les siennes (× 0,71). */
const ASSOMBRIR = 0.29;

/** Rend une slide en JPEG sans métadonnées. */
export async function rendreSlide(p: Post, s: Slide, langue: Langue, photo: Image): Promise<Buffer> {
  const c = contenu(s, langue);
  const canvas = createCanvas(L, H);
  const ctx = canvas.getContext("2d");
  if (s.type === "couverture") {
    if (!c.couverture) throw new Error("couverture sans titre");
    fond(ctx, photo, p.fond.cadrage);
    titreCouverture(ctx, c.couverture);
  } else if (s.type === "ipad") {
    fond(ctx, photo, p.fond.cadrage, ASSOMBRIR);
    legende(ctx, c.haut ?? [], { bas: 322 }, 42);
    ipad(ctx, (e) => {
      if (c.page) page(e, c.page);
      else if (c.modele) modele(e, c.modele, c.etiquettes);
      else throw new Error("slide iPad sans modèle ni page");
    });
    legende(ctx, c.bas ?? [], { haut: 1517 }, 48);
  } else {
    if (!c.capture) throw new Error("slide iPhone sans capture");
    fond(ctx, photo, p.fond.cadrage, ASSOMBRIR);
    legende(ctx, c.haut ?? [], { bas: 300 }, 42);
    const b = iphone(ctx, await loadImage(join(RACINE, c.capture)), { haut: 352, largeur: 540 });
    legende(ctx, c.bas ?? [], { haut: b.y + b.h + 84 }, 44);
  }
  return retirerMetadonnees(canvas.toBuffer("image/jpeg", 93));
}
