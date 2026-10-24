import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  aRefaire,
  cheminMiseEnScene,
  couplesManquants,
  ecranValide,
  etatBudget,
  extensionImage,
  formatRespecte,
  langueValide,
  lireReglagesMisesEnScene,
  promptIncrustation,
  promptTraduction,
  promptVersion,
  ratioImpose,
  relancePermise,
  sansMetadonnees,
  supportValide,
  tailleImage,
} from "./mises_en_scene.ts";

Deno.test("écran : minuscules et tirets seulement", () => {
  assert(ecranValide("parcours"));
  assert(ecranValide("a-retenir"));
  assert(!ecranValide("À retenir"));
  assert(!ecranValide("a--retenir"));
  assert(!ecranValide(""));
});

Deno.test("langue : seulement celles que l'OS sait nommer", () => {
  assert(langueValide("fr"));
  assert(langueValide("tr"));
  assert(langueValide("pt-BR"));
  assert(!langueValide("xx"));
  assert(!langueValide("FR"));
});

Deno.test("prompt de traduction : langue en clair et nom de l'app gardé", () => {
  const p = promptTraduction(undefined, "es", "micabo");
  assert(p.includes("Spanish (Spain)"));
  assert(p.includes('"micabo"'));
  assert(!p.includes("{langue}") && !p.includes("{app}"));
});

Deno.test("prompt d'incrustation : l'appareil de la scène", () => {
  assert(promptIncrustation(undefined, "iphone").includes("phone screen in image 1"));
  assert(promptIncrustation(undefined, "tablette").includes("tablet screen"));
  assert(promptIncrustation("écran du {appareil}", "ordinateur") === "écran du computer");
});

Deno.test("budget : semaine glissante, une image de plus", () => {
  const maintenant = Date.parse("2026-10-23T12:00:00Z");
  const reglages = lireReglagesMisesEnScene({ budget_fal_usd_semaine: 1, prix_image_usd: 0.15 });
  const depenses = [
    { le: "2026-10-22T10:00:00Z", usd: 0.45 },
    { le: "2026-10-23T09:00:00Z", usd: "0.30" },
    { le: "2026-10-10T09:00:00Z", usd: 5 }, // hors semaine
  ];
  const b = etatBudget(depenses, reglages, maintenant);
  assertEquals(b.depense_semaine, 0.75);
  assertEquals(b.reste, 0.25);
  assert(b.possible);
  const plein = etatBudget([...depenses, { le: "2026-10-23T10:00:00Z", usd: 0.15 }], reglages, maintenant);
  assert(!plein.possible);
});

Deno.test("réglages : repli sur les défauts", () => {
  assertEquals(lireReglagesMisesEnScene(null), { budget_fal_usd_semaine: 5, prix_image_usd: 0.15 });
  assertEquals(lireReglagesMisesEnScene({ budget_fal_usd_semaine: "x" }).budget_fal_usd_semaine, 5);
});

Deno.test("taille d'un PNG et d'un JPEG", () => {
  const png = new Uint8Array(24);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 739);
  new DataView(png.buffer).setUint32(20, 1600);
  assertEquals(tailleImage(png), { largeur: 739, hauteur: 1600 });
  assertEquals(extensionImage(png), "png");

  // SOI, APP0 (longueur 4), SOF0 : précision 8, hauteur 1920, largeur 3024.
  const jpg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x07, 0x80, 0x0b, 0xd0, 0x03, 0, 0, 0, 0,
  ]);
  assertEquals(tailleImage(jpg), { largeur: 3024, hauteur: 1920 });
  assertEquals(extensionImage(jpg), "jpg");
  assertEquals(tailleImage(new Uint8Array([1, 2, 3])), null);
});

Deno.test("une seule relance, puis à refaire si la capture est remplacée", () => {
  assert(relancePermise(1));
  assert(!relancePermise(2));
  assert(!aRefaire({ remplacee_par: null }, null));
  assert(aRefaire({ remplacee_par: "x" }));
  assert(aRefaire({ remplacee_par: null }, { remplacee_par: "y" }));
});

Deno.test("chemin d'une mise en scène", () => {
  assertEquals(
    cheminMiseEnScene("micabo", "fr", "parcours", "iphone", "a56f6bb0-53b0", "png"),
    "mises-en-scene/micabo/fr/parcours-iphone-a56f6bb0.png",
  );
});

Deno.test("supports : iphone, tablette, ordinateur", () => {
  assert(supportValide("tablette"));
  assert(!supportValide("ipad"));
});

