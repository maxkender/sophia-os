import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  agreger,
  choisirRetoursAEnvoyer,
  type BlocTexte,
  blocPrincipal,
  choisirPositions,
  controlesPost,
  couleursCompatibles,
  familleCouleur,
  idMusique,
  jugerPaire,
  ligneLaPlusLongue,
  type Defaut,
  type MesureSlide,
  normaliserBlocs,
  parserMesure,
  pointAnglais,
  redigerBrouillon,
  reformulationValide,
  SEUIL_VUES_SANS_REMARQUE,
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
  assertEquals(justif.valeurs?.car_ligne_original, 39);
  assertEquals(justif.valeurs?.car_ligne_publie, 17);
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
  // Blanc crème lu sur une photo chaude (cas dominik.fokus983 du 16/10) : pas du jaune.
  assertEquals(familleCouleur("#FFF29A"), "blanc");
  assertEquals(familleCouleur("#FFF8B5"), "blanc");
  assertEquals(familleCouleur("#F8D81C"), "jaune");
  assertEquals(familleCouleur("#FFF18A"), "blanc");
  assertEquals(familleCouleur("#ECC765"), "jaune");
  assertEquals(familleCouleur("#F8CD50"), "jaune");
});

Deno.test("couleursCompatibles : le jaune TikTok vaut un original jaune pâle, pas un vrai blanc", () => {
  // Original alpha_male_yellow (Joanna Mar, 20/10) : la palette TikTok n'a pas ce jaune pâle.
  assert(couleursCompatibles("#F8F0A8", "#F8CD50"));
  assert(couleursCompatibles("#F8F8B8", "#FFE600"));
  // Un vrai blanc, même cassé, reste un écart.
  assert(!couleursCompatibles("#FFFFFF", "#F8CD50"));
  assert(!couleursCompatibles("#F5F0E6", "#F8CD50"));
  // Le sens inverse et les autres familles ne changent pas.
  assert(couleursCompatibles("#F8F0A8", "#FFFFFF"));
  assert(!couleursCompatibles("#F8CD50", "#FF8C00"));
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
  // Souvent une erreur d'assignation, ou le même son sous un autre identifiant : notes pour l'admin.
  assertEquals(d.map((x) => x.niveau), ["info", "info"]);
  assertEquals(redigerBrouillon(d, REMARQUES).texte, "");
  assertEquals(controlesPost({ slidesAttendues: 6, slidesPubliees: 6, musiqueAttendueId: null, musiquePublieeId: "1" }), []);
});

Deno.test("alignement : une slide suffit pour gauche / centre, pas pour « droite » (cas ben.wissen295)", () => {
  const centre = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, alignement: "centre" })]);
  const gauche = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, alignement: "gauche" })]);
  const droite = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, alignement: "droite" })]);
  const unGauche = agreger([jugerPaire(1, gauche, centre), jugerPaire(2, centre, centre), jugerPaire(3, centre, centre)]);
  assertEquals(unGauche.find((d) => d.code === "alignement")?.slides, [1]);
  const unDroite = agreger([jugerPaire(2, centre, centre), jugerPaire(3, centre, centre), jugerPaire(4, centre, droite)]);
  assertEquals(unDroite.find((d) => d.code === "alignement"), undefined);
  const deuxDroite = agreger([jugerPaire(2, centre, droite), jugerPaire(3, centre, centre), jugerPaire(4, centre, droite)]);
  assertEquals(deuxDroite.find((d) => d.code === "alignement")?.slides, [2, 4]);
});

Deno.test("largeur : un texte à peine plus petit n'est pas relevé (cas lina.entwickelt399)", () => {
  // 71 % → 59 % de l'écran (×0.84), lettres plus petites : en dessous du seuil.
  const a = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.71, h: 0.12 })]);
  const b = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.59, h: 0.1 })]);
  assert(!jugerPaire(3, a, b).constats.some((c) => c.code === "largeur"));
  // 74 % → 50 % : là, ça se voit.
  const c = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.74, h: 0.12 })]);
  const d = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.5, h: 0.08 })]);
  assertEquals(jugerPaire(5, c, d).constats.find((x) => x.code === "largeur")?.valeurs?.sens, "etroit");
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
    { code: "justification", niveau: "remarque", slides: [2, 4], confiance: 1, detail: "", valeurs: { car_ligne_original: 39, car_ligne_publie: 17, sens: "courtes" } },
  ], REMARQUES);
  assertEquals(points.map((p) => p.code), ["justification", "taille"]);
  assertEquals(remarques.map((r) => r.id), ["h", "j", "s"]);
  assert(texte.includes("On some of your slides, your lines are shorter than in the original, so the paragraph looks like a thin column. Here's how to fix it:"));
  assert(!/slides? \d/.test(texte), "jamais de numéro de slide : l'agent n'en compare que 3");
  assert(texte.includes("\n1. Tap your text to edit it.\n2. A small slider appears on the right edge of the screen (a white dot on a thin line). Slide the dot down"));
  assert(texte.includes("then tap Done"));
  assert(texte.includes("you may not get the same number of lines"));
  assert(!/\d+ lines/.test(texte), "jamais de nombre de lignes à viser");
  assert(texte.includes("Pinch it down"));
  assert(!/[×%]|1\.9/.test(texte), "pas de ratio dans le texte envoyé");
  assert(!texte.includes("sound"), "le troisième point attend une prochaine review");
  assertEquals(redigerBrouillon([], REMARQUES), { texte: "", remarques: [], points: [], marche: false });
});

