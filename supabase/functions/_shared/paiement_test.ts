/**
 * Prompt 14, point 3 : le plan de paiement d'une ligne, avec des réponses
 * Upwork simulées. Semaine payée : lundi 2 nov. 2026 = Week 45 ; suivante 46.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  centimes,
  dollarsUpwork,
  type JalonUpwork,
  type LignePaieApi,
  lireJalonsContrat,
  lireReglagesPaieApi,
  planPaiement,
  refusMode,
  semaineDuNom,
} from "./paiement.ts";

const S = "2026-11-02";
const R = lireReglagesPaieApi({ paie_api: { mode: "on" } });

function ligne(o: Partial<LignePaieApi> = {}): LignePaieApi {
  return {
    id: "l1", poster_id: "p1", poster_nom: "Ana", action: "payer", faits: 14, tarif: 14,
    montant: 14, montant_calcule: 14, retenue: 0, raison_correction: null, exclu: false, paye_at: null,
    semaine_suivante_faite_at: null, suivante_action: "financer", suivante_comptes: 1, suivante_montant: 14,
    contrat_id: "c1", ...o,
  };
}

const j = (id: string, nom: string, etat: string, sequence: number, depot: number | null = 14, paye: number | null = null): JalonUpwork =>
  ({ id, nom, etat, sequence, depot, paye });

// À l'embauche, la HM crée 4 milestones, la 1re financée.
const embauche = [j("m1", "Week 45", "Active", 1, 15), j("m2", "Week 46", "NotFunded", 2), j("m3", "Week 47", "NotFunded", 3), j("m4", "Week 48", "NotFunded", 4)];

Deno.test("montants Upwork : displayValue en dollars, rawValue en centimes ; envoi en centimes", () => {
  assertEquals(dollarsUpwork({ rawValue: "1500", displayValue: "15.00" }), 15);
  assertEquals(dollarsUpwork({ rawValue: "1100" }), 11);
  assertEquals(dollarsUpwork(null), null);
  assertEquals(centimes(14.5), "1450");
  assertEquals(semaineDuNom("Week 46 (2 acc)"), 46);
  assertEquals(semaineDuNom("Trial week:"), null);
  const lus = lireJalonsContrat({ terms: { fixedPriceTerms: [{ milestones: [
    { id: "b", description: "Week 46", state: "NotFunded", sequenceId: 2, depositAmount: { displayValue: "14.00" } },
    { id: "a", description: " Week 45 ", state: "Active", sequenceId: 1, depositAmount: { displayValue: "15.00" } },
  ] }] } });
  assertEquals(lus.map((x) => [x.id, x.nom, x.depot]), [["a", "Week 45", 15], ["b", "Week 46", 14]]);
});

Deno.test("mode : off, test (contrats listés, pas avant le 2 nov.), on (pas avant le 9 nov.)", () => {
  assert(refusMode(lireReglagesPaieApi({}), "c1", "2026-11-09")?.includes("désactivé"));
  const test = lireReglagesPaieApi({ paie_api: { mode: "test", contrats_test: ["c1"] } });
  assert(refusMode(test, "c1", "2026-11-01")?.includes("pas avant"));
  assertEquals(refusMode(test, "c1", "2026-11-02"), null);
  assert(refusMode(test, "c2", "2026-11-02")?.includes("liste de test"));
  assert(refusMode(R, "c1", "2026-11-08")?.includes("pas avant le 2026-11-09"));
  assertEquals(refusMode(R, "c2", "2026-11-09"), null);
  assertEquals(lireReglagesPaieApi({}).plafond_ligne, 30);
  assertEquals(lireReglagesPaieApi({}).plafond_jour, 5000);
});

Deno.test("Payer, 1re semaine (tarif + 1 $) : approuver Week 45, financer la Week 46 existante (jamais de doublon)", () => {
  const p = planPaiement(ligne({ montant: 15, montant_calcule: 15 }), embauche, S, R);
  assertEquals(p.statut, "pret");
  assertEquals(p.approuver, { jalon_id: "m1", nom: "Week 45", montant: 15, depot: 15, sous_paiement: null });
  assertEquals(p.financer, { mode: "existant", jalon_id: "m2", nom: "Week 46", montant: 14, editer: false });
  assertEquals(p.total, 29);
});

Deno.test("Payer moins : montant réduit et raison ; Week 46 absente : à créer", () => {
  const jalons = [j("m1", "Week 45", "Active", 1, 14)];
  const p = planPaiement(ligne({ action: "payer_moins", montant: 12, montant_calcule: 12, retenue: 2 }), jalons, S, R);
  assertEquals(p.statut, "pret");
  assertEquals(p.approuver?.montant, 12);
  assertEquals(p.approuver?.sous_paiement, "Missed posts: 2 $ deducted");
  assertEquals(p.financer, { mode: "creer", jalon_id: null, nom: "Week 46", montant: 14, editer: false });
});

Deno.test("Double : la Week 46 existante est renommée « (2 acc) » et passe au tarif × 2", () => {
  const p = planPaiement(
    ligne({ action: "modifier", suivante_action: "financer_double", suivante_comptes: 2, suivante_montant: 28 }),
    [j("m1", "Week 45", "Active", 1), j("m2", "Week 46", "NotFunded", 2)],
    S,
    R,
  );
  assertEquals(p.financer, { mode: "existant", jalon_id: "m2", nom: "Week 46 (2 acc)", montant: 28, editer: true });
});

Deno.test("Kill : approuver la dernière semaine, ne rien financer, fermer à la main ; Annuler : rembourser à la main", () => {
  const k = planPaiement(ligne({ action: "kill", suivante_action: "ne_pas_financer" }), [j("m1", "Week 45", "Active", 1)], S, R);
  assertEquals([k.statut, k.lien, k.financer, k.total], ["pret", "fermer", null, 14]);
  const a = planPaiement(ligne({ action: "annuler", montant: 0 }), [], S, R);
  assertEquals([a.statut, a.lien], ["lien", "rembourser"]);
  assertEquals(planPaiement(ligne({ action: "rien", montant: 0, faits: 0 }), [], S, R).statut, "rien");
});

Deno.test("prompt 26 : milestone financée pour une autre semaine → Needs you (rien ne part) ; sans numéro, seule : payée", () => {
  const p = planPaiement(ligne(), [j("m0", "Week 44", "Active", 1), j("m1", "Week 46", "NotFunded", 2)], S, R);
  assertEquals(p.statut, "refuse");
  assert(p.raison?.includes("autre semaine"));
  const essai = planPaiement(ligne(), [j("m0", "Trial week", "Active", 1), j("m1", "Week 46", "NotFunded", 2)], S, R);
  assertEquals([essai.statut, essai.approuver?.jalon_id, essai.financer?.jalon_id], ["pret", "m0", "m1"]);
  const deuxSans = planPaiement(ligne(), [j("m0", "Trial week", "Active", 1), j("m1", "Posting", "Active", 2)], S, R);
  assertEquals(deuxSans.statut, "refuse");
});

Deno.test("garde-fous : montant inattendu, deux milestones possibles, plafond, contrat absent, tarif manquant", () => {
  const inattendu = planPaiement(ligne(), [j("m1", "Week 45", "Active", 1, 20)], S, R);
  assertEquals(inattendu.statut, "refuse");
  assert(inattendu.raison?.includes("attendu 14"));
  // Prompt 26 : Week 46 déjà financée au bon montant : Week 45 payée, rien de plus à financer ; à un autre montant : à vérifier.
  const suiteDeja = planPaiement(ligne(), [j("m1", "Week 45", "Active", 1), j("m2", "Week 46", "Active", 2)], S, R);
  assertEquals([suiteDeja.statut, suiteDeja.approuver?.jalon_id, suiteDeja.financer], ["pret", "m1", null]);
  assertEquals(planPaiement(ligne(), [j("m1", "Week 45", "Active", 1), j("m2", "Week 46", "Active", 2, 20)], S, R).statut, "refuse");
  const deux = planPaiement(ligne(), [j("m1", "Week 45", "Active", 1), j("m2", "Week 47", "Active", 2)], S, R);
  assertEquals(deux.statut, "refuse");
  // Semaine suivante déjà financée : deux financées, c'est normal ; on n'en finance pas une 3e.
  const dejaFin = planPaiement(ligne({ suivante_action: "deja_financee" }), [j("m1", "Week 45", "Active", 1), j("m2", "Week 46", "Active", 2)], S, R);
  assertEquals([dejaFin.statut, dejaFin.approuver?.jalon_id, dejaFin.financer], ["pret", "m1", null]);
  const plafond = planPaiement(ligne({ montant: 35, montant_calcule: 35 }), [j("m1", "Week 45", "Active", 1, 35)], S, R);
  assert(plafond.raison?.includes("plafond"));
  const plafondSuite = planPaiement(ligne({ suivante_action: "financer_double", suivante_montant: 40 }), [j("m1", "Week 45", "Active", 1)], S, R);
  assert(plafondSuite.raison?.includes("plafond"));
  assertEquals(planPaiement(ligne({ contrat_id: null }), embauche, S, R).statut, "refuse");
  assertEquals(planPaiement(ligne({ tarif: null }), embauche, S, R).statut, "refuse");
  assertEquals(planPaiement(ligne({ suivante_action: "a_voir" }), embauche, S, R).statut, "refuse");
  const doublon = planPaiement(ligne(), [j("m1", "Week 45", "Active", 1), j("m2", "Week 46", "NotFunded", 2), j("m3", "Week 46", "NotFunded", 3)], S, R);
  assert(doublon.raison?.includes("Week 46"));
});

Deno.test("déjà payée à la main : la ligne passe « déjà payée » avec le montant trouvé", () => {
  const p = planPaiement(ligne(), [j("m1", "Week 45", "Paid", 1, 14, 14), j("m2", "Week 46", "NotFunded", 2)], S, R);
  assertEquals([p.statut, p.montant_trouve], ["deja_payee", 14]);
  assertEquals(planPaiement(ligne(), [j("m1", "Week 44", "Paid", 1, 14, 14)], S, R).statut, "refuse");
  assertEquals(planPaiement(ligne({ paye_at: "2026-11-09T09:00:00Z" }), embauche, S, R).statut, "rien");
  assertEquals(planPaiement(ligne({ exclu: true }), embauche, S, R).statut, "rien");
});

Deno.test("prompt 21, B9 : 1re semaine du 2e compte, le reste part dans un complément (jamais plus que le calcul)", () => {
  // Week 45 financée pour un compte (14 $) ; les deux comptes ont posté : 28 $ dus.
  const p = planPaiement(
    ligne({ montant: 28, montant_calcule: 28, nb_comptes: 2, suivante_action: "financer_double", suivante_comptes: 2, suivante_montant: 28 }),
    [j("m1", "Week 45", "Active", 1, 14), j("m2", "Week 46", "NotFunded", 2)],
    S,
    R,
  );
  assertEquals(p.statut, "pret");
  assertEquals(p.approuver?.montant, 14);
  assertEquals(p.complement, { nom: "Week 45 (2nd acc)", montant: 14 });
  assertEquals(p.total, 56);
  // Un seul compte : pas de complément, la milestone inattendue est refusée.
  assertEquals(planPaiement(ligne({ montant: 28, montant_calcule: 28 }), [j("m1", "Week 45", "Active", 1, 14)], S, R).statut, "refuse");
  // Un écart plus grand qu'un tarif + 1 $ : refusé.
  const trop = planPaiement(ligne({ montant: 30, montant_calcule: 30, nb_comptes: 2 }), [j("m1", "Week 45", "Active", 1, 10)], S, R);
  assertEquals(trop.statut, "refuse");
});

Deno.test("prompt 21, S et B7 : tarif à vérifier refusé, Legacy laissé, PaidBySystem compte comme payée", () => {
  assertEquals(planPaiement(ligne({ action: "a_verifier" }), embauche, S, R).statut, "refuse");
  assertEquals(planPaiement(ligne({ action: "legacy" }), embauche, S, R).statut, "rien");
  const p = planPaiement(ligne(), [j("m1", "Week 45", "PaidBySystem", 1, 14, 14)], S, R);
  assertEquals(p.statut, "deja_payee");
});

Deno.test("prompt 26 : 0 post et gardé : la milestone financée est renommée pour la semaine suivante, rien de payé", () => {
  const z = ligne({ action: "rien", faits: 0, montant: 0, montant_calcule: 0, suivante_action: "renommer", suivante_montant: null });
  const p = planPaiement(z, [j("m1", "Week 45 (2 acc)", "Active", 1, 28)], S, R);
  assertEquals([p.statut, p.renommer], ["renommer", { jalon_id: "m1", de: "Week 45 (2 acc)", vers: "Week 46 (2 acc)" }]);
  assertEquals([p.approuver, p.financer, p.total], [null, null, 0]);
  assertEquals(planPaiement(z, [j("m2", "Week 46", "Active", 1)], S, R).statut, "rien");
  assertEquals(planPaiement(z, [], S, R).statut, "rien");
  assertEquals(planPaiement(z, [j("m0", "Trial week", "Active", 1)], S, R).statut, "refuse");
  // Kill & don't pay : rien n'est approuvé.
  assertEquals(planPaiement(ligne({ action: "kill_sans_paie" }), embauche, S, R).statut, "rien");
});
