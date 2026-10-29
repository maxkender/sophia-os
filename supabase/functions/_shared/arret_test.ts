/** Système du 2 nov., partie C : le plan d'un arrêt complet, sans réseau. */
import { assertEquals } from "jsr:@std/assert@1";

import { decrireJalons, etape, etatSemaineKill, modeKillMessage, planFinContrat, planUpwork, statutArret } from "./arret.ts";
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

Deno.test("prompt 21 F : la semaine du Kill payée (API ou à la main) ou à 0 $ → fin ; sinon on attend", () => {
  assertEquals(etatSemaineKill({ montant: 14, paye_at: "2026-11-09T08:00:00Z", posts: 9 }), "payee");
  assertEquals(etatSemaineKill({ montant: 0, paye_at: null, posts: 0 }), "zero");
  assertEquals(etatSemaineKill({ montant: null, paye_at: null, posts: 0 }), "zero");
  assertEquals(etatSemaineKill({ montant: 14, paye_at: null, posts: 9 }), "attendre");
  assertEquals(etatSemaineKill({ montant: null, paye_at: null, posts: 3 }), "attendre");
});

Deno.test("prompt 21 F : jamais de fin avec une milestone financée, sauf à 0 $ (remboursement demandé)", () => {
  const finance = planUpwork(lireJalonsContrat(contrat([
    { id: "m1", description: "Week 45", state: "Paid", v: "14.00" },
    { id: "m2", description: "Week 46", state: "Active", v: "14.00" },
  ])));
  assertEquals(planFinContrat(finance, "payee").fermer, false);
  assertEquals(planFinContrat(finance, "zero").fermer, true);
  const propre = planUpwork(lireJalonsContrat(contrat([
    { id: "m1", description: "Week 45", state: "Paid", v: "14.00" },
    { id: "m2", description: "Week 46", state: "NotFunded", v: "14.00" },
  ])));
  assertEquals(planFinContrat(propre, "payee"), { fermer: true, raison: null });
  assertEquals(planFinContrat(planUpwork([]), "zero").fermer, false);
});

Deno.test("prompt 21 A6 : kill_message_auto off / test / on, l'ancien oui / non", () => {
  assertEquals(modeKillMessage("on"), "on");
  assertEquals(modeKillMessage(true), "on");
  assertEquals(modeKillMessage("test"), "test");
  assertEquals(modeKillMessage(false), "off");
  assertEquals(modeKillMessage(undefined), "off");
});
