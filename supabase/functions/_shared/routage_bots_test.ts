import { assertEquals } from "jsr:@std/assert@1";

import { botResponsable, doitRemonter } from "./routage_bots.ts";

Deno.test("routage : chaque famille de catégories a son bot", () => {
  assertEquals(botResponsable({ categorie: "connexion" }), "new_cohort_bot");
  assertEquals(botResponsable({ categorie: "compte" }), "new_cohort_bot");
  assertEquals(botResponsable({ categorie: "compte", ruul: true }), "ruul_bot");
  assertEquals(botResponsable({ categorie: "posting" }), "control_bot");
  assertEquals(botResponsable({ categorie: "warmup" }), "control_bot");
  assertEquals(botResponsable({ categorie: "arret" }), "control_bot");
  assertEquals(botResponsable({ categorie: "paiement" }), "pay_bot");
  assertEquals(botResponsable({ categorie: "parrainage" }), "pay_bot");
  assertEquals(botResponsable({ categorie: "ruul" }), "ruul_bot");
  assertEquals(botResponsable({ categorie: "bug" }), "os_tickets");
});

Deno.test("routage : fraude, litige, argent d'un tiers → Max ; « autre » selon l'avancée", () => {
  assertEquals(botResponsable({ categorie: "paiement", risques: ["argent_tiers"] }), "max");
  assertEquals(botResponsable({ categorie: "posting", niveau: "max" }), "max");
  assertEquals(botResponsable({ categorie: "litige" }), "max");
  assertEquals(botResponsable({ categorie: "autre", aPoste: false }), "new_cohort_bot");
  assertEquals(botResponsable({ categorie: "autre", aPoste: true }), "control_bot");
  assertEquals(botResponsable({ categorie: null }), "new_cohort_bot");
});

Deno.test("remontée : après 2 passages sans action", () => {
  assertEquals(doitRemonter({ passages: 1, regle_at: null, remonte_at: null }), false);
  assertEquals(doitRemonter({ passages: 2, regle_at: null, remonte_at: null }), true);
  assertEquals(doitRemonter({ passages: 5, regle_at: "2026-11-13", remonte_at: null }), false);
  assertEquals(doitRemonter({ passages: 5, regle_at: null, remonte_at: "2026-11-13" }), false);
});
