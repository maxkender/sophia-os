// Un remake (posts/<id>.json) et le rendu de ses slides, langue par langue.

import { createCanvas, type Image, loadImage } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { IPAD_CARTE, ipad, iphone } from "./appareils.ts";
import { type Carte, carte } from "./cartes.ts";
import { type EcranPhoto, gabaritIpadPaysage, incruster, pleinEcran } from "./ecran-photo.ts";
import { type NoteIos, noteIos } from "./note-ios.ts";
import { type Cadrage, type Couverture, fond, H, L, legende, legendePhoto, type LegendePhoto, titreCouverture } from "./dessin.ts";
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
  /** Slide photo : la petite légende posée sur la photo, et une seconde (sous l'iPhone). */
  legende?: LegendePhoto;
  legende_bas?: LegendePhoto;
  /** Note de l'app Notes posée sur la photo (« things i do to SMASH EVERY EXAM »), ou plusieurs (« school tips »). */
  note?: NoteIos;
  notes?: NoteIos[];
  /** Carte d'appli dans l'iPad blanc (« my favorite productivity apps »). */
  carte?: Carte;
  /** Slide photo avec l'iPhone : où le poser (centre, haut, largeur de l'écran). */
  iphone?: { cx?: number; haut?: number; largeur?: number };
};

/** Une photo de la banque de l'OS et son cadrage ; `ecrans` y incruste des captures de micabo. */
export type Photo = { media_id: string; url: string; cadrage?: Cadrage; ecrans?: EcranPhoto[] };

export type Slide = {
  /** photo : une photo pleine par slide, petite légende (« after school routine »). */
  /** carte : une carte d'appli dans l'iPad blanc, sur la photo assombrie (« my favorite productivity apps »). */
  type: "couverture" | "ipad" | "iphone" | "photo" | "carte";
  /** La slide de l'appli (une seule par deck, jamais la couverture). */
  app?: boolean;
  /** Sa propre photo (slides photo, et couverture d'un post photo) ; sinon le `fond` du post. */
  photo?: Photo;
} & Record<Langue, ContenuSlide | Photo | string | boolean | undefined>;

/** Les clés d'une slide qui ne sont pas des langues. */
const CLES = new Set(["type", "app", "photo"]);

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
  fond: Photo;
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
  const toutes = new Set(p.slides.flatMap((s) => Object.keys(s).filter((k) => !CLES.has(k))));
  return [...toutes].filter((l) => p.slides.every((s) => typeof s[l] === "object") && p.titre[l] && p.legendes[l]);
}

/** Une photo de la banque, gardée en cache dans donnees/fonds/. */
export async function chargerPhoto(photo: Photo): Promise<Image> {
  const chemin = join(RACINE, "donnees", "fonds", `${photo.media_id}.jpg`);
  if (!existsSync(chemin)) {
    mkdirSync(dirname(chemin), { recursive: true });
    const r = await fetch(photo.url);
    if (!r.ok) throw new Error(`photo ${photo.media_id} : HTTP ${r.status}`);
    writeFileSync(chemin, Buffer.from(await r.arrayBuffer()));
  }
  return loadImage(chemin);
}

/** La photo d'une slide, avec les captures incrustées dans ses écrans. */
async function photoSlide(photo: Photo): Promise<Image> {
  const img = await chargerPhoto(photo);
  if (!photo.ecrans?.length) return img;
  let c = null;
  for (const e of photo.ecrans) {
    const capture = await loadImage(join(RACINE, e.capture));
    const contenu = e.gabarit === "ipad-paysage" ? gabaritIpadPaysage(capture) : pleinEcran(capture);
    c = incruster(c ?? img, e, contenu.getContext("2d").getImageData(0, 0, contenu.width, contenu.height));
  }
  return loadImage(c!.toBuffer("image/png"));
}

/** La photo de fond du post. */
export function chargerFond(p: Post): Promise<Image> {
  return chargerPhoto(p.fond);
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
    if (s.photo) fond(ctx, await chargerPhoto(s.photo), s.photo.cadrage);
    else fond(ctx, photo, p.fond.cadrage);
    titreCouverture(ctx, c.couverture);
  } else if (s.type === "photo") {
    // Une photo pleine, sans assombrir, comme les siennes ; la légende par-dessus.
    if (!s.photo) throw new Error("slide photo sans photo");
    if (!c.legende && !c.note && !c.notes?.length) throw new Error("slide photo sans légende ni note");
    fond(ctx, await photoSlide(s.photo), s.photo.cadrage);
    for (const n of [...(c.note ? [c.note] : []), ...(c.notes ?? [])]) noteIos(ctx, n);
    if (c.capture) iphone(ctx, await loadImage(join(RACINE, c.capture)), { haut: 352, largeur: 540, ...c.iphone });
    if (c.legende) legendePhoto(ctx, c.legende);
    if (c.legende_bas) legendePhoto(ctx, c.legende_bas);
  } else if (s.type === "carte") {
    if (!c.carte) throw new Error("slide carte sans carte");
    const icone = await loadImage(join(RACINE, c.carte.icone));
    fond(ctx, photo, p.fond.cadrage, ASSOMBRIR);
    ipad(ctx, (e) => carte(e, c.carte!, icone), IPAD_CARTE);
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
