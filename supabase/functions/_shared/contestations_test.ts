import { assertEquals } from "jsr:@std/assert@1";

import { ACCUSE_DEFAUT, construirePromptContestation, lireContestation, sansSuspendus, texteAccuse } from "./contestations.ts";

Deno.test("contestation : la réponse du modèle", () => {
  assertEquals(lireContestation('ok {"conteste":"paie"}'), "paie");
  assertEquals(lireContestation('{"conteste":"kill"}'), "kill");
  assertEquals(lireContestation('{"conteste":null}'), null);
  assertEquals(lireContestation('{"conteste":"bonus"}'), null);
  assertEquals(lireContestation("rien"), null);
  assertEquals(construirePromptContestation("I wasn't paid").includes("I wasn't paid"), true);
});

Deno.test("contestation : la réponse automatique", () => {
  assertEquals(texteAccuse(null, "Ana"), ACCUSE_DEFAUT);
  assertEquals(texteAccuse("Hi {prenom}, checking.", "Ana"), "Hi Ana, checking.");
  assertEquals(texteAccuse("Hi {prenom}", null), "Hi there");
});

Deno.test("contestation sur un Kill : l'arrêt attend, pas de fin de contrat", () => {
  const file = [{ id: "a1", poster_id: "p1" }, { id: "a2", poster_id: "p2" }];
  const r = sansSuspendus(file, ["p2"]);
  assertEquals(r.garder.map((a) => a.id), ["a1"]);
  assertEquals(r.suspendus.map((a) => a.id), ["a2"]);
  assertEquals(sansSuspendus(file, []).garder.length, 2);
});
