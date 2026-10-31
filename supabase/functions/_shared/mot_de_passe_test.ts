import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";

import { MOT_DE_PASSE_COMMUN, motDePasseCreation, motDePasseRecrue } from "./mot_de_passe.ts";

Deno.test("31/10 : un mot de passe par recrue, 8 caractères faciles à taper", () => {
  const m = motDePasseRecrue();
  assertEquals(m.length, 8);
  assert(/^[bcdfghjkmnprstvwz][aeuy][bcdfghjkmnprstvwz][aeuy][2-9]{4}$/.test(m), m);
  assertEquals(motDePasseRecrue(() => 0), "baba2222");
  // L'ancien mot de passe commun, « auto » ou rien : un unique ; un choix explicite reste.
  assertNotEquals(motDePasseCreation(MOT_DE_PASSE_COMMUN), MOT_DE_PASSE_COMMUN);
  assertEquals(motDePasseCreation("auto").length, 8);
  assertEquals(motDePasseCreation("MonChoix99"), "MonChoix99");
});
