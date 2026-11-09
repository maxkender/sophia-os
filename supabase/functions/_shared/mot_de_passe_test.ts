import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";

import { MOT_DE_PASSE_COMMUN, motDePasseCreation, motDePasseRecrue } from "./mot_de_passe.ts";

Deno.test("31/10 : un mot de passe par recrue, 8 caractères faciles à taper", () => {
  const m = motDePasseRecrue();
  assertEquals(m.length, 8);
  assert(/^[bcdfghjkmnprstvwz][aeuy][bcdfghjkmnprstvwz][aeuy][2-9]{4}$/.test(m), m);
  assertEquals(motDePasseRecrue(() => 0), "baba2222");
  // 9/11 : 12345678 pour tous pour l'instant (rien, « auto » ou 12345678) ; un choix explicite reste.
  assertEquals(motDePasseCreation(MOT_DE_PASSE_COMMUN), MOT_DE_PASSE_COMMUN);
  assertEquals(motDePasseCreation("auto"), "12345678");
  assertEquals(motDePasseCreation(undefined), "12345678");
  assertNotEquals(motDePasseRecrue(), "");
  assertEquals(motDePasseCreation("MonChoix99"), "MonChoix99");
});
