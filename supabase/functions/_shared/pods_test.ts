import { assertEquals } from "jsr:@std/assert@1";
import { deckLivrePret, metadonneesJpeg, sha256Hex, verifierDepot, verifierOriginal } from "./pods.ts";

Deno.test("deckLivrePret : toutes les slides doivent avoir leur image", () => {
  assertEquals(deckLivrePret([]), false);
  assertEquals(deckLivrePret(null), false);
  assertEquals(deckLivrePret([{ position: 1, media_id: "a" }, { position: 2, media_id: null }]), false);
  assertEquals(deckLivrePret([{ position: 1, media_id: "a" }, { position: 2, media_id: "b" }]), true);
});

Deno.test("metadonneesJpeg : repère EXIF, ICC, C2PA, commentaires ; ignore JFIF", () => {
  const seg = (m: number, n = 4) => [0xff, m, 0, n + 2, ...new Array(n).fill(0)];
  const jpeg = (...segs: number[][]) => new Uint8Array([0xff, 0xd8, ...segs.flat(), 0xff, 0xda, 0, 2]);
  assertEquals(metadonneesJpeg(jpeg(seg(0xe0))), []);
  assertEquals(metadonneesJpeg(jpeg(seg(0xe0), seg(0xe1), seg(0xe2), seg(0xeb), seg(0xfe))), ["0xe1", "0xe2", "0xeb", "0xfe"]);
  assertEquals(metadonneesJpeg(new Uint8Array([0x89, 0x50])), null);
});

Deno.test("verifierDepot : langue source, slide de l'app, positions uniques", () => {
  const s = (position: number, position_sophia = false) => ({ position, position_sophia, jpeg_base64: "" });
  assertEquals(verifierDepot({ fr: { slides: [s(1), s(2, true)] } }, "fr"), []);
  assertEquals(verifierDepot({}, "fr"), ["aucun deck"]);
  assertEquals(verifierDepot({ de: { slides: [s(1, true)] } }, "fr"), ["pas de deck dans la langue source (fr)"]);
  assertEquals(verifierDepot({ fr: { slides: [s(1), s(1, true)] } }, "fr"), ["fr : positions en double"]);
  assertEquals(verifierDepot({ fr: { slides: [s(1)] } }, "fr"), ["fr : aucune slide de l'app"]);
});

Deno.test("sha256Hex", async () => {
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

Deno.test("verifierOriginal : positions, images, longueurs, aucune appli", () => {
  const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const ok = [1, 2, 3, 4, 5, 6].map((p) => ({ position: p, media_id: id(p), texte_overlay: `slide ${p}` }));
  assertEquals(verifierOriginal(ok), []);
  assertEquals(verifierOriginal(ok.slice(0, 3)).length > 0, true);
  assertEquals(verifierOriginal([...ok.slice(0, 5), { ...ok[5], position: 7 }]).length > 0, true);
  assertEquals(verifierOriginal([...ok.slice(0, 5), { ...ok[5], media_id: id(1) }]), ["même image utilisée deux fois"]);
  assertEquals(verifierOriginal([...ok.slice(0, 5), { ...ok[5], texte_overlay: "i use the sophia app" }]).length, 1);
  assertEquals(verifierOriginal([...ok.slice(0, 5), { ...ok[5], texte_overlay: "the vent now app helped" }]).length, 1);
  assertEquals(verifierOriginal([{ ...ok[0], texte_overlay: "x".repeat(121) }, ...ok.slice(1)]).length, 1);
  assertEquals(verifierOriginal([...ok.slice(0, 5), { ...ok[5], texte_overlay: " " }]), ["#6 : texte vide"]);
});
