import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";

import { ligneCorrection, promptConsolidation, verifierRegles } from "./regles_natives.ts";

Deno.test("ligneCorrection : avec et sans correction, avec explication", () => {
  assertEquals(
    ligneCorrection({ type: "calque", fautif: " Insouciant ", corrige: "unbekümmert", explication: "ça sonne traduit" }),
    "- [calque] au lieu de « Insouciant », écris « unbekümmert » (ça sonne traduit)",
  );
  assertEquals(ligneCorrection({ type: "registre", fautif: "Gentile utente", corrige: null, explication: null }), "- [registre] évite « Gentile utente »");
});

Deno.test("promptConsolidation : reprend les règles actuelles et chaque nouvelle correction", () => {
  const prompt = promptConsolidation({
    langue: "it",
    precedentes: "### Calques à éviter\n- au lieu de « fare senso », écris « avere senso »",
    nouvelles: [
      { type: "vocabulaire", fautif: "app di apprendimento", corrige: "app per imparare", explication: null },
      { type: "placement", fautif: "Scarica Sophia ora!", corrige: null, explication: "sembra una pubblicità" },
    ],
  });
  assertStringIncludes(prompt, "Règles actuelles");
  assertStringIncludes(prompt, "fare senso");
  assertStringIncludes(prompt, "Nouvelles corrections (2)");
  assertStringIncludes(prompt, "au lieu de « app di apprendimento », écris « app per imparare »");
  assertStringIncludes(prompt, "évite « Scarica Sophia ora! » (sembra una pubblicità)");
  assertStringIncludes(prompt, "Ne perds RIEN");
});

Deno.test("promptConsolidation : sans règles validées, pas de bloc « Règles actuelles »", () => {
  const prompt = promptConsolidation({ langue: "sk", precedentes: null, nouvelles: [{ type: "calque", fautif: "a", corrige: "b", explication: null }] });
  assert(!prompt.includes("Règles actuelles :"));
});

Deno.test("verifierRegles : texte rendu, vide refusé, fusion qui perd des règles refusée", () => {
  assertEquals(verifierRegles('{"regles":"### Vocabulaire\\n- x"}', null), "### Vocabulaire\n- x");
  assertEquals(verifierRegles('```json\n{"regles":" ### Sens\\n- y "}\n```', null), "### Sens\n- y");
  assertThrows(() => verifierRegles('{"regles":""}', null), Error, "vide");
  assertThrows(() => verifierRegles("pas du json", null), Error, "illisible");
  const avant = "- règle\n".repeat(100);
  assertThrows(() => verifierRegles(JSON.stringify({ regles: "- règle\n".repeat(30) }), avant), Error, "fusion refusée");
  assertEquals(verifierRegles(JSON.stringify({ regles: "- règle\n".repeat(90) }), avant).length > 0, true);
});
