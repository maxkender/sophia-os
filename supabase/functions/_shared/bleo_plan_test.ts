import { assertEquals } from "jsr:@std/assert@1";

import { colonnesBleoPassage, type LignePlanBleo, prochaineLignePlan } from "./bleo_plan.ts";

const ligne = (creneau: number, contenuId: string, langue = "de"): LignePlanBleo => ({
  runId: "run",
  creneau,
  contenuId,
  langue,
  applicationId: null,
  fileBleo: "valeur",
  categorie: "recolte",
  valeurTirage: 2.1,
});

Deno.test("plan BLEO : les créneaux sont servis dans l'ordre, un seul essai chacun", () => {
  const restantes = [ligne(1, "a"), ligne(2, "b")];
  assertEquals(prochaineLignePlan(restantes, "de", [])?.contenuId, "a");
  assertEquals(prochaineLignePlan(restantes, "de", [])?.contenuId, "b");
  assertEquals(prochaineLignePlan(restantes, "de", []), null);
});

Deno.test("plan BLEO : saute un contenu déjà pris et une autre langue", () => {
  const restantes = [ligne(1, "a"), ligne(2, "b", "fr"), ligne(3, "c")];
  assertEquals(prochaineLignePlan(restantes, "de", ["a"])?.contenuId, "c");
  assertEquals(restantes.length, 0);
});

Deno.test("plan BLEO : colonnes du passage selon qu'il suit le plan ou non", () => {
  assertEquals(colonnesBleoPassage(ligne(1, "a"), true), {
    bras: "bleo",
    file_bleo: "valeur",
    valeur_tirage: 2.1,
    bleo_run_id: "run",
  });
  // Mode actif, créneau rendu à la tierlist.
  assertEquals(colonnesBleoPassage(null, true), { bras: "temoin" });
  // Mode ombre ou off : rien ne change dans le passage.
  assertEquals(colonnesBleoPassage(null, false), {});
});
