import { assertEquals } from "jsr:@std/assert@1";

import { contratDeUrl, erreurPosteurExistant, posteurExistantDeErreur } from "./contrat_unique.ts";

Deno.test("un profil par contrat : le n° depuis l'URL, l'erreur aller-retour", () => {
  assertEquals(contratDeUrl("https://www.upwork.com/nx/wm/workroom/44804526/overview"), "44804526");
  assertEquals(contratDeUrl("https://www.upwork.com/ab/contracts/44804526"), "44804526");
  assertEquals(contratDeUrl("https://www.upwork.com/freelancers/~01abc"), null);
  assertEquals(contratDeUrl(null), null);
  const id = "0a27f195-c75f-47b0-89a0-f4d372296867";
  const e = erreurPosteurExistant({ id, nom: "Karolina J", email: "karolinaj@sophia.com" });
  assertEquals(e, `POSTER_EXISTANT|${id}|Karolina J|karolinaj@sophia.com`);
  assertEquals(posteurExistantDeErreur(e), id);
  assertEquals(posteurExistantDeErreur("POSTER_EN_COURS"), null);
  assertEquals(posteurExistantDeErreur(undefined), null);
});
