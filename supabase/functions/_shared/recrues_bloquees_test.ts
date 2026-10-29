import { assertEquals } from "jsr:@std/assert@1";

import { compteBloque } from "./recrues_bloquees.ts";

Deno.test("un rouge pas décidé ne reçoit pas de posts, les autres si", () => {
  const rouges = new Set(["p1"]);
  assertEquals(compteBloque({ poster_id: "p1" }, rouges), true);
  assertEquals(compteBloque({ poster_id: "p2" }, rouges), false);
  assertEquals(compteBloque({ poster_id: null }, rouges), false);
  assertEquals(compteBloque({}, new Set()), false);
});
