import assert from "node:assert/strict";
import { test } from "node:test";
import { type Candidat, alerteDescription, fusionner, lireEpingle, refPinimg, refusFormat, tailleSortie, trouver, verifierDecisions, zone } from "./pinterest.ts";

const REF = "5496905108708e2c35c70a0d2388326d";
const epingle = (l: number, h: number, plus: Record<string, unknown> = {}) => ({
  type: "pin",
  url: "https://www.pinterest.com/pin/e1_AfqPShwMV7PqcMVnlaRmI8s-AEDz/",
  description: "morning run",
  domain: "Uploaded by user",
  images: {
    "236x": { width: 236, height: 295, url: `https://i.pinimg.com/236x/54/96/90/${REF}.jpg` },
    orig: { width: l, height: h, url: `https://i.pinimg.com/originals/54/96/90/${REF}.jpg` },
  },
  ...plus,
});

test("refPinimg : la même empreinte pour toutes les tailles", () => {
  assert.equal(refPinimg(`https://i.pinimg.com/originals/54/96/90/${REF}.jpg`), REF);
  assert.equal(refPinimg(`https://i.pinimg.com/236x/54/96/90/${REF}.jpg`), REF);
  assert.equal(refPinimg(`https://exemple.com/236x/54/96/90/${REF}.jpg`), null);
});

test("zone : le plus grand 9:16, calé selon le cadrage", () => {
  // 4:5 (1440×1800) : on coupe sur les côtés.
  assert.deepEqual(zone(1440, 1800), { x: 213.75, y: 0, l: 1012.5, h: 1800 });
  assert.equal(zone(1440, 1800, "gauche").x, 0);
  assert.equal(zone(1440, 1800, "droite").x, 427.5);
  // Plus étroite que le 9:16 (1000×2000) : on coupe en haut et en bas.
  const z = zone(1000, 2000);
  assert.equal(z.l, 1000);
  assert.ok(Math.abs(z.h - 1777.78) < 0.01 && Math.abs(z.y - 111.11) < 0.01);
  assert.equal(zone(1000, 2000, "haut").y, 0);
  assert.ok(Math.abs(zone(1000, 2000, "bas").y - 222.22) < 0.01);
  // Déjà en 9:16 : toute l'image.
  assert.deepEqual(zone(1080, 1920), { x: 0, y: 0, l: 1080, h: 1920 });
});

test("tailleSortie : 1080 de large au plus, jamais agrandie", () => {
  assert.deepEqual(tailleSortie(3024, 4032), { l: 1080, h: 1920 });
  assert.deepEqual(tailleSortie(1440, 1800), { l: 1012, h: 1799 });
  assert.deepEqual(tailleSortie(736, 1308), { l: 735, h: 1307 });
});

test("refusFormat : verticale et assez grande pour 720 px de large", () => {
  assert.equal(refusFormat(1440, 1800), null);
  assert.equal(refusFormat(736, 1308), null);
  assert.equal(refusFormat(736, 920), "trop petite"); // 4:5 en 736 → 517 px une fois en 9:16
  assert.equal(refusFormat(675, 1200), "trop petite");
  assert.equal(refusFormat(1600, 1600), "pas verticale");
  assert.equal(refusFormat(1920, 1080), "pas verticale");
  assert.equal(refusFormat(0, 0), "dimensions inconnues");
});

test("lireEpingle : une candidate avec son empreinte, sa vignette et son épingle", () => {
  const c = lireEpingle(epingle(1440, 1800), "men running", "2026-11-19T10:00:00Z") as Candidat;
  assert.equal(c.ref, REF);
  assert.equal(c.image_url, `https://i.pinimg.com/originals/54/96/90/${REF}.jpg`);
  assert.equal(c.vignette, `https://i.pinimg.com/236x/54/96/90/${REF}.jpg`);
  assert.deepEqual([c.largeur, c.hauteur, c.domaine, c.requetes], [1440, 1800, null, ["men running"]]);
  assert.equal(c.page_url, "https://www.pinterest.com/pin/e1_AfqPShwMV7PqcMVnlaRmI8s-AEDz/");
  assert.equal(c.alerte, undefined);
});

test("lireEpingle : écarte d'office les vidéos, les petites, les horizontales, les GIF", () => {
  assert.deepEqual(lireEpingle(epingle(736, 920), "q", "t"), { ecartee: "trop petite", ref: REF });
  assert.deepEqual(lireEpingle(epingle(1920, 1080), "q", "t"), { ecartee: "pas verticale", ref: REF });
  assert.deepEqual(lireEpingle(epingle(1440, 1800, { videos: { video_list: {} } }), "q", "t"), { ecartee: "vidéo", ref: REF });
  const gif = epingle(1440, 1800);
  gif.images.orig.url = gif.images.orig.url.replace(".jpg", ".gif");
  assert.deepEqual(lireEpingle(gif, "q", "t"), { ecartee: "gif", ref: REF });
  const png = epingle(1440, 1800);
  png.images.orig.url = png.images.orig.url.replace(".jpg", ".png");
  assert.equal((lireEpingle(png, "q", "t") as Candidat).image_url, `https://i.pinimg.com/originals/54/96/90/${REF}.png`);
  assert.equal(lireEpingle({ type: "pin", images: {} }, "q", "t"), null);
  assert.equal(lireEpingle({ ...epingle(1440, 1800), type: "board" }, "q", "t"), null);
});

