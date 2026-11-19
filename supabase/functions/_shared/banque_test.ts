import { assertEquals } from "jsr:@std/assert@1";
import { BANQUE_EXTERNE, estPageEpingle, lireDemandeBanque, lireLabels, lireLegendeSecours, lireRefs, rapprocherLabels, refPinimg } from "./banque.ts";
import { controlerImageBanque, controlerJpegBanque } from "./image_banque.ts";

const REF = "5496905108708e2c35c70a0d2388326d";
const IMAGE = `https://i.pinimg.com/originals/54/96/90/${REF}.jpg`;

Deno.test("refPinimg : la même empreinte pour toutes les tailles d'une image", () => {
  assertEquals(refPinimg(IMAGE), REF);
  assertEquals(refPinimg(`https://i.pinimg.com/736x/54/96/90/${REF}.jpg`), REF);
  assertEquals(refPinimg(`https://i.pinimg.com/236x/54/96/90/${REF.toUpperCase()}.JPG`), REF);
  assertEquals(refPinimg(` https://i.pinimg.com/474x/54/96/90/${REF}.webp `), REF);
});

Deno.test("refPinimg : refuse ce qui n'est pas une image de i.pinimg.com", () => {
  assertEquals(refPinimg(`https://exemple.com/originals/54/96/90/${REF}.jpg`), null);
  assertEquals(refPinimg(`http://i.pinimg.com/originals/54/96/90/${REF}.jpg`), null);
  assertEquals(refPinimg(`https://i.pinimg.com/originals/54/96/90/${REF}.jpg?x=1`), null);
  assertEquals(refPinimg("https://i.pinimg.com/originals/54/96/90/court.jpg"), null);
  assertEquals(refPinimg(`https://i.pinimg.com.exemple.com/originals/54/96/90/${REF}.jpg`), null);
  assertEquals(refPinimg(""), null);
});

Deno.test("estPageEpingle : l'adresse d'une épingle, quel que soit le pays", () => {
  assertEquals(estPageEpingle("https://www.pinterest.com/pin/1054827543951238554/"), true);
  assertEquals(estPageEpingle("https://www.pinterest.com/pin/e1_AfqPShwMV7PqcMVnlaRmI8s-AEDzNzF6k5DPmHWz--TmRNXhnfo8Hw/"), true);
  assertEquals(estPageEpingle("https://fr.pinterest.com/pin/123456789/"), true);
  assertEquals(estPageEpingle("https://www.pinterest.co.uk/pin/123456789"), true);
  assertEquals(estPageEpingle("https://www.pinterest.com/aurimaski/sportsgym/"), false);
  assertEquals(estPageEpingle("https://pinterest.com.exemple.com/pin/123456789/"), false);
  assertEquals(estPageEpingle("https://www.pinterest.com/pin/123456789/?utm=1"), false);
});

Deno.test("lireLabels : minuscules, sans doublon, bornés", () => {
  assertEquals(lireLabels(["male_run", " Male_Run ", "clean-girl-run"]), ["male_run", "clean-girl-run"]);
  assertEquals("erreur" in (lireLabels([]) as object), true);
  assertEquals("erreur" in (lireLabels("male_run") as object), true);
  assertEquals("erreur" in (lireLabels(["male run"]) as object), true);
  assertEquals("erreur" in (lireLabels(["a,b"]) as object), true);
  const trop = Array.from({ length: BANQUE_EXTERNE.labelsMax + 1 }, (_, i) => `label_${i}`);
  assertEquals("erreur" in (lireLabels(trop) as object), true);
});

Deno.test("lireDemandeBanque : l'empreinte vient de l'adresse de l'image, pas de l'appelant", () => {
  const d = lireDemandeBanque({
    labels: ["male_run"],
    origine: { site: "pinterest", ref: "ffffffffffffffffffffffffffffffff", image_url: IMAGE, page_url: "https://www.pinterest.com/pin/123456/", requete: " men running " },
  });
  assertEquals(d, {
    labels: ["male_run"],
    origine: { site: "pinterest", ref: REF, image_url: IMAGE, page_url: "https://www.pinterest.com/pin/123456/", requete: "men running" },
  });
});

Deno.test("lireDemandeBanque : l'épingle et la requête sont facultatives", () => {
  const d = lireDemandeBanque({ labels: ["male_run"], origine: { site: "pinterest", image_url: IMAGE } });
  assertEquals("erreur" in d, false);
  if (!("erreur" in d)) assertEquals([d.origine.page_url, d.origine.requete], [null, null]);
});

