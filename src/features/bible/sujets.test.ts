import { describe, expect, it } from "vitest";

import { engageUsd, erreurSujet, lireLangues, rangerSujets, type SujetRecherche } from "./sujets";

const sujet = (o: Partial<SujetRecherche>): SujetRecherche => ({
  id: "s1", sujet: "l'art : tableaux, sculptures", consigne: null, langues: [], labelNom: null, budgetUsd: 12, cartesMax: 15, jour: "2026-11-24",
  statut: "en_attente", agent: null, prisLe: null, faitLe: null, compteRendu: null, creeLe: "2026-11-24T08:00:00Z", depenseUsd: 0, cartes: 0, ...o,
});

describe("les sujets de recherche des éclaireurs", () => {
  it("lit les langues tapées à la main", () => {
    expect(lireLangues("DE, it  tr;de")).toEqual(["de", "it", "tr"]);
    expect(lireLangues("  ")).toEqual([]);
  });

  it("refuse un sujet vide, trop long, ou hors budget", () => {
    const bon = { sujet: "l'histoire en polonais", consigne: "", langues: "pl", budgetUsd: null, cartesMax: null };
    expect(erreurSujet(bon)).toBeNull();
    expect(erreurSujet({ ...bon, sujet: " a " })).toMatch(/quelques mots/);
    expect(erreurSujet({ ...bon, sujet: "x".repeat(201) })).toMatch(/200 caractères/);
    expect(erreurSujet({ ...bon, budgetUsd: 0 })).toMatch(/1 à 50/);
    expect(erreurSujet({ ...bon, budgetUsd: 51 })).toMatch(/1 à 50/);
    expect(erreurSujet({ ...bon, cartesMax: 2.5 })).toMatch(/1 à 60/);
    expect(erreurSujet({ ...bon, budgetUsd: 20, cartesMax: 40 })).toBeNull();
  });

  it("range les sujets : en cours, puis en attente par ancienneté, puis les derniers rendus, sans les annulés", () => {
    const tous = [
      sujet({ id: "attente-2", creeLe: "2026-11-24T10:00:00Z" }),
      sujet({ id: "fait-vieux", statut: "fait", faitLe: "2026-11-22T09:00:00Z" }),
      sujet({ id: "annule", statut: "annule" }),
      sujet({ id: "en-cours", statut: "pris", agent: "eclaireur-2", creeLe: "2026-11-24T11:00:00Z" }),
      sujet({ id: "attente-1", creeLe: "2026-11-24T09:00:00Z" }),
      sujet({ id: "fait-recent", statut: "fait", faitLe: "2026-11-24T09:30:00Z" }),
    ];
    const { ouverts, rendus } = rangerSujets(tous, 1);
    expect(ouverts.map((s) => s.id)).toEqual(["en-cours", "attente-1", "attente-2"]);
    expect(rendus.map((s) => s.id)).toEqual(["fait-recent"]);
  });

  it("compte ce que les sujets ouverts peuvent encore coûter", () => {
    expect(engageUsd([sujet({ budgetUsd: 12, depenseUsd: 4.5 }), sujet({ budgetUsd: 10, depenseUsd: 11 }), sujet({ budgetUsd: 3 })])).toBe(10.5);
  });
});
