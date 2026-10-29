/**
 * Prompt 21, parties B et P : la paie automatique, sans réseau ni base.
 * Semaine payée : lundi 2 nov. 2026 = Week 45 ; suivante 46.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import type { JalonUpwork, LignePaieApi, PlanPaiement } from "./paiement.ts";
import {
  choisirCanari,
  classerErreur,
  ecartsCanari,
  ecartsReconciliation,
  fusionnerParContrat,
  montantConforme,
  peutPayer,
  reessaisFinis,
  remplirTexte,
  semaineAPayer,
} from "./paie_auto.ts";
import { ETATS_CONNUS, planUpwork } from "./arret.ts";
import { attenteRetryAfter, avecRetry } from "./upwork.ts";

const S = "2026-11-02";

function ligne(o: Partial<LignePaieApi & { nb_comptes: number; moins6: number }> = {}) {
  return {
    id: "l1", poster_id: "p1", poster_nom: "Ana", action: "payer", faits: 14, tarif: 14,
    montant: 14, montant_calcule: 14, retenue: 0, raison_correction: null, exclu: false, paye_at: null,
    semaine_suivante_faite_at: null, suivante_action: "financer", suivante_comptes: 1, suivante_montant: 14,
    contrat_id: "c1", nb_comptes: 1, moins6: 0, ...o,
  };
}

const j = (id: string, nom: string, etat: string, sequence: number, depot: number | null = 14, paye: number | null = null): JalonUpwork =>
  ({ id, nom, etat, sequence, depot, paye });

Deno.test("B8 : deux profils sur un même contrat → une ligne, montants additionnés, Week 46 en (2 acc)", () => {
  const [f, ...reste] = fusionnerParContrat([
    ligne({ id: "b", poster_id: "p2", poster_nom: "Ana 2" }),
    ligne({ id: "a" }),
    ligne({ id: "z", poster_id: "p9", contrat_id: "c9" }),
  ]);
  assertEquals(f.ids, ["a", "b"]);
  assertEquals([f.montant, f.montant_calcule, f.nb_comptes], [28, 28, 2]);
  assertEquals([f.suivante_action, f.suivante_montant, f.suivante_comptes], ["financer_double", 28, 2]);
  assertEquals(f.refus, null);
  assertEquals(reste.map((l) => l.ids), [["z"]]);
  // Un profil Kill, l'autre continue : la ligne paie, la suite au tarif simple.
  const [k] = fusionnerParContrat([
    ligne({ id: "a" }),
    ligne({ id: "b", poster_id: "p2", action: "kill", suivante_action: "ne_pas_financer", suivante_montant: null }),
  ]);
  assertEquals([k.action, k.suivante_action, k.suivante_montant], ["payer", "financer", 14]);
  // Un seul des deux coché « Payé » : refusé.
  const [m] = fusionnerParContrat([ligne({ id: "a", paye_at: "2026-11-09T09:00:00Z" }), ligne({ id: "b", poster_id: "p2" })]);
  assert(m.refus?.includes("Payé"));
});

Deno.test("B4 : le canari est une ligne simple (1 compte, tarif plein, suite au même tarif)", () => {
  const lignes = fusionnerParContrat([
    ligne({ id: "1", poster_nom: "Bob", montant: 15, montant_calcule: 15 }), // 1re semaine (+1 $)
    ligne({ id: "2", poster_nom: "Zoe", contrat_id: "c2" }),
    ligne({ id: "3", poster_nom: "Ana", contrat_id: "c3", suivante_action: "financer_double", suivante_montant: 28 }),
    ligne({ id: "4", poster_nom: "Cid", contrat_id: "c4" }),
  ]);
  assertEquals(choisirCanari(lignes)?.ids, ["4"]);
  assertEquals(choisirCanari([]), null);
});

Deno.test("B4 : relecture du canari (payée au bon montant, suivante créée, financée, au bon montant)", () => {
  const plan: PlanPaiement = {
    statut: "pret", raison: null, lien: null, total: 28, montant_trouve: null,
    approuver: { jalon_id: "m1", nom: "Week 45", montant: 14, depot: 14, sous_paiement: null },
    financer: { mode: "creer", jalon_id: null, nom: "Week 46", montant: 14, editer: false },
  };
  assertEquals(ecartsCanari(plan, "m2", [j("m1", "Week 45", "Paid", 1, 14, 14), j("m2", "Week 46", "Active", 2, 14)]), []);
  const mauvais = ecartsCanari(plan, "m2", [j("m1", "Week 45", "Active", 1, 14, null), j("m2", "Week 46", "NotFunded", 2, 1400)]);
  assertEquals(mauvais.length, 4);
  assert(mauvais.some((e) => e.includes("1400")));
  assert(ecartsCanari(plan, null, [j("m1", "Week 45", "PaidBySystem", 1, 14, 14)]).some((e) => e.includes("introuvable")));
});

Deno.test("P1, B10 : nature des erreurs Upwork", () => {
  assertEquals(classerErreur("Milestone must be submitted before approval"), "soumission");
  assertEquals(classerErreur("Payment method declined"), "carte");
  assertEquals(classerErreur("Contract is paused"), "pause_contrat");
  assertEquals(classerErreur("HTTP 503"), "technique");
  assertEquals(classerErreur("réseau"), "technique");
  assertEquals(classerErreur("Validation failed: amount"), "autre");
});

Deno.test("B3 : lundi à partir de 9 h (ou Pay now), mardi toute la journée, jamais un autre jour", () => {
  // 2 nov. 2026 : Paris = UTC+1.
  assertEquals(peutPayer(new Date("2026-11-02T07:59:00Z"), 9, null).ok, false);
  assertEquals(peutPayer(new Date("2026-11-02T07:59:00Z"), 9, "2026-11-02T06:00:00Z").ok, true);
  assertEquals(peutPayer(new Date("2026-11-02T08:00:00Z"), 9, null).ok, true);
  assertEquals(peutPayer(new Date("2026-11-03T15:00:00Z"), 9, null).ok, true);
  assertEquals(peutPayer(new Date("2026-11-04T08:00:00Z"), 9, "x").ok, false);
  assertEquals(semaineAPayer(new Date("2026-11-02T08:00:00Z")), "2026-10-26");
  assertEquals(semaineAPayer(new Date("2026-11-03T22:00:00Z")), "2026-10-26");
});

Deno.test("P1, B10 : les réessais s'arrêtent le mardi à 20 h (Paris)", () => {
  assertEquals(reessaisFinis(new Date("2026-11-03T18:59:00Z"), "2026-10-26"), false);
  assertEquals(reessaisFinis(new Date("2026-11-03T19:00:00Z"), "2026-10-26"), true);
  assertEquals(reessaisFinis(new Date("2026-11-04T08:00:00Z"), "2026-10-26"), true);
});

Deno.test("textes et garde-fou montant (au cent près)", () => {
  assertEquals(remplirTexte("Hi {prenom}, week {NN} {x}", { prenom: "Ana", NN: 45 }), "Hi Ana, week 45 {x}");
  assertEquals(remplirTexte("You've been paid ${montant}.", { montant: "14" }), "You've been paid $14.");
  assert(montantConforme(j("m", "Week 46", "NotFunded", 1, 14), 14));
  assert(!montantConforme(j("m", "Week 46", "NotFunded", 1, 1400), 14));
  assert(!montantConforme(j("m", "Week 46", "NotFunded", 1, 14.01), 14));
  assert(!montantConforme(undefined, 14));
});

Deno.test("P2 : réconciliation d'une ligne payée", () => {
  const l = fusionnerParContrat([ligne()])[0];
  assertEquals(ecartsReconciliation(l, { jalon_approuve: "m1" }, [j("m1", "Week 45", "Paid", 1), j("m2", "Week 46", "Active", 2)], S), []);
  const e = ecartsReconciliation(l, { jalon_approuve: "m1" }, [j("m1", "Week 45", "Active", 1), j("m2", "Week 46", "NotFunded", 2)], S);
  assertEquals(e.length, 2);
  const mauvais = ecartsReconciliation(l, null, [j("m2", "Week 46", "Active", 2, 10)], S);
  assert(mauvais[0].includes("attendu 14"));
});

Deno.test("B7 : un état de milestone inconnu bloque la fermeture du contrat", () => {
  assertEquals(planUpwork([j("m1", "Week 45", "Paid", 1), j("m2", "Week 46", "NotFunded", 2)]).fermer, true);
  assertEquals(planUpwork([j("m1", "Week 45", "PaidBySystem", 1)]).fermer, true);
  assertEquals(planUpwork([j("m1", "Week 45", "Paid", 1), j("m2", "Week 46", "Disputed", 2)]).fermer, false);
  assert(ETATS_CONNUS.includes("PaidByUpwork"));
});

Deno.test("B11 : Retry-After respecté sur un 429 (borné à 60 s)", async () => {
  assertEquals(attenteRetryAfter("3"), 3000);
  assertEquals(attenteRetryAfter("600"), 60_000);
  assertEquals(attenteRetryAfter(null), null);
  assertEquals(attenteRetryAfter("Wed, 21 Oct 2015 07:28:10 GMT", Date.parse("Wed, 21 Oct 2015 07:28:00 GMT")), 10_000);
  const attentes: number[] = [];
  let n = 0;
  const r = await avecRetry(() => Promise.resolve({ statut: ++n < 2 ? 429 : 200, valeur: n, retryAfter: "7" }), {
    dormir: (ms) => { attentes.push(ms); return Promise.resolve(); },
  });
  assertEquals([r.statut, attentes], [200, [7000]]);
});
