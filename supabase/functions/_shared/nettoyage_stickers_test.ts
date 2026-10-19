import { assert, assertEquals } from "jsr:@std/assert@1";

import { motifRetrait, porteSticker, tierProtege } from "./nettoyage_stickers.ts";

Deno.test("tier A, S, S+ protégés — Sophia ou une autre application", () => {
  assert(tierProtege(["A"]));
  assert(tierProtege(["s+"]));
  assert(tierProtege(["C", null, "S"]));
  assert(!tierProtege(["B", "C", "D"]));
  assert(!tierProtege([null, undefined]));
  assert(!tierProtege([]));
});

Deno.test("porteSticker : seulement les familles cochées", () => {
  const slides = [{ sticker: null }, { sticker: "contenu" as const }, { sticker: null }];
  assert(porteSticker(slides, ["pub", "contenu"]));
  assert(porteSticker(slides, ["contenu"]));
  assert(!porteSticker(slides, ["pub"]));
  assert(!porteSticker([{ sticker: null }], ["pub", "contenu"]));
});

Deno.test("motif de retrait avec ou sans label", () => {
  assertEquals(motifRetrait("RH"), "Sticker (nettoyage stickers du label RH) — retiré");
  assertEquals(motifRetrait(null), "Sticker (nettoyage stickers) — retiré");
});
