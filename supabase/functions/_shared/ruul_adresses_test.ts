import { assertEquals } from "jsr:@std/assert@1";

import { adresseDeConnexion, slackEnPause } from "./ruul_adresses.ts";
import { DM_SLACK_PAUSE } from "./slack_posteur.ts";

Deno.test("adresse de connexion : @sophia.com jamais destinataire", () => {
  assertEquals(adresseDeConnexion("prenomn@sophia.com"), true);
  assertEquals(adresseDeConnexion("PrenomN@Sophia.com "), true);
  assertEquals(adresseDeConnexion("prenom@gmail.com"), false);
  assertEquals(adresseDeConnexion("x@sophia-culture.com"), false);
  assertEquals(adresseDeConnexion(null), false);
});

Deno.test("DM Slack en pause : pas une erreur", () => {
  assertEquals(slackEnPause({ statut: "erreur", erreur: DM_SLACK_PAUSE }), true);
  assertEquals(slackEnPause({ statut: "erreur", erreur: "postMessage: channel_not_found" }), false);
  assertEquals(slackEnPause({ statut: "introuvable" }), false);
  assertEquals(slackEnPause({ statut: "envoye" }), false);
});
