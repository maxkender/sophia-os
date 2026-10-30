import { assert, assertEquals } from "jsr:@std/assert@1";

import { CODES_FORMES, FORMES_CTA, lireClassement, promptClassement } from "./formes_cta.ts";

Deno.test("7 formes, toutes distinctes, plus « autre »", () => {
  assertEquals(FORMES_CTA.length, 7);
  assertEquals(CODES_FORMES.size, 8);
});

Deno.test("le classement lit les formes valides et range l'inconnu dans « autre »", () => {
  const brut = 'voilà : {"formes":[{"id":0,"forme":"habitude_perso"},{"id":1,"forme":"inventée"},{"id":7,"forme":"point_liste"}]}';
  const lu = lireClassement(brut, 3);
  assertEquals(lu.get(0), "habitude_perso");
  assertEquals(lu.get(1), "autre");
  assertEquals(lu.has(2), false);
  assertEquals(lu.has(7), false);
  assertEquals(lireClassement("pas de json", 3).size, 0);
});

Deno.test("la consigne de classement liste les formes par priorité et numérote les CTA", () => {
  const p = promptClassement([
    { cta_hash: "a", cta_texte: "j'utilise l'appli Sophia", avant: "4. lis" },
    { cta_hash: "b", cta_texte: "an app like Sophia", avant: null },
  ]);
  assert(p.indexOf("format_du_post") < p.indexOf("point_liste"));
  assert(p.includes('{"id":0,"avant":"4. lis","cta":"j\'utilise l\'appli Sophia"}'));
  assert(p.includes('{"id":1,"avant":"","cta":"an app like Sophia"}'));
});
