import { describe, expect, it } from "vitest";

import type { BonusAVenir, LigneBonus } from "./api";
import { grouperAVenir, lundisBonus, prochainLundiBonus, recrueProbable, totauxBonus } from "./logique";

const PREMIER = "2026-11-30";

describe("les lundis bonus (toutes les 4 semaines depuis le premier)", () => {
  it("le prochain lundi bonus", () => {
    expect(prochainLundiBonus("2026-10-27", PREMIER)).toBe("2026-11-30");
    expect(prochainLundiBonus("2026-11-30", PREMIER)).toBe("2026-11-30");
    expect(prochainLundiBonus("2026-12-01", PREMIER)).toBe("2026-12-28");
  });

  it("au choix : avant le premier, seulement lui ; ensuite le dernier passé, le prochain, puis les précédents", () => {
    expect(lundisBonus("2026-10-27", PREMIER)).toEqual(["2026-11-30"]);
    expect(lundisBonus("2026-11-30", PREMIER)).toEqual(["2026-11-30"]);
    expect(lundisBonus("2027-01-05", PREMIER)).toEqual(["2026-12-28", "2027-01-25", "2026-11-30"]);
  });
});

function ligne(o: Partial<LigneBonus>): LigneBonus {
  return {
    id: "b",
    poster_id: "p",
    hm_id: "hm",
    type: "parrainage",
    referral_id: "r",
    recrue_id: "x",
    lundi_bonus: PREMIER,
    periode_debut: "2026-11-02",
    periode_fin: "2026-11-29",
    detail: "parrainage de Ana, 2 semaines faites",
    quantite: 2,
    verifies: null,
    montant: 25,
    statut: "a_payer",
    contrat_url: "https://upwork.com/c",
    paye_at: null,
    paye_par: null,
    ...o,
  };
}

it("les totaux : à payer, à voir (sans contrat), payés", () => {
  expect(
    totauxBonus([
      ligne({ id: "1" }),
      ligne({ id: "2", type: "comment_master", montant: 18.5, statut: "a_voir", contrat_url: null }),
      ligne({ id: "3", statut: "paye" }),
    ]),
  ).toEqual({ total: 68.5, aPayer: 25, aVoir: 1, payes: 1 });
});

it("Bonus à venir, par lundi : du plus proche au plus loin, les plus gros d'abord", () => {
  const b = (o: Partial<BonusAVenir>): BonusAVenir => ({
    poster_id: "p",
    hm_id: "hm",
    type: "parrainage",
    detail: "d",
    quantite: 2,
    montant: 10,
    lundi_bonus: "2026-12-28",
    etat: "apercu",
    ...o,
  });
  const g = grouperAVenir([b({ montant: 5 }), b({ montant: 25, lundi_bonus: PREMIER, etat: "genere" }), b({ montant: 9 })]);
  expect(g.map((x) => [x.lundi, x.total, x.lignes.map((l) => l.montant)])).toEqual([
    [PREMIER, 25, [25]],
    ["2026-12-28", 14, [9, 5]],
  ]);
});

describe("la recrue proposée pour un parrainage", () => {
  const posteurs = [
    { id: "1", prenom: "Ana", nom: "Pérez" },
    { id: "2", prenom: "Bruno", nom: "Keller" },
    { id: "3", prenom: "Bruno", nom: "Keller" },
  ];
  it("même prénom et nom, sans accents ni majuscules", () => {
    expect(recrueProbable({ prenom: "ana", nom: "PEREZ" }, posteurs)?.id).toBe("1");
  });
  it("aucune proposition si deux posteurs portent le même nom, ou aucun", () => {
    expect(recrueProbable({ prenom: "Bruno", nom: "Keller" }, posteurs)).toBeNull();
    expect(recrueProbable({ prenom: "Zoé", nom: null }, posteurs)).toBeNull();
  });
});