Deno.test("redigerBrouillon : les infos admin seules ne produisent pas de review", () => {
  const { texte } = redigerBrouillon([
    { code: "police", niveau: "info", slides: [1, 2], confiance: 1, detail: "" },
    { code: "gras", niveau: "info", slides: [1, 2], confiance: 1, detail: "" },
  ], REMARQUES);
  assertEquals(texte, "");
});

Deno.test("reformulationValide : ni numéro de slide ni ratio, « some » gardé, sinon on garde le brouillon", () => {
  const brouillon = "Hi!\n\nOn some of your slides, your paragraph is cut into short lines. Tap the text, move the size slider down.\n\nKeep it up!";
  assert(reformulationValide(brouillon, "Hey, great post! On some of your slides the lines are a bit short: tap the text and move the size slider down. Thanks!"));
  assert(reformulationValide(brouillon, "Hey, great post! On some slides the lines are a bit short: tap the text and move the size slider down. Thanks!"));
  assert(!reformulationValide(brouillon, "Hey, great post! On slides 2 and 4 the lines are a bit short: tap the text and move the size slider down. Thanks!"));
  assert(!reformulationValide(brouillon, "Hey, great post! On your slides the lines are a bit short: tap the text and move the size slider down. Thanks a lot!"));
  assert(!reformulationValide(brouillon, "Hey! On some of your slides the text is 30% too narrow, move the size slider down please, thank you."));
  assert(!reformulationValide(brouillon, "ok"));
  assert(!reformulationValide(brouillon, "Hey! On some of your slides your text is a thin column with 7 lines instead of 5, move the size slider down please."));
  // Une seule slide nommée : le numéro reste, et seulement lui.
  const une = "Hi!\n\nOn slide 1, the text is centered while the original is left-aligned. Tap the alignment button until it matches.\n\nKeep it up!";
  assert(reformulationValide(une, "Great post! On slide 1 your text is centered, but the original is left-aligned. Tap the alignment button until it matches. Thanks!"));
  assert(!reformulationValide(une, "Great post! On some of your slides your text is centered, but the original is left-aligned. Tap the alignment button until it matches."));
  assert(!reformulationValide(une, "Great post! On slides 1 and 2 your text is centered, but the original is left-aligned. Tap the alignment button until it matches."));
});

Deno.test("pointAnglais : nomme une slide seule, pas plusieurs", () => {
  const align = { code: "alignement" as const, niveau: "remarque" as const, slides: [1], confiance: 1, detail: "", valeurs: { publie: "centre", original: "gauche" } };
  assert(pointAnglais(align).startsWith("On slide 1, the text is centered while the original is left-aligned."));
  assert(pointAnglais({ ...align, slides: [1, 2, 6] }).startsWith("On some of your slides, the text is centered"));
});

Deno.test("redigerBrouillon : un post qui marche n'a aucun message, ses défauts restent pour l'admin", () => {
  const defauts = [
    { code: "justification" as const, niveau: "remarque" as const, slides: [2, 4], confiance: 1, detail: "", valeurs: { sens: "courtes" } },
  ];
  const marche = redigerBrouillon(defauts, REMARQUES, { vues: SEUIL_VUES_SANS_REMARQUE });
  assertEquals(marche, { texte: "", remarques: [], points: [], marche: true });
  const juste = redigerBrouillon(defauts, REMARQUES, { vues: SEUIL_VUES_SANS_REMARQUE - 1 });
  assertEquals(juste.marche, false);
  assertEquals(juste.points.map((p) => p.code), ["justification"]);
  // Vues inconnues : les règles s'appliquent.
  assertEquals(redigerBrouillon(defauts, REMARQUES, { vues: null }).points.length, 1);
});

