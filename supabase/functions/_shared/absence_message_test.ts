import { assertEquals } from "jsr:@std/assert@1";

import { lireReponseAbsence, parleAbsence, promptAbsence } from "./absence_message.ts";

Deno.test("absence par message : filtre de mots dans plusieurs langues", () => {
  assertEquals(parleAbsence("I'm sick today, I can't post"), true);
  assertEquals(parleAbsence("Je suis malade jusqu'à lundi"), true);
  assertEquals(parleAbsence("Estoy de viaje hasta el viernes"), true);
  assertEquals(parleAbsence("Ich bin krank"), true);
  assertEquals(parleAbsence("Where is my payment?"), false);
  assertEquals(parleAbsence(null), false);
});

Deno.test("absence par message : réponse du modèle lue, dates remises dans l'ordre, réponse illisible → null", () => {
  assertEquals(lireReponseAbsence('```json\n{"absent": true, "debut": "2026-11-24", "fin": "2026-11-22", "raison": "Sick"}\n```'),
    { absent: true, debut: "2026-11-22", fin: "2026-11-24", raison: "Sick" });
  assertEquals(lireReponseAbsence('{"absent": true, "debut": "lundi", "fin": null, "raison": ""}'), { absent: true, debut: null, fin: null, raison: null });
  assertEquals(lireReponseAbsence('{"absent": false}')?.absent, false);
  assertEquals(lireReponseAbsence("je ne sais pas"), null);
  assertEquals(promptAbsence("I'm sick", "2026-11-21").includes("2026-11-21"), true);
});
