import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { lireOcrImport } from "./gemini.ts";

Deno.test("sticker collé → null : le TikTok n'est pas importé", () => {
  assertStrictEquals(lireOcrImport("(sticker)"), null);
  assertStrictEquals(lireOcrImport("  (Sticker)\n"), null);
});

Deno.test("sticker annoncé après un début de transcription → null quand même", () => {
  assertStrictEquals(lireOcrImport("When you want to become an A+ student:\n(sticker)"), null);
});

Deno.test("slide sans texte → chaîne vide, importée", () => {
  assertEquals(lireOcrImport("(aucun texte)"), "");
});

Deno.test("texte normal, même s'il parle de stickers → transcrit tel quel", () => {
  assertEquals(lireOcrImport("  3 habits that changed my life  "), "3 habits that changed my life");
  assertEquals(lireOcrImport("my (sticker) collection 😍"), "my (sticker) collection 😍");
});