Deno.test("largeur : mêmes lignes en plus gros, le paragraphe mange les marges (cas klara.mudrost149)", () => {
  // Mesures Gemini du 15/10, slide 7 : 41 % de l'écran → 52 %, 10 lignes → 11.
  const texteA = "i have a personal “minimum\nstandard” even during\nhorrible weeks:\nshow up reasonably put-\ntogether, know what’s\nhappening in my classes, eat\nsomething\nkeep my space survivable,\nsleep enough to form\nsentences (very important!)";
  const texteB = "imam osobni \"minimalni\nstandard\" čak i u najgorim\ntjednima:\npojaviti se pristojno\nsređena, znati što se\ndogađa na predavanjima,\npojesti nešto\ndržati sobu u urednom\nstanju, odspavati dovoljno\nza sastaviti rečenicu\n(stvarno bitno!)";
  const a: MesureSlide = { blocs: [bloc({ texte: texteA, lignes: 10, x: 0.298, y: 0.366, w: 0.405, h: 0.266 })], largeurPx: 1284, hauteurPx: 1712 };
  const b: MesureSlide = { blocs: [bloc({ texte: texteB, lignes: 11, x: 0.24, y: 0.222, w: 0.52, h: 0.408 })], largeurPx: 1760, hauteurPx: 2368 };
  const j = jugerPaire(7, a, b);
  assert(!j.constats.some((c) => c.code === "justification"), "les lignes se coupent comme dans l'original");
  const largeur = j.constats.find((c) => c.code === "largeur");
  assertEquals(largeur?.valeurs?.sens, "large");
  assertEquals(largeur?.valeurs?.part_publie, 52);
  // Écart léger (5 %) : rien.
  const proche: MesureSlide = { ...b, blocs: [bloc({ texte: texteB, lignes: 11, w: 0.425, h: 0.33 })] };
  assert(!jugerPaire(7, a, proche).constats.some((c) => c.code === "largeur"));
});

Deno.test("largeur : plus large à taille égale (traduction plus longue), rien à pincer (cas hugo.notes813)", () => {
  const a = slide([bloc({ role: "titre", texte: "play calm and\nmotivating music", lignes: 2, w: 0.3, h: 0.06 })]);
  const b = slide([bloc({ role: "titre", texte: "Pets de la musique calme et\nmotivante", lignes: 2, w: 0.53, h: 0.06 })]);
  assert(!jugerPaire(8, a, b).constats.some((c) => c.code === "largeur"));
});

Deno.test("largeur et taille dans le même sens : un seul point (pincer)", () => {
  const a = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.4, h: 0.12 })]);
  const b = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.6, h: 0.18 })]);
  const defauts = agreger([jugerPaire(2, a, b), jugerPaire(3, a, b)]);
  assertEquals(defauts.map((d) => d.code), ["largeur"]);
  const { texte, remarques } = redigerBrouillon(defauts, REMARQUES);
  assert(texte.includes("On some of your slides, your text is bigger than in the original, so it goes closer to the edges of the screen."));
  assert(texte.includes("Pinch the text with two fingers to make it a bit smaller"));
  assertEquals(remarques.map((r) => r.id), ["h", "j"]);
});

Deno.test("largeur : pas de second point quand la justification explique déjà l'écart", () => {
  const a = slide([bloc({ texte: PARAGRAPHE_LARGE, lignes: 4, w: 0.8, h: 0.12 })]);
  const b = slide([bloc({ texte: PARAGRAPHE_ETROIT, lignes: 10, w: 0.45, h: 0.3 })]);
  const codes = jugerPaire(2, a, b).constats.map((c) => c.code);
  assert(codes.includes("justification"));
  assert(!codes.includes("largeur"));
});

Deno.test("normaliserBlocs relit les blocs stockés, ancien format compris", () => {
  const blocs = normaliserBlocs([
    { role: "corps", x: 0.1, y: 0.2, w: 0.5, h: 0.1, lignes: 2, texte: "a\nb", couleur: "#ffffff", contour: true, gras: false, alignement: "centre" },
    { pas: "un bloc" },
  ]);
  assertEquals(blocs.length, 1);
  assertEquals(blocs[0].effet, "contour");
});

