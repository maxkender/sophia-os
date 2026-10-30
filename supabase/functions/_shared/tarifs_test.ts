import { assertEquals } from "jsr:@std/assert@1";

import type { JalonUpwork } from "./paiement.ts";
import { comptesDuNom, deduireTarif } from "./tarifs.ts";

let seq = 0;
const j = (nom: string, depot: number | null, etat = "Paid", echeance: string | null = null): JalonUpwork => ({
  id: `m${++seq}`, nom, etat, sequence: seq, depot, paye: null, echeance,
});

Deno.test("le nombre de comptes du nom", () => {
  assertEquals(comptesDuNom("Week 44 (2 acc)"), 2);
  assertEquals(comptesDuNom("Week 44 (4 acc)"), 4);
  assertEquals(comptesDuNom("Week 44"), 1);
});

Deno.test("un contrat à 15 $ par semaine : 15 $", () => {
  const t = deduireTarif([j("Week 43", 15), j("Week 44", 15, "Active"), j("Week 45", 15, "NotFunded")]);
  assertEquals([t.rythme, t.tarif_compte, t.montant], ["hebdo", 15, 15]);
});

Deno.test("la 1re semaine à +1 $ est ignorée", () => {
  const t = deduireTarif([j("Week 43 (First week)", 11), j("Week 44", 10, "Active"), j("Week 45", 10, "NotFunded")]);
  assertEquals(t.tarif_compte, 10);
  // La 1re semaine en cours (financée) à +1 $, les suivantes au tarif : le tarif des suivantes.
  const enCours = deduireTarif([j("week 43 - TikTok Slideshow Posting", 11, "Active"), j("week 44", 10, "NotFunded"), j("week 45", 10, "NotFunded")]);
  assertEquals([enCours.tarif_compte, enCours.montant], [10, 10]);
  const recrue = deduireTarif([j("Trial week ", 8, "Active", "2026-11-01T00:00:00Z")]);
  assertEquals([recrue.rythme, recrue.tarif_compte], ["hebdo", 7]);
});

Deno.test("Double : montant / 2 par compte ; ancien mensuel puis hebdo : l'hebdo gagne", () => {
  const t = deduireTarif([
    j("Trial week", 15), j("Month 1", 45), j("Month 2", 60, "Paid", "2026-10-02T00:00:00Z"),
    j("Week 43 (2 acc + warmup)", 29, "Paid", "2026-10-25T00:00:00Z"), j("Week 44 (2 acc)", 28, "Active", "2026-11-01T00:00:00Z"),
  ]);
  assertEquals([t.rythme, t.comptes, t.tarif_compte, t.montant], ["hebdo", 2, 14, 28]);
});

Deno.test("un contrat à 60 $ par mois : Legacy, 60 $ tous les 30 jours", () => {
  const t = deduireTarif([j("Trial Week", 15, "Paid", "2026-09-28T00:00:00Z"), j("Monthly Contract", 60, "Active", "2026-10-30T00:00:00Z")]);
  assertEquals([t.rythme, t.montant, t.periode_jours], ["legacy", 60, 30]);
  assertEquals(t.courant?.echeance, "2026-10-30T00:00:00Z");
});

Deno.test("impossible à déduire : à vérifier", () => {
  assertEquals(deduireTarif([]).rythme, "a_verifier");
  // Rien en cours, pas de semaine.
  assertEquals(deduireTarif([j("set up", 10), j("mois 1", 30)]).rythme, "a_verifier");
  // « Week 44 » à 29 $ pour un seul compte : hors bornes.
  assertEquals(deduireTarif([j("Week 43", 14), j("Week 44", 29, "Active")]).rythme, "a_verifier");
  assertEquals(deduireTarif([j("Week 44", null, "Active")]).rythme, "a_verifier");
});

Deno.test("2 comptes actifs, la milestone couvre les deux : divisée par 2 (28 $ = 2 × 14 $, 30 $ = 2 × 15 $, 29 $ = 14 + 15)", () => {
  assertEquals(comptesDuNom("Week 44- 2 accounts"), 2);
  const a = deduireTarif([j("Week 43", 28), j("Week 44", 28, "Active"), j("Week 45", 28, "NotFunded")], 2);
  assertEquals([a.rythme, a.comptes, a.tarif_compte, a.montant], ["hebdo", 2, 14, 28]);
  const b = deduireTarif([j("7-days 10 (2 acc)", 30), j("Week 44", 30, "Active"), j("Week 45", 30, "NotFunded")], 2);
  assertEquals([b.rythme, b.tarif_compte], ["hebdo", 15]);
  // Week 43 pour un compte (14 $), Week 44 pour deux avec l'ancien bonus (29 $) : 14,5 $ par compte, à 1 $ près.
  const c = deduireTarif([j("Week 43", 14), j("Week 44", 29, "Active")], 2);
  assertEquals([c.rythme, c.tarif_compte], ["hebdo", 14.5]);
  // « Week 44- 2 accounts » : le nombre est dans le nom.
  const d = deduireTarif([j("Week 43- 2 accounts", 28), j("Week 44- 2 accounts", 28, "Active")]);
  assertEquals([d.rythme, d.tarif_compte], ["hebdo", 14]);
  // Un seul compte actif : 28 $ reste hors bornes.
  assertEquals(deduireTarif([j("Week 43", 28), j("Week 44", 28, "Active")], 1).rythme, "a_verifier");
});

Deno.test("2 comptes actifs mais les autres semaines valent 7 $ par compte : à vérifier (cas gardé)", () => {
  const t = deduireTarif([j("warm up + trial week", 15), j("30-days 01", 60), j("Week 43 (2 acc)", 14), j("week 44", 28, "Active")], 2);
  assertEquals(t.rythme, "a_verifier");
  assertEquals(t.raison.includes("14 $ par compte"), true);
});