test("lireEpingle : un original HEIC (photo d'iPhone) passe par le JPEG de 1200 px de Pinterest", () => {
  const heic = epingle(3024, 4032);
  heic.images.orig.url = heic.images.orig.url.replace(".jpg", ".heic");
  const c = lireEpingle(heic, "q", "t") as Candidat;
  assert.equal(c.image_url, `https://i.pinimg.com/1200x/54/96/90/${REF}.jpg`);
  assert.deepEqual([c.largeur, c.hauteur], [1200, 1600]);
  // Un petit HEIC garde sa taille, et se fait écarter comme une autre image.
  const petit = epingle(736, 981);
  petit.images.orig.url = petit.images.orig.url.replace(".jpg", ".heic");
  assert.deepEqual(lireEpingle(petit, "q", "t"), { ecartee: "trop petite", ref: REF });
});

test("alerteDescription : pub, marque ou concurrent dans la description", () => {
  assert.equal(alerteDescription("running on coffee #adidasSupernova @zalando ad"), "zalando");
  assert.equal(alerteDescription("my Sunday long run"), undefined);
  assert.equal(alerteDescription("Strava kudos only"), "strava");
  assert.equal(alerteDescription("shadow on the road"), undefined); // « ad » dans un mot ne compte pas
  assert.equal((lireEpingle(epingle(1440, 1800, { description: "new Nike drop" }), "q", "t") as Candidat).alerte, "nike");
});

test("fusionner : une image déjà vue garde sa décision et gagne la requête", () => {
  const a = lireEpingle(epingle(1440, 1800), "men running", "t1") as Candidat;
  const stock: Record<string, Candidat> = {};
  assert.deepEqual(fusionner(stock, [a]), { neuves: 1, revues: 0 });
  stock[REF].decision = "ecartee";
  const b = lireEpingle(epingle(1440, 1800), "trail running", "t2") as Candidat;
  assert.deepEqual(fusionner(stock, [b]), { neuves: 0, revues: 1 });
  assert.equal(stock[REF].decision, "ecartee");
  assert.deepEqual(stock[REF].requetes, ["men running", "trail running"]);
});

test("trouver : par le début de l'empreinte, sans ambiguïté", () => {
  const a = lireEpingle(epingle(1440, 1800), "q", "t") as Candidat;
  const b = { ...a, ref: `549690${"f".repeat(26)}` };
  assert.equal(trouver({ [a.ref]: a }, "549690").ref, REF);
  assert.throws(() => trouver({ [a.ref]: a, [b.ref]: b }, "549690"), /plusieurs/);
  assert.equal(trouver({ [a.ref]: a, [b.ref]: b }, "5496905").ref, REF);
  assert.throws(() => trouver({ [a.ref]: a }, "abcdef"), /aucune/);
  assert.throws(() => trouver({ [a.ref]: a }, "549"), /6 caractères/);
});

test("verifierDecisions : légende en anglais, cadrage connu, pas de doublon", () => {
  const bon = verifierDecisions([{ ref: "549690", legende: "man running on a foggy road", cadrage: "haut", visage: true }, { ref: "ABCDEF", legende: "red running track at night" }]);
  assert.deepEqual(bon.erreurs, []);
  assert.deepEqual(bon.decisions, [
    { ref: "549690", legende: "man running on a foggy road", cadrage: "haut", visage: true },
    { ref: "abcdef", legende: "red running track at night" },
  ]);
  // L'OS décrit l'image : l'empreinte seule suffit, la légende n'est qu'un secours.
  assert.deepEqual(verifierDecisions(["549690", { ref: "abcdef", cadrage: "bas" }]), {
    decisions: [{ ref: "549690" }, { ref: "abcdef", cadrage: "bas" }],
    erreurs: [],
  });
  assert.equal(verifierDecisions({}).erreurs.length, 1);
  assert.equal(verifierDecisions([{ ref: "549690", legende: "run" }]).erreurs.length, 1);
  assert.equal(verifierDecisions([{ ref: "549", legende: "man running on a road" }]).erreurs.length, 1);
  assert.equal(verifierDecisions([{ ref: "549690", legende: "man running on a road", cadrage: "milieu" }]).erreurs.length, 1);
  assert.equal(verifierDecisions([{ ref: "549690", legende: "man running on a road" }, { ref: "549690", legende: "man running on a road" }]).erreurs.length, 1);
  assert.equal(verifierDecisions([{ ref: "549690", legende: "man running on a road", labels: [] }]).erreurs.length, 1);
});
