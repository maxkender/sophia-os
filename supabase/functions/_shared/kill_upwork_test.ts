import { assertEquals } from "jsr:@std/assert@1";

import type { JalonUpwork } from "./paiement.ts";
import { financeNonPaye, type EntreeKill, planKill, texteKill } from "./kill_upwork.ts";

const j = (nom: string, etat: string, depot: number, paye = 0, sequence = 1): JalonUpwork => ({ id: nom, nom, etat, sequence, depot, paye });
const base: EntreeKill = {
  contrat_id: "44716522", vik: true, compte_max: true, partage: false, statut: "ACTIVE", ferme: false,
  jalons: [j("Week 43", "Paid", 11, 6, 1), j("Week 44", "Active", 10, 0, 2), j("Week 45", "NotFunded", 10, 0, 3)],
  semaine_passee: { semaine: "26/10", montant: 0, payee: true },
};

Deno.test("fermer : financé et non payé = ce qui revient", () => {
  const p = planKill(base);
  assertEquals(p.decision, "fermer");
  assertEquals(p.montant, 10);
  assertEquals(p.en_cours, { nom: "Week 44", depot: 10, etat: "Active" });
  assertEquals(financeNonPaye([j("A", "Submitted", 15, 5), j("B", "Paid", 10, 10)]), 10);
});

Deno.test("jamais : hors VIk, autre compte, contrat partagé, illisible → à la main", () => {
  assertEquals(planKill({ ...base, vik: false }).decision, "a_la_main");
  assertEquals(planKill({ ...base, compte_max: false }).decision, "a_la_main");
  assertEquals(planKill({ ...base, partage: true }).decision, "a_la_main");
  assertEquals(planKill({ ...base, jalons: null }).decision, "a_la_main");
  assertEquals(planKill({ ...base, contrat_id: null }).raison, "contrat Upwork non relié");
});

Deno.test("semaine passée pas encore payée : le kill attend la paie du lundi", () => {
  const p = planKill({ ...base, semaine_passee: { semaine: "26/10", montant: 8, payee: false } });
  assertEquals(p.decision, "attendre");
  // 0 $ ou payée : on ferme.
  assertEquals(planKill({ ...base, semaine_passee: { semaine: "26/10", montant: 0, payee: false } }).decision, "fermer");
  assertEquals(planKill({ ...base, semaine_passee: null }).decision, "fermer");
  assertEquals(planKill({ ...base, ferme: true, statut: "CLOSED" }).decision, "deja_ferme");
});

Deno.test("le texte écrit dans la carte", () => {
  const p = planKill(base);
  assertEquals(texteKill({ desactive: true, contrat: "44780705", plan: { ...p, montant: 15 }, ferme: true, rendu: 15, erreur: null, case_cochee: true }),
    "Compte désactivé · Contrat 44780705 fermé · 15 $ en retour");
  assertEquals(texteKill({ desactive: true, contrat: "44780705", plan: p, ferme: false, rendu: null, erreur: "HTTP 500", case_cochee: true }),
    "Compte désactivé · Contrat à fermer à la main (erreur : HTTP 500)");
  assertEquals(texteKill({ desactive: true, contrat: "1", plan: p, ferme: false, rendu: null, erreur: null, case_cochee: false }),
    "Compte désactivé · Contrat 1 laissé ouvert (case décochée)");
});
