import { describe, expect, it } from "vitest";

import type { LignePaie } from "./api";
import { milestone, parHm, semaineAPayer, totaux, trier } from "./logique";

function ligne(partiel: Partial<LignePaie> & { hm?: string | null; nom?: string }): LignePaie {
  const { hm = "hm1", nom = "Ana", ...reste } = partiel;
  return {
    id: Math.random().toString(36),
    poster_id: "p",
    semaine: "2026-10-26",
    nb_comptes: 1,
    comptes_payes: 1,
    prevus: 14,
    faits: 14,
    manques: 0,
    tarif: 10,
    retenue: 0,
    montant: 10,
    statut: "ok",
    raison: null,
    paye_at: null,
    paye_par: null,
    poster: { prenom: nom, nom: null, email: null, upwork_contrat_url: null, manager_id: hm },
    ...reste,
  };
}

describe("paie : semaine et milestone", () => {
  it("le lundi 2 nov. on paie la semaine du 26 oct. (Week 44)", () => {
    expect(semaineAPayer("2026-11-02")).toBe("2026-10-26");
    expect(semaineAPayer("2026-11-04")).toBe("2026-10-26");
    expect(milestone("2026-10-26", 1)).toBe("Week 44");
    expect(milestone("2026-10-26", 2)).toBe("Week 44 (2 acc)");
  });
});

describe("paie : totaux", () => {
  it("total, reste à payer, lignes à payer et payées", () => {
    const t = totaux([
      ligne({ montant: 14 }),
      ligne({ montant: 17, paye_at: "2026-11-02T08:00:00Z" }),
      ligne({ montant: 0, statut: "a_voir" }),
    ]);
    expect(t).toEqual({ total: 31, resteAPayer: 14, aPayer: 1, payees: 1 });
  });

  it("par HM : le plus à payer d'abord, sans HM en dernier", () => {
    const g = parHm([
      ligne({ hm: null, montant: 50 }),
      ligne({ hm: "a", montant: 7 }),
      ligne({ hm: "b", montant: 10 }),
      ligne({ hm: "b", montant: 10 }),
    ]);
    expect(g.map((x) => [x.hmId, x.totaux.total])).toEqual([
      ["b", 20],
      ["a", 7],
      [null, 50],
    ]);
  });

  it("tri : à voir, puis à payer, puis payées", () => {
    const l = trier([
      ligne({ nom: "Payée", paye_at: "x" }),
      ligne({ nom: "Zoé" }),
      ligne({ nom: "Bob", statut: "a_voir" }),
      ligne({ nom: "Ana" }),
    ]);
    expect(l.map((x) => x.poster?.prenom)).toEqual(["Bob", "Ana", "Zoé", "Payée"]);
  });
});
