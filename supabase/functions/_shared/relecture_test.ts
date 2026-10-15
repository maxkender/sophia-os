import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  agreger,
  type BlocTexte,
  blocPrincipal,
  choisirPositions,
  controlesPost,
  familleCouleur,
  idMusique,
  jugerPaire,
  type MesureSlide,
  parserMesure,
  redigerBrouillon,
  reformulationValide,
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
    effet: "aucun",
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
  assertEquals(m.a[0].effet, "contour");
  assertEquals(m.a[0].alignement, "gauche");
  assertEquals(m.b.length, 0);
  assertEquals(m.policeIdentique, null);
  assertEquals(parserMesure('{"a":[],"b":[],"police_identique":false}')?.policeIdentique, false);
  const fond = parserMesure('{"a":[{"x":0.1,"y":0.1,"w":0.5,"h":0.1,"texte":"Hi","effet":"fond"}],"b":[]}');
  assertEquals(fond!.a[0].effet, "fond");
  assertEquals(parserMesure("pas de json"), null);
});

Deno.test("le nombre de lignes suit la transcription quand le compte déclaré est trop bas", () => {
  const m = parserMesure(`{"a":[{"x":0.1,"y":0.1,"w":0.8,"h":0.3,"lignes":2,"texte":${JSON.stringify(PARAGRAPHE_ETROIT)}}],"b":[]}`);
  assertEquals(m!.a[0].lignes, 10);
});

Deno.test("justification : texte tapé trop gros puis pincé = lignes courtes, même si la taille à l'écran est bonne", () => {
  // Original : 4 lignes d'environ 8 mots sur 80 % de la largeur, ligne de 0,03.
  const a = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.8, h: 0.12 })]);
  // Publié : 10 lignes d'environ 3 mots, même hauteur de ligne, colonne de 45 %.
  const b = slide([bloc({ texte: PARAGRAPHE_ETROIT, lignes: 10, w: 0.45, h: 0.3 })]);
  const j = jugerPaire(2, a, b);
  const justif = j.constats.find((c) => c.code === "justification");
  assert(justif);
  assertEquals(justif.valeurs?.sens, "courtes");
  assertEquals(justif.valeurs?.lignes_publie, 10);
  assert(!j.constats.some((c) => c.code === "taille"), "la taille de ligne est la même");
});

Deno.test("justification : pincer le bloc entier ne change rien, seule la taille bouge", () => {
  const a = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.6, h: 0.12 })]);
  // Mêmes retours à la ligne, bloc agrandi ×1,5 dans les deux sens.
  const b = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.9, h: 0.18 })]);
  const codes = jugerPaire(3, a, b).constats.map((c) => c.code);
  assert(!codes.includes("justification"));
  assert(codes.includes("taille"));
});

Deno.test("justification : lignes trop longues", () => {
  const a = slide([bloc({ texte: PARAGRAPHE_ETROIT, lignes: 10, w: 0.45, h: 0.3 })]);
  const b = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.8, h: 0.12 })]);
  const justif = jugerPaire(2, a, b).constats.find((c) => c.code === "justification");
  assertEquals(justif?.valeurs?.sens, "longues");
});

Deno.test("justification : pas jugée sur une accroche courte, coupée comme l'auteur l'a voulu", () => {
  // Cas julia.ksiazki2 du 15/10 : 4 lignes de 2 mots contre 3 lignes plus larges.
  const a = slide([bloc({ role: "titre", texte: "how to actually\nbecome the\nbest version of\nyourself", lignes: 4, w: 0.39, h: 0.34 })]);
  const b = slide([bloc({ role: "titre", texte: "jak naprawdę\nstać się najlepszą wersją\nsiebie", lignes: 3, w: 0.54, h: 0.23 })]);
  assert(!jugerPaire(1, a, b).evalues.includes("justification"));
});

Deno.test("agreger : des lignes trop courtes ici et trop longues là ne font pas un défaut", () => {
  const large = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.8, h: 0.12 })]);
  const etroit = slide([bloc({ texte: PARAGRAPHE_ETROIT, lignes: 10, w: 0.45, h: 0.3 })]);
  const defauts = agreger([jugerPaire(2, large, etroit), jugerPaire(3, etroit, large)]);
  assertEquals(defauts.find((d) => d.code === "justification"), undefined);
});

Deno.test("police : le verdict du modèle compte quand il se prononce", () => {
  const a = slide([bloc({ texte: PARAGRAPHE_LARGE })]);
  const b = slide([bloc({ texte: PARAGRAPHE_LARGE })]);
  assert(jugerPaire(2, a, b, false).constats.some((c) => c.code === "police"));
  assert(!jugerPaire(2, a, b, true).constats.some((c) => c.code === "police"));
  assert(!jugerPaire(2, a, b, null).evalues.includes("police"));
});

Deno.test("agreger : un alignement différent sur la seule accroche suffit", () => {
  const accrocheA = slide([bloc({ role: "titre", texte: "things that will make you\ndisgustingly intelligent", lignes: 2, alignement: "gauche" })]);
  const accrocheB = slide([bloc({ role: "titre", texte: "πράγματα που θα σε\nκάνουν αδιανόητα έξυπνο", lignes: 2, alignement: "centre" })]);
  const corps = slide([bloc({ texte: PARAGRAPHE_LARGE })]);
  const defauts = agreger([jugerPaire(1, accrocheA, accrocheB), jugerPaire(2, corps, corps), jugerPaire(3, corps, corps)]);
  const al = defauts.find((d) => d.code === "alignement");
  assert(al);
  assertEquals(al.slides, [1]);
});

