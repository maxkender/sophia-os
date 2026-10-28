/** Système du 2 nov., partie C : le plan d'un arrêt complet, sans réseau. */
import { assertEquals } from "jsr:@std/assert@1";

import { decrireJalons, etape, planUpwork, statutArret } from "./arret.ts";
import { lireJalonsContrat } from "./paiement.ts";

// Comme Upwork le rend : fixedPriceTerms est une LISTE.
const contrat = (jalons: { id: string; description: string; state: string; v: string }[]) => ({
  terms: { fixedPriceTerms: [{ milestones: jalons.map((j, i) => ({ ...j, sequenceId: i + 1, depositAmount: { displayValue: j.v } })) }] },
});

Deno.test("jamais posté : non financées supprimées, financée à rembourser, pas de fermeture par l'API", () => {
  const j = lireJalonsContrat(contrat([
    { id: "m1", description: "Week 45", state: "Active", v: "30.00" },
    { id: "m2", description: "Week 46", state: "NotFunded", v: "30.00" },
    { id: "m3", description: "Week 44", state: "Paid", v: "30.00" },
  ]));
  const p = planUpwork(j);
  assertEquals(p.supprimer.map((x) => x.id), ["m2"]);
  assertEquals(p.rembourser.map((x) => x.id), ["m1"]);
  assertEquals(p.fermer, false);
  assertEquals(decrireJalons(p.rembourser), "Week 45 ($30)");
});

Deno.test("rien de financé : le contrat peut être fermé ; aucune milestone lue : jamais", () => {
  const p = planUpwork(lireJalonsContrat(contrat([{ id: "m2", description: "Week 46", state: "NotFunded", v: "30.00" }])));
  assertEquals(p.fermer, true);
  assertEquals(planUpwork([]).fermer, false);
  assertEquals(planUpwork(lireJalonsContrat({ terms: { fixedPriceTerms: { milestones: [] } } })).fermer, false);
});

Deno.test("un échec met l'arrêt en erreur ; le reste est fait", () => {
  assertEquals(statutArret([etape("os", "fait"), etape("jalons", "erreur", "HTTP 403"), etape("slack", "a_faire")]), "erreur");
  assertEquals(statutArret([etape("os", "fait"), etape("message", "simule"), etape("slack", "sans_objet")]), "fait");
});
