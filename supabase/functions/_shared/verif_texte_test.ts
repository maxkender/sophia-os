import { assertEquals } from "jsr:@std/assert@1";

import { lireVerdictTexte } from "./verif_texte.ts";

Deno.test("verdict du contrôle de texte : JSON nu, en bloc de code, ou illisible", () => {
  assertEquals(lireVerdictTexte('{"texte": true, "extrait": "Skin"}'), { reste: true, extrait: "Skin" });
  assertEquals(lireVerdictTexte('```json\n{"texte": false, "extrait": ""}\n```'), { reste: false, extrait: "" });
  assertEquals(lireVerdictTexte("Oui, il reste du texte."), null);
  assertEquals(lireVerdictTexte('{"texte": "oui"}'), null);
  assertEquals(lireVerdictTexte('{"texte": true}'), { reste: true, extrait: "" });
});