Deno.test("lireDemandeBanque : refus", () => {
  const refus = (body: Record<string, unknown>) => "erreur" in lireDemandeBanque(body);
  assertEquals(refus({ origine: { site: "pinterest", image_url: IMAGE } }), true);
  assertEquals(refus({ labels: ["male_run"] }), true);
  assertEquals(refus({ labels: ["male_run"], origine: { site: "unsplash", image_url: IMAGE } }), true);
  assertEquals(refus({ labels: ["male_run"], origine: { site: "pinterest", image_url: "https://exemple.com/a.jpg" } }), true);
  assertEquals(refus({ labels: ["male_run"], origine: { site: "pinterest", image_url: IMAGE, page_url: "https://exemple.com/pin/1234/" } }), true);
  assertEquals(refus({ labels: ["male_run"], origine: { site: "pinterest", image_url: IMAGE, requete: "x".repeat(BANQUE_EXTERNE.requeteMax + 1) } }), true);
});

Deno.test("lireRefs : seulement des empreintes, sans doublon", () => {
  assertEquals(lireRefs([REF, REF.toUpperCase(), "pas-une-ref", 12, null]), [REF]);
  assertEquals(lireRefs("x"), []);
  const beaucoup = Array.from({ length: BANQUE_EXTERNE.refsMax + 50 }, (_, i) => i.toString(16).padStart(32, "0"));
  assertEquals(lireRefs(beaucoup).length, BANQUE_EXTERNE.refsMax);
});

Deno.test("rapprocherLabels : par nom ou par slug, le premier inconnu sinon", () => {
  const base = [
    { id: "1", nom: "male_run", slug: "male-run" },
    { id: "2", nom: "clean_girl_run", slug: "clean-girl-run" },
  ];
  assertEquals(rapprocherLabels(["male_run", "clean-girl-run"], base), { labels: base });
  assertEquals(rapprocherLabels(["male_run", "male-run"], base), { labels: [base[0]] });
  assertEquals(rapprocherLabels(["male_run", "manga_tok"], base), { inconnu: "manga_tok" });
});

Deno.test("lireLegendeSecours : facultative, sinon en anglais et bornée", () => {
  assertEquals(lireLegendeSecours(undefined), "");
  assertEquals(lireLegendeSecours("  "), "");
  assertEquals(lireLegendeSecours(" man running   on a road "), "man running on a road");
  assertEquals(typeof lireLegendeSecours("run"), "object");
  assertEquals(typeof lireLegendeSecours("x".repeat(301)), "object");
});

/** Un JPEG minimal : SOI, APP0 (JFIF), segments en plus, SOF0 aux dimensions données, SOS. */
function jpeg(l: number, h: number, plus: number[][] = []): Uint8Array {
  const sof = [0xff, 0xc0, 0x00, 0x0b, 0x08, h >> 8, h & 0xff, l >> 8, l & 0xff, 0x01, 0x01, 0x11, 0x00];
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, ...plus.flat(), ...sof, 0xff, 0xda, 0x00, 0x02]);
}

Deno.test("controlerJpegBanque : 9:16, assez large, sans aucune métadonnée", () => {
  assertEquals(controlerJpegBanque(jpeg(1080, 1920)), []);
  assertEquals(controlerJpegBanque(jpeg(720, 1280)), []);
  assertEquals(controlerJpegBanque(jpeg(700, 1244)).length, 1);
  assertEquals(controlerJpegBanque(jpeg(1080, 1350)).length, 1);
  assertEquals(controlerJpegBanque(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), ["pas un JPEG"]);
  // EXIF/XMP (APP1), profil de couleur (APP2), commentaire : refusés un par un.
  for (const m of [0xe1, 0xe2, 0xfe]) {
    const e = controlerJpegBanque(jpeg(1080, 1920, [[0xff, m, 0x00, 0x04, 0x00, 0x00]]));
    assertEquals(e.length, 1);
    assertEquals(e[0].includes(`0x${m.toString(16)}`), true);
  }
});

Deno.test("controlerImageBanque : le fichier, puis la légende (podz)", () => {
  assertEquals(controlerImageBanque(jpeg(1080, 1920), "man running on a road"), []);
  assertEquals(controlerImageBanque(jpeg(1080, 1920), "run").length, 1);
  assertEquals(controlerImageBanque(jpeg(700, 1244), "run").length, 2);
  assertEquals(controlerImageBanque(Uint8Array.from([1, 2, 3]), "man running on a road"), ["pas un JPEG"]);
});
