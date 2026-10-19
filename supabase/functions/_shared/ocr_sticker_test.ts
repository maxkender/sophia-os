import { assertEquals } from "jsr:@std/assert@1";

import { lireOcrImport } from "./gemini.ts";

Deno.test("sticker pub → rejet, sans texte", () => {
  assertEquals(lireOcrImport("(sticker pub)"), { texte: "", sticker: "pub" });
  assertEquals(lireOcrImport("  (Sticker Pub)\n"), { texte: "", sticker: "pub" });
});

Deno.test("pub annoncée après un début de transcription → rejet quand même", () => {
  assertEquals(lireOcrImport("When you want to become an A+ student:\n(sticker pub)"), {
    texte: "",
    sticker: "pub",
  });
});

Deno.test("« (sticker) » sans famille (ancienne consigne) → compté comme pub", () => {
  assertEquals(lireOcrImport("(sticker)"), { texte: "", sticker: "pub" });
});

Deno.test("sticker de contenu → importé, texte gardé sans la marque", () => {
  assertEquals(lireOcrImport("Read books to build durable mental models\n(sticker contenu)"), {
    texte: "Read books to build durable mental models",
    sticker: "contenu",
  });
  assertEquals(lireOcrImport("(aucun texte)\n(sticker contenu)"), { texte: "", sticker: "contenu" });
});

Deno.test("pub et contenu sur la même slide → la pub l'emporte", () => {
  assertEquals(lireOcrImport("(sticker contenu)\n(sticker pub)"), { texte: "", sticker: "pub" });
});

Deno.test("slide sans sticker : texte tel quel, « (aucun texte) » → vide", () => {
  assertEquals(lireOcrImport("  3 habits that changed my life  "), {
    texte: "3 habits that changed my life",
    sticker: null,
  });
  assertEquals(lireOcrImport("(aucun texte)"), { texte: "", sticker: null });
  assertEquals(lireOcrImport("my (sticker) collection 😍"), {
    texte: "my (sticker) collection 😍",
    sticker: null,
  });
});