Deno.test("taille : seul un écart net est relevé (×2 oui, ×1,3 non)", () => {
  const a = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.4, h: 0.12 })]);
  const b = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.8, h: 0.24 })]);
  const j = jugerPaire(3, a, b);
  const taille = j.constats.find((c) => c.code === "taille");
  assert(taille);
  assertEquals(taille.valeurs?.sens, "plus grand");
  const proche = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.52, h: 0.156 })]);
  assert(!jugerPaire(3, a, proche).constats.some((c) => c.code === "taille"));
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

Deno.test("style : couleur, effet et gras ; le gras reste une info pour l'admin", () => {
  const a = slide([bloc({ texte: PARAGRAPHE_LARGE, couleur: "#FFFFFF", gras: true })]);
  const b = slide([bloc({ texte: PARAGRAPHE_LARGE, couleur: "#FF8C00", effet: "fond", gras: false })]);
  const j = jugerPaire(2, a, b);
  assertEquals(j.constats.map((c) => c.code).sort(), ["couleur", "effet", "gras"]);
  const defauts = agreger([j, jugerPaire(3, a, b)]);
  assertEquals(defauts.find((d) => d.code === "gras")?.niveau, "info");
  assertEquals(defauts.find((d) => d.code === "couleur")?.niveau, "remarque");
});

Deno.test("paragraphe principal : le corps l'emporte sur un titre un peu plus grand, pas sur un titre énorme", () => {
  const titre = bloc({ role: "titre", texte: "Big title", lignes: 1, y: 0.2, w: 0.8, h: 0.08 });
  const corps = bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, y: 0.4, w: 0.7, h: 0.06 });
  assertEquals(blocPrincipal([titre, corps]), corps);
  const minuscule = bloc({ texte: "small", lignes: 1, y: 0.8, w: 0.2, h: 0.02 });
  assertEquals(blocPrincipal([titre, minuscule]), titre);
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

const REMARQUES = [
  { id: "h", titre: "Hello", corps: "Hello thanks for your post." },
  { id: "s", titre: "text not the same", corps: "The text style must be the same." },
  { id: "j", titre: "Jutifier", corps: "The text should follow the same alignement." },
  { id: "c", titre: "Corpus / head", corps: "Mark a difference between title and body." },
];

Deno.test("redigerBrouillon : deux points au plus, les plus importants, en mots et en gestes TikTok", () => {
  const { texte, remarques, points } = redigerBrouillon([
    { code: "taille", niveau: "remarque", slides: [1, 2], confiance: 0.67, detail: "", valeurs: { ratio: 1.9, sens: "plus grand" } },
    { code: "police", niveau: "info", slides: [1, 2, 3], confiance: 1, detail: "" },
    { code: "musique", niveau: "remarque", slides: [], confiance: 1, detail: "" },
    { code: "justification", niveau: "remarque", slides: [2, 4], confiance: 1, detail: "", valeurs: { lignes_original: 3, lignes_publie: 5, sens: "courtes" } },
  ], REMARQUES);
  assertEquals(points.map((p) => p.code), ["justification", "taille"]);
  assertEquals(remarques.map((r) => r.id), ["h", "j", "s"]);
  assert(texte.includes("On slides 2 and 4, your lines are shorter than in the original, so the paragraph looks like a thin column instead of a block (5 lines where the original has 3)"));
  assert(texte.includes("size slider down"));
  assert(texte.includes("Pinch it down"));
  assert(!/[×%]|1\.9/.test(texte), "pas de ratio dans le texte envoyé");
  assert(!texte.includes("sound"), "le troisième point attend une prochaine review");
  assertEquals(redigerBrouillon([], REMARQUES), { texte: "", remarques: [], points: [] });
});

Deno.test("redigerBrouillon : les infos admin seules ne produisent pas de review", () => {
  const { texte } = redigerBrouillon([
    { code: "police", niveau: "info", slides: [1, 2], confiance: 1, detail: "" },
    { code: "gras", niveau: "info", slides: [1, 2], confiance: 1, detail: "" },
  ], REMARQUES);
  assertEquals(texte, "");
});

Deno.test("reformulationValide : mêmes slides, pas de ratio, sinon on garde le brouillon", () => {
  const brouillon = "Hi!\n\nOn slides 2 and 4, your paragraph is cut into short lines. Tap the text, move the size slider down.\n\nKeep it up!";
  assert(reformulationValide(brouillon, "Hey, great post! On slides 2 and 4 the lines are a bit short: tap the text and move the size slider down. Thanks!"));
  assert(!reformulationValide(brouillon, "Hey, great post! On slide 2 the lines are a bit short: tap the text and move the size slider down. Thanks!"));
  assert(!reformulationValide(brouillon, "Hey! On slides 2 and 4 the text is 30% too narrow, move the size slider down please, thank you."));
  assert(!reformulationValide(brouillon, "ok"));
});
