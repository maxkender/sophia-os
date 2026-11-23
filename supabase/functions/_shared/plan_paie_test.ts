import { assertEquals } from "jsr:@std/assert@1";

import { ciblePlan, jalonPaye, ORDRE_GROUPES } from "./plan_paie.ts";
import type { JalonUpwork } from "./paiement.ts";

const j = (id: string, nom: string, etat: string, depot: number | null = 14, paye: number | null = null) =>
  ({ id, nom, etat, depot, paye, sequence: 1 }) as unknown as JalonUpwork;

Deno.test("plan : par numéro de jalon, jamais par son nom", () => {
  const js = [j("1", "Week 47", "Active"), j("2", "Week 46", "Active")];
  const r = ciblePlan({ groupe: "liberer", jalon_id: "2" }, js);
  assertEquals(r.ok && r.jalon.id, "2");
  assertEquals(ciblePlan({ groupe: "liberer", jalon_id: "9" }, js).ok, false);
});

Deno.test("plan : jamais un jalon payé ni non financé ; bloqué : rien", () => {
  const paye = ciblePlan({ groupe: "liberer", jalon_id: "1" }, [j("1", "Week 47", "Paid", 14, 14)]);
  assertEquals(!paye.ok && paye.etat, "deja_paye");
  const nf = ciblePlan({ groupe: "liberer_fermer", jalon_id: "1" }, [j("1", "Week 46", "NotFunded")]);
  assertEquals(!nf.ok && nf.etat, "pas_finance");
  const b = ciblePlan({ groupe: "bloque", jalon_id: "1" }, [j("1", "Week 47", "Active", 28)]);
  assertEquals(!b.ok && b.etat, "bloque");
});

Deno.test("plan Grok : le seul jalon financé ; aucun ou deux : rien ne part", () => {
  const un = ciblePlan({ groupe: "grok", jalon_id: null }, [j("1", "Week 46", "Paid", 14, 14), j("2", "Week 47", "Active", 10)]);
  assertEquals(un.ok && un.jalon.id, "2");
  const aucun = ciblePlan({ groupe: "grok", jalon_id: null }, [j("1", "Week 46", "Paid", 14, 14)]);
  assertEquals(!aucun.ok && aucun.etat, "pas_finance");
  const deux = ciblePlan({ groupe: "grok", jalon_id: null }, [j("1", "Week 47", "Active"), j("2", "Week 48", "Active")]);
  assertEquals(!deux.ok && deux.etat, "a_voir");
});

Deno.test("plan : relecture et ordre (libérer avant fermer/killer)", () => {
  assertEquals(jalonPaye([j("1", "W", "Paid", 14, 14)], "1"), true);
  assertEquals(jalonPaye([j("1", "W", "Active")], "1"), false);
  assertEquals(ORDRE_GROUPES.indexOf("grok") < ORDRE_GROUPES.indexOf("kill"), true);
});
