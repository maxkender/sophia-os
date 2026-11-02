import { describe, expect, it } from "vitest";

import type { LignePaie } from "./api";
import { consigneSuivante, milestone, parHm, semaineAPayer, totaux, trier } from "./logique";

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

describe("paie : semaine suivante (0369)", () => {
  const usd = (n: number) => `${n} $`;
  const s = (action: string, comptes = 1, montant: number | null = 10, raison: string | null = null) =>
    ({ poster_id: "p", action, comptes, montant, raison }) as never;

  it("continue : financer la milestone de la semaine d'APRÈS la semaine payée", () => {
    // Semaine payée 26/10 (Week 44) : la suivante est la Week 45.
    expect(consigneSuivante("2026-10-26", s("financer"), 10, usd)).toEqual({
      cle: "financer",
      valeurs: { montant: "10 $", milestone: "Week 45" },
      ton: "ok",
    });
  });

  it("Double : × 2 et « (2 acc) » seulement quand le 2ᵉ compte poste", () => {
    expect(consigneSuivante("2026-11-02", s("financer_double", 2, 20), 10, usd)).toEqual({
      cle: "financer_double",
      valeurs: { tarif: "10 $", milestone: "Week 46 (2 acc)" },
      ton: "ok",
    });
  });

  it("recréé : financer normalement, milestone d'un seul compte (pas de retenue, rien ne change)", () => {
    expect(consigneSuivante("2026-10-26", s("financer_normal", 1, 10), 10, usd).valeurs.milestone).toBe("Week 45");
  });

  it("Kill ou désactivé : ne pas financer, avec la raison ; déjà financée : remboursement", () => {
    expect(consigneSuivante("2026-10-26", s("ne_pas_financer", 0, null, "kill"), 10, usd)).toMatchObject({
      cle: "ne_pas_financer",
      valeurs: { raison: "kill" },
      ton: "stop",
    });
    expect(consigneSuivante("2026-10-26", s("ne_pas_financer", 1, null, "desactive"), 10, usd).valeurs.raison).toBe("desactive");
    expect(consigneSuivante("2026-10-26", s("deja_financee", 0, null, "kill"), 10, usd)).toMatchObject({
      cle: "deja_financee",
      ton: "alerte",
    });
  });

  it("0 post et pas de décision : à voir", () => {
    expect(consigneSuivante("2026-10-26", s("a_voir", 1, null, "zero_post"), 10, usd).cle).toBe("a_voir");
  });
});
