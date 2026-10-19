import { assert, assertEquals } from "jsr:@std/assert@1";

import { motifRetrait, tierProtege } from "./nettoyage_stickers.ts";

Deno.test("tier A, S, S+ protégés — Sophia ou une autre application", () => {
  assert(tierProtege(["A"]));
  assert(tierProtege(["s+"]));
  assert(tierProtege(["C", null, "S"]));
  assert(!tierProtege(["B", "C", "D"]));
  assert(!tierProtege([null, undefined]));
  assert(!tierProtege([]));
});

Deno.test("motif de retrait avec ou sans label", () => {
  assertEquals(motifRetrait("RH"), "Sticker pub (nettoyage stickers du label RH) — retiré");
  assertEquals(motifRetrait(null), "Sticker pub (nettoyage stickers) — retiré");
});
