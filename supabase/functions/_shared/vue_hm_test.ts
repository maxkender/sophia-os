import { assertEquals } from "jsr:@std/assert@1";

import { sessionDuJeton } from "./vue_hm.ts";

const jeton = (charge: unknown) =>
  `x.${btoa(JSON.stringify(charge)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.y`;

Deno.test("sessionDuJeton : lit le session_id d'un JWT", () => {
  const id = "0b5c2c2e-6a1d-4b55-9a0e-6f1f4f0e8a11";
  assertEquals(sessionDuJeton(jeton({ sub: "u", session_id: id })), id);
});

Deno.test("sessionDuJeton : null sans claim, claim invalide ou jeton illisible", () => {
  assertEquals(sessionDuJeton(jeton({ sub: "u" })), null);
  assertEquals(sessionDuJeton(jeton({ session_id: "'; drop table" })), null);
  assertEquals(sessionDuJeton("pas-un-jwt"), null);
});
