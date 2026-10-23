import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  aRefaire,
  cheminMiseEnScene,
  couplesManquants,
  ecranValide,
  etatBudget,
  extensionImage,
  langueValide,
  lireReglagesMisesEnScene,
  promptIncrustation,
  promptTraduction,
  relancePermise,
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
  assertEquals(lireReglagesMisesEnScene(null), { budget_fal_usd_semaine: 3, prix_image_usd: 0.15 });
  assertEquals(lireReglagesMisesEnScene({ budget_fal_usd_semaine: "x" }).budget_fal_usd_semaine, 3);
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