Deno.test("justification : une traduction plus longue fait plus de lignes de la même largeur, ce n'est pas un défaut", () => {
  // Original : 3 lignes pleines. Traduction 60 % plus longue : 5 lignes, même largeur, même taille.
  const original = "Matcha helps me stay focused and gives\nme the energy I need to get through the\nday without any crash at all, really.";
  const traduit = "Le matcha m'aide à rester concentrée et\nme donne l'énergie dont j'ai besoin pour\ntenir toute la journée sans aucun coup de\nbarre, vraiment, et je le préfère au café\npour cette raison.";
  const a = slide([bloc({ texte: original, lignes: 3, w: 0.8, h: 0.09 })]);
  const b = slide([bloc({ texte: traduit, lignes: 5, w: 0.8, h: 0.15 })]);
  const j = jugerPaire(2, a, b);
  assert(j.evalues.includes("justification"));
  assert(!j.constats.some((c) => c.code === "justification" || c.code === "largeur" || c.code === "taille"));
});

Deno.test("justification : la confirmation lit la ligne la plus longue, pas une moyenne tirée par les fins de phrase", () => {
  assertEquals(ligneLaPlusLongue("hair mask while finishing a\nreading\nlaundry"), 27);
  assertEquals(ligneLaPlusLongue(""), 0);
});

Deno.test("redigerBrouillon : renvoie à la vidéo tuto quand la remarque-type en a une", () => {
  const avecVideo = REMARQUES.map((r) => (r.id === "j" ? { ...r, video_url: "https://cdn.example/justif.mp4" } : r));
  const defaut = { code: "justification" as const, niveau: "remarque" as const, slides: [5, 6], confiance: 1, detail: "", valeurs: { sens: "courtes" } };
  assert(redigerBrouillon([defaut], avecVideo).texte.includes("The short video with this message shows how to do it."));
  assert(!redigerBrouillon([defaut], REMARQUES).texte.includes("video"));
  const largeur = { code: "largeur" as const, niveau: "remarque" as const, slides: [4, 7], confiance: 1, detail: "", valeurs: { sens: "large" } };
  assert(!redigerBrouillon([largeur], avecVideo).texte.includes("video"), "la vidéo montre le curseur, pas le pincement");
});

Deno.test("reformulationValide : les étapes et le geste du slider doivent survivre", () => {
  const defaut = { code: "justification" as const, niveau: "remarque" as const, slides: [5, 6], confiance: 1, detail: "", valeurs: { sens: "courtes" } };
  const brouillon = redigerBrouillon([defaut], REMARQUES).texte;
  // Reprise fidèle, tournures simplifiées : gardée.
  const fidele = brouillon.replace("Hi! Thanks for your post.", "Hey, great post!").replace("Keep it up!", "Thanks a lot!");
  assert(reformulationValide(brouillon, fidele));
  // Étapes fondues en une phrase, bord droit perdu : rejetée.
  const fondu = "Great post! On some of your slides your lines are short. Tap the text, use the slider to make the letters smaller, tap Done and pinch it bigger. Your text is translated, so that's fine. Keep it up!";
  assert(!reformulationValide(brouillon, fondu));
});

Deno.test("choisirRetoursAEnvoyer : un retour par créateur, le défaut le plus important, jamais un post déjà traité", () => {
  const d = (code: Defaut["code"], niveau: Defaut["niveau"] = "remarque"): Defaut =>
    ({ code, niveau, slides: [1], confiance: 1, detail: "" });
  const lignes = [
    { id: "a1", post_id: "p1", poster_id: "ana", defauts: [d("couleur")] },
    { id: "a2", post_id: "p2", poster_id: "ana", defauts: [d("justification"), d("effet")] },
    { id: "a3", post_id: "p3", poster_id: "ana", defauts: [d("justification")] },
    { id: "b1", post_id: "p4", poster_id: "ben", defauts: [d("largeur")] },
    { id: "c1", post_id: "p5", poster_id: "cleo", defauts: [d("taille")] },
    { id: "c2", post_id: "p6", poster_id: "cleo", defauts: [d("alignement")] },
    { id: "x1", post_id: "p7", poster_id: null, defauts: [d("taille")] },
    { id: "z1", post_id: "p8", poster_id: "zoe", defauts: [d("taille")] },
  ];
  // p5 a déjà été reviewé à la main ; zoe a déjà reçu le retour de l'agent cette nuit.
  const { envoyer, sauter } = choisirRetoursAEnvoyer(lignes, new Set(["p5"]), new Set(["zoe"]));
  assertEquals(envoyer.map((l) => l.id).sort(), ["a2", "b1", "c2"]);
  const raisons = Object.fromEntries(sauter.map((s) => [s.id, s.raison]));
  assertEquals(Object.keys(raisons).sort(), ["a1", "a3", "c1", "x1", "z1"]);
  assert(raisons.c1.includes("déjà reviewé"));
  assert(raisons.a1.includes("un retour par créateur"));
  assert(raisons.z1.includes("un retour par créateur"));
});
