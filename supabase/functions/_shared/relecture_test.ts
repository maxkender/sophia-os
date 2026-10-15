import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  agreger,
  type BlocTexte,
  choisirPositions,
  controlesPost,
  familleCouleur,
  idMusique,
  jugerPaire,
  type MesureSlide,
  parserMesure,
  redigerBrouillon,
} from "./relecture.ts";

function bloc(p: Partial<BlocTexte>): BlocTexte {
  return {
    role: "corps",
    x: 0.1,
    y: 0.4,
    w: 0.8,
    h: 0.2,
    lignes: 4,
    texte: "",
    couleur: "#FFFFFF",
    contour: false,
    gras: false,
    alignement: "centre",
    ...p,
  };
}

const slide = (blocs: BlocTexte[]): MesureSlide => ({ blocs, largeurPx: 1080, hauteurPx: 1920 });

const PARAGRAPHE_LARGE = [
  "Matcha helps me stay focused and gives",
  "me the energy I need to get through the",
  "day. I love that it feels smoother and",
  "more balanced than coffee, no crash.",
].join("\n");

const PARAGRAPHE_ETROIT = [
  "Matcha helps me",
  "stay focused and",
  "gives me the",
  "energy I need to",
  "get through the",
  "day. I love that",
  "it feels smoother",
  "and more balanced",
  "than coffee, no",
  "crash.",
].join("\n");

Deno.test("parserMesure lit le JSON même entouré de texte, et l'échelle 0-1000", () => {
  const m = parserMesure(
    'Voici :\n```json\n{"a":[{"role":"titre","x":100,"y":300,"w":800,"h":60,"lignes":1,"texte":"Hook","couleur":"#ffe600","contour":"true","gras":true,"alignement":"left"}],"b":[]}\n```',
  );
  assert(m);
  assertEquals(m.a.length, 1);
  assertEquals(m.a[0].x, 0.1);
  assertEquals(m.a[0].couleur, "#FFE600");
  assertEquals(m.a[0].contour, true);
  assertEquals(m.a[0].alignement, "gauche");
  assertEquals(m.b.length, 0);
  assertEquals(parserMesure("pas de json"), null);
});

Deno.test("le nombre de lignes suit la transcription quand le compte déclaré est trop bas", () => {
  const m = parserMesure(`{"a":[{"x":0.1,"y":0.1,"w":0.8,"h":0.3,"lignes":2,"texte":${JSON.stringify(PARAGRAPHE_ETROIT)}}],"b":[]}`);
  assertEquals(m!.a[0].lignes, 10);
});

Deno.test("forme du paragraphe : une colonne étroite est relevée, même à taille égale", () => {
  const a = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, h: 0.12 })]);
  // Même hauteur de ligne (0,03), mais 10 lignes de 15 caractères au lieu de 4 de 38.
  const b = slide([bloc({ texte: PARAGRAPHE_ETROIT, lignes: 10, h: 0.3, w: 0.45 })]);
  const j = jugerPaire(2, a, b);
  const codes = j.constats.map((c) => c.code);
  assert(codes.includes("forme_paragraphe"));
  assert(!codes.includes("taille"), "la taille de ligne est la même");
});

Deno.test("taille : un texte deux fois plus grand est relevé", () => {
  const a = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, h: 0.12 })]);
  const b = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, h: 0.24 })]);
  const j = jugerPaire(3, a, b);
  const taille = j.constats.find((c) => c.code === "taille");
  assert(taille);
  assertEquals(taille.valeurs?.sens, "plus grand");
});

Deno.test("hiérarchie : titre distinct dans l'original, un seul bloc publié", () => {
  const a = slide([
    bloc({ role: "titre", texte: "1. Raise your standards", lignes: 1, y: 0.3, h: 0.05 }),
    bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, y: 0.4, h: 0.12 }),
  ]);
  const b = slide([bloc({ texte: `1. Sube tus estándares\n${PARAGRAPHE_LARGE}`, lignes: 5, y: 0.35, h: 0.15 })]);
  const j = jugerPaire(2, a, b);
  assert(j.evalues.includes("hierarchie"));
  assert(j.constats.some((c) => c.code === "hierarchie"));
});