Deno.test("couples manquants : même support, variés, sans les existants", () => {
  const captures = [
    { id: "parcours", support: "iphone" },
    { id: "notes", support: "iphone" },
    { id: "site", support: "ordinateur" },
  ];
  const integrateurs = [
    { id: "goûter", support: "iphone" },
    { id: "bureau", support: "iphone" },
    { id: "ordi", support: "ordinateur" },
  ];
  const couples = couplesManquants(captures, integrateurs, [{ capture_id: "notes", integrateur_id: "goûter" }]);
  assertEquals(couples.map((c) => `${c.capture_id}×${c.integrateur_id}`), [
    "parcours×goûter",
    "notes×bureau",
    "parcours×bureau",
    "site×ordi",
  ]);
  // Jamais une capture d'iPhone sur un ordinateur.
  assert(!couples.some((c) => c.capture_id === "site" && c.integrateur_id !== "ordi"));
});

Deno.test("prompt de version : seul l'écran change", () => {
  const p = promptVersion(undefined, "iphone");
  assert(p.includes("Replace ONLY the content of the phone screen"));
  assert(!p.includes("{appareil}"));
});

function morceauPng(type: string, data: Uint8Array): Uint8Array {
  const m = new Uint8Array(12 + data.length);
  new DataView(m.buffer).setUint32(0, data.length);
  m.set([...type].map((c) => c.charCodeAt(0)), 4);
  m.set(data, 8);
  return m; // CRC laissé à zéro : sans importance pour le tri des morceaux.
}

Deno.test("métadonnées : le XMP « IA » de Nano Banana sort du PNG, les pixels restent", () => {
  const xmp = new TextEncoder().encode("XML:com.adobe.xmp\0\0\0\0\0DigitalSourceType trainedAlgorithmicMedia Made with Google AI");
  const ihdr = morceauPng("IHDR", new Uint8Array(13));
  const idat = morceauPng("IDAT", new Uint8Array([1, 2, 3]));
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...ihdr, ...morceauPng("iTXt", xmp), ...morceauPng("zTXt", new Uint8Array(4)), ...morceauPng("caBX", new Uint8Array(4)),
    ...idat, ...morceauPng("IEND", new Uint8Array()),
  ]);
  const propre = sansMetadonnees(png);
  const texte = new TextDecoder("latin1").decode(propre);
  assert(!texte.includes("trainedAlgorithmicMedia") && !texte.includes("Google"));
  assert(!texte.includes("iTXt") && !texte.includes("zTXt") && !texte.includes("caBX"));
  assert(texte.includes("IHDR") && texte.includes("IDAT") && texte.includes("IEND"));
  assertEquals(propre.length, 8 + ihdr.length + idat.length + 12);
});

Deno.test("métadonnées : JPEG sans EXIF, XMP ni C2PA (APP1, APP11), avec JFIF et ICC", () => {
  const seg = (m: number, n: number) => [0xff, m, 0, n + 2, ...new Array(n).fill(7)];
  const jpg = new Uint8Array([
    0xff, 0xd8, ...seg(0xe0, 2), ...seg(0xe1, 3), ...seg(0xe2, 2), ...seg(0xeb, 4), ...seg(0xfe, 1),
    ...seg(0xdb, 2), 0xff, 0xda, 0, 2, 9, 9, 0xff, 0xd9,
  ]);
  const propre = sansMetadonnees(jpg);
  const marqueurs = [...propre].flatMap((v, i) => (v === 0xff && propre[i + 1] >= 0xc0 ? [propre[i + 1]] : []));
  assertEquals(marqueurs, [0xd8, 0xe0, 0xe2, 0xdb, 0xda, 0xd9]);
});

Deno.test("format : imposé d'après l'image de départ, rendu refusé s'il prend celui de la capture", () => {
  assertEquals(ratioImpose({ largeur: 1696, hauteur: 2528 }), "2:3");
  assertEquals(ratioImpose({ largeur: 1792, hauteur: 2400 }), "3:4");
  const origine = { largeur: 1696, hauteur: 2528 };
  assert(formatRespecte(origine, { largeur: 1696, hauteur: 2528 }));
  assert(formatRespecte(origine, { largeur: 1664, hauteur: 2496 }));
  // Le cas du 24/10 : version allemande au format de la capture.
  assert(!formatRespecte(origine, { largeur: 1408, hauteur: 3040 }));
  assert(!formatRespecte(origine, null));
});