Deno.test("style : couleur, contour et gras", () => {
  const a = slide([bloc({ texte: PARAGRAPHE_LARGE, couleur: "#FFFFFF", gras: true })]);
  const b = slide([bloc({ texte: PARAGRAPHE_LARGE, couleur: "#FF8C00", contour: true, gras: false })]);
  const codes = jugerPaire(2, a, b).constats.map((c) => c.code).sort();
  assertEquals(codes, ["contour", "couleur", "gras"]);
});

Deno.test("familleCouleur : blanc cassé reste blanc, jaune et orange se distinguent", () => {
  assertEquals(familleCouleur("#F5F0E6"), "blanc");
  assertEquals(familleCouleur("#FFE600"), "jaune");
  assertEquals(familleCouleur("#FF8C00"), "orange");
  assertEquals(familleCouleur("#FE2C55"), "rouge");
});

Deno.test("slide publiée sans texte", () => {
  const j = jugerPaire(4, slide([bloc({ texte: PARAGRAPHE_LARGE })]), slide([]));
  assertEquals(j.constats.map((c) => c.code), ["texte_absent"]);
});

Deno.test("agreger : un écart vu sur une seule slide sur trois n'est pas retenu", () => {
  const a = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, h: 0.12 })]);
  const grand = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, h: 0.24 })]);
  const pareil = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, h: 0.12 })]);
  const une = agreger([jugerPaire(1, a, grand), jugerPaire(2, a, pareil), jugerPaire(3, a, pareil)]);
  assertEquals(une.find((d) => d.code === "taille"), undefined);
  const deux = agreger([jugerPaire(1, a, grand), jugerPaire(2, a, grand), jugerPaire(3, a, pareil)]);
  const taille = deux.find((d) => d.code === "taille");
  assert(taille);
  assertEquals(taille.slides, [1, 2]);
  assertEquals(taille.confiance, 0.67);
});

Deno.test("controlesPost : nombre de slides et son", () => {
  const d = controlesPost({ slidesAttendues: 6, slidesPubliees: 5, musiqueAttendueId: "7300000000000000001", musiquePublieeId: "7300000000000000002" });
  assertEquals(d.map((x) => x.code), ["nb_slides", "musique"]);
  assertEquals(controlesPost({ slidesAttendues: 6, slidesPubliees: 6, musiqueAttendueId: null, musiquePublieeId: "1" }), []);
});

Deno.test("idMusique lit l'ID au bout du lien /music/", () => {
  assertEquals(idMusique("https://www.tiktok.com/music/original-sound-7512345678901234567"), "7512345678901234567");
  assertEquals(idMusique("https://www.tiktok.com/music/son-7512345678901234567?lang=fr"), "7512345678901234567");
  assertEquals(idMusique("https://p16.tiktokcdn.com/obj/audio.mp3"), null);
});

Deno.test("choisirPositions : l'accroche puis les deux textes les plus longs", () => {
  const pos = choisirPositions([
    { position: 1, longueur: 40 },
    { position: 2, longueur: 200 },
    { position: 3, longueur: 90 },
    { position: 4, longueur: 300 },
  ]);
  assertEquals(pos, [1, 2, 4]);
  assertEquals(choisirPositions([{ position: 3, longueur: 10 }, { position: 2, longueur: 5 }]), [2, 3]);
});

Deno.test("redigerBrouillon : remarques-types puis constats précis, au format reviews.remarques", () => {
  const remarques = [
    { id: "h", titre: "Hello", corps: "Hello thanks for your post." },
    { id: "s", titre: "text not the same", corps: "The text style must be the same." },
    { id: "j", titre: "Jutifier", corps: "The text should follow the same alignement." },
    { id: "c", titre: "Corpus / head", corps: "Mark a difference between title and body." },
  ];
  const { texte, remarques: utilisees } = redigerBrouillon([
    { code: "forme_paragraphe", slides: [2, 4], confiance: 1, detail: "", valeurs: { cpl_original: 38, cpl_publie: 15, sens: "courtes" } },
    { code: "taille", slides: [1, 2], confiance: 0.67, detail: "", valeurs: { ratio: 1.9, sens: "plus grand" } },
    { code: "musique", slides: [], confiance: 1, detail: "" },
  ], remarques);
  assertEquals(utilisees.map((r) => r.id), ["h", "j", "s"]);
  assert(texte.includes("On slides 2 and 4, the paragraph is a narrow column"));
  assert(texte.includes("1.9× bigger"));
  assert(texte.includes("sound provided"));
  assertEquals(redigerBrouillon([], remarques), { texte: "", remarques: [] });
});
