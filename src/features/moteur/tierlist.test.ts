import { describe, expect, it } from "vitest";

import {
  PASSAGES_PAR_TIER,
  TIERS,
  TIER_MIN_PRIORITAIRE,
  bandesDeTirage,
  deciderRequalif,
  decisionDepuisEtat,
  estTierPrioritaire,
  etalerRappels,
  jourSuivant,
  rangTier,
  requalifier,
  tierDepuisEloExistant,
  tierImport,
  type CandidatRappel,
  type DecisionRequalifEntree,
  type Tier,
} from "./tierlist";

/** Raccourci : requalifie sur la seule moyenne, sans passage qui perce. */
function surM(tier: Tier, m: number) {
  return requalifier({ tier, moyenne: m, maxVues: m, nb150k: 0 }).tier;
}

describe("passages par rang", () => {
  it("double à chaque cran, 0 en D", () => {
    expect(TIERS).toEqual(["D", "C", "B", "A", "S", "S+"]);
    expect(PASSAGES_PAR_TIER).toEqual({ D: 0, C: 1, B: 2, A: 4, S: 8, "S+": 16 });
  });
});

describe("premier placement à l'import", () => {
  it("refuse sous le seuil", () => {
    expect(tierImport(54.9)).toBeNull();
    expect(tierImport(0)).toBeNull();
    expect(tierImport(Number.NaN)).toBeNull();
  });

  it("place en C, B puis A", () => {
    expect(tierImport(55)).toBe("C");
    expect(tierImport(59.9)).toBe("C");
    expect(tierImport(60)).toBe("B");
    expect(tierImport(69.9)).toBe("B");
    expect(tierImport(70)).toBe("A");
    expect(tierImport(100)).toBe("A");
  });

  it("ne place jamais directement en S ou S+", () => {
    for (let note = 55; note <= 100; note += 1) {
      expect(["C", "B", "A"]).toContain(tierImport(note));
    }
  });

  it("suit un seuil personnalisé", () => {
    expect(tierImport(58, 60)).toBeNull();
    expect(tierImport(62, 60)).toBe("B");
  });
});

describe("requalification depuis D", () => {
  it("reste en D sous 600", () => {
    expect(surM("D", 0)).toBe("D");
    expect(surM("D", 599)).toBe("D");
  });

  it("monte en C entre 600 et 1 000", () => {
    expect(surM("D", 600)).toBe("C");
    expect(surM("D", 999)).toBe("C");
  });

  it("monte en B entre 1 000 et 5 000", () => {
    expect(surM("D", 1_000)).toBe("B");
    expect(surM("D", 4_999)).toBe("B");
  });

  it("monte en A au-delà de 5 000", () => {
    expect(surM("D", 5_000)).toBe("A");
  });
});

describe("requalification depuis C", () => {
  it("descend en D sous 600", () => {
    expect(surM("C", 599)).toBe("D");
  });

  it("reste en C entre 600 et 1 000", () => {
    expect(surM("C", 600)).toBe("C");
    expect(surM("C", 999)).toBe("C");
  });

  it("monte en B puis A", () => {
    expect(surM("C", 1_000)).toBe("B");
    expect(surM("C", 5_000)).toBe("A");
    expect(surM("C", 29_999)).toBe("A");
  });

  it("monte en S dès qu'un passage dépasse 30k", () => {
    expect(requalifier({ tier: "C", moyenne: 700, maxVues: 30_000, nb150k: 0 }).tier).toBe("S");
  });
});

describe("requalification depuis B", () => {
  it("descend en C sous 1 000", () => {
    expect(surM("B", 999)).toBe("C");
  });

  it("reste en B entre 1 000 et 5 000", () => {
    expect(surM("B", 1_000)).toBe("B");
    expect(surM("B", 4_999)).toBe("B");
  });

  it("monte en A entre 5 000 et 30 000", () => {
    expect(surM("B", 5_000)).toBe("A");
    expect(surM("B", 29_999)).toBe("A");
  });

  it("monte en S puis S+ sur un passage qui perce", () => {
    expect(requalifier({ tier: "B", moyenne: 1_200, maxVues: 30_000, nb150k: 0 }).tier).toBe("S");
    expect(requalifier({ tier: "B", moyenne: 1_200, maxVues: 150_000, nb150k: 1 }).tier).toBe("S+");
  });
});

describe("requalification depuis A", () => {
  it("descend en B sous 5 000", () => {
    expect(surM("A", 4_999)).toBe("B");
  });

  it("reste en A entre 5 000 et 30 000", () => {
    expect(surM("A", 5_000)).toBe("A");
    expect(surM("A", 29_999)).toBe("A");
  });

  it("monte en S puis S+ sur un passage qui perce", () => {
    expect(requalifier({ tier: "A", moyenne: 6_000, maxVues: 30_000, nb150k: 0 }).tier).toBe("S");
    expect(requalifier({ tier: "A", moyenne: 6_000, maxVues: 150_000, nb150k: 1 }).tier).toBe("S+");
  });
});

describe("requalification depuis S", () => {
  it("descend en A si aucun passage ne dépasse 30k", () => {
    expect(requalifier({ tier: "S", moyenne: 29_999, maxVues: 29_999, nb150k: 0 }).tier).toBe("A");
  });

  it("reste en S si un passage dépasse 30k, même avec une moyenne basse", () => {
    expect(requalifier({ tier: "S", moyenne: 4_000, maxVues: 31_000, nb150k: 0 }).tier).toBe("S");
  });

  it("monte en S+ sur un passage à 150k", () => {
    expect(requalifier({ tier: "S", moyenne: 20_000, maxVues: 150_000, nb150k: 1 }).tier).toBe("S+");
  });
});

describe("requalification depuis S+", () => {
  it("reste en S+ avec deux passages à 150k", () => {
    expect(requalifier({ tier: "S+", moyenne: 40_000, maxVues: 300_000, nb150k: 2 }).tier).toBe("S+");
  });

  it("redescend en S avec un seul passage à 150k", () => {
    expect(requalifier({ tier: "S+", moyenne: 40_000, maxVues: 300_000, nb150k: 1 }).tier).toBe("S");
  });

  it("redescend en S sans aucun passage à 150k, même très haute moyenne", () => {
    expect(requalifier({ tier: "S+", moyenne: 120_000, maxVues: 140_000, nb150k: 0 }).tier).toBe("S");
  });
});

describe("priorité du passage qui perce sur la moyenne", () => {
  it("un seul passage à 150k fait monter en S+ depuis B et A", () => {
    // 2 passages en B : 150k et 0 → m = 75k, mais c'est bien le max qui décide.
    expect(requalifier({ tier: "B", moyenne: 75_000, maxVues: 150_000, nb150k: 1 }).tier).toBe("S+");
    expect(requalifier({ tier: "A", moyenne: 300, maxVues: 150_000, nb150k: 1 }).tier).toBe("S+");
  });

  it("30k l'emporte sur une moyenne qui ferait descendre", () => {
    expect(requalifier({ tier: "A", moyenne: 100, maxVues: 30_000, nb150k: 0 }).tier).toBe("S");
  });
});

describe("migration de l'ELO natif vers un rang", () => {
  it("suit le barème décalé (< 55 en D)", () => {
    expect(tierDepuisEloExistant(0)).toBe("D");
    expect(tierDepuisEloExistant(54.9)).toBe("D");
    expect(tierDepuisEloExistant(55)).toBe("C");
    expect(tierDepuisEloExistant(64.9)).toBe("C");
    expect(tierDepuisEloExistant(65)).toBe("B");
    expect(tierDepuisEloExistant(74.9)).toBe("B");
    expect(tierDepuisEloExistant(75)).toBe("A");
    expect(tierDepuisEloExistant(84.9)).toBe("A");
    expect(tierDepuisEloExistant(85)).toBe("S");
    expect(tierDepuisEloExistant(88.9)).toBe("S");
    expect(tierDepuisEloExistant(89)).toBe("S+");
  });
});

describe("cohérence des cycles", () => {
  it("tout rang atteignable a un nombre de passages fini et positif sauf D", () => {
    for (const tier of TIERS) {
      const n = PASSAGES_PAR_TIER[tier];
      expect(Number.isInteger(n)).toBe(true);
      expect(n >= 0).toBe(true);
      if (tier !== "D") expect(n).toBeGreaterThan(0);
    }
  });

  it("une requalification renvoie toujours un rang connu", () => {
    for (const tier of TIERS) {
      for (const m of [0, 599, 600, 1_000, 5_000, 29_999, 30_000, 200_000]) {
        expect(TIERS).toContain(requalifier({ tier, moyenne: m, maxVues: m, nb150k: 0 }).tier);
      }
    }
  });
});

describe("décision de requalification", () => {
  const JOUR = 86_400_000;
  const MAINTENANT = Date.parse("2026-09-16T12:00:00Z");

  /** Cycle de 2 passages, publiés il y a 3 jours, tous mesurés. */
  const base = (over: Partial<DecisionRequalifEntree> = {}): DecisionRequalifEntree => ({
    publies: 2,
    passagesPrevus: 2,
    mesures: 2,
    introuvables: 0,
    enAttenteMesure: 0,
    moyenne: 3_000,
    dernierPublieMs: MAINTENANT - 3 * JOUR,
    maintenantMs: MAINTENANT,
    reculJours: 1,
    requalifMaxJours: 3,
    ...over,
  });

  it("attend tant que les passages ne sont pas tous publiés", () => {
    expect(deciderRequalif(base({ publies: 1 }))).toEqual({
      requalifier: false,
      motif: "passages",
    });
  });

  it("ne requalifie pas un D dormant", () => {
    expect(deciderRequalif(base({ publies: 0, passagesPrevus: 0, mesures: 0 }))).toEqual({
      requalifier: false,
      motif: "passages",
    });
  });

  it("attend le recul sur le dernier passage", () => {
    const frais = base({ dernierPublieMs: MAINTENANT - 3_600_000 });
    expect(deciderRequalif(frais)).toEqual({ requalifier: false, motif: "recul" });
  });

  it("requalifie sur m dès qu'un passage est mesuré", () => {
    expect(deciderRequalif(base())).toEqual({ requalifier: true, surMesure: true });
    // Un seul mesuré sur deux suffit — c'est la règle en place.
    const partiel = base({ mesures: 1, introuvables: 1 });
    expect(deciderRequalif(partiel)).toEqual({ requalifier: true, surMesure: true });
  });

  it("relance sans attendre quand plus aucune mesure ne peut tomber", () => {
    const perdu = base({ mesures: 0, moyenne: null, introuvables: 2 });
    expect(deciderRequalif(perdu)).toEqual({
      requalifier: true,
      surMesure: false,
      motif: "introuvable",
    });
  });

  it("patiente tant qu'une mesure peut encore tomber, sous le plafond", () => {
    const enCours = base({
      mesures: 0,
      moyenne: null,
      enAttenteMesure: 2,
      dernierPublieMs: MAINTENANT - 2 * JOUR,
    });
    expect(deciderRequalif(enCours)).toEqual({ requalifier: false, motif: "mesure" });
  });

  it("relance au plafond, même si la résolution traîne encore", () => {
    const echu = base({
      mesures: 0,
      moyenne: null,
      enAttenteMesure: 2,
      dernierPublieMs: MAINTENANT - 3 * JOUR,
    });
    expect(deciderRequalif(echu)).toEqual({
      requalifier: true,
      surMesure: false,
      motif: "delai",
    });
  });

  it("ne gèle pas un cycle dont la date de publication manque", () => {
    const sansDate = base({
      mesures: 0,
      moyenne: null,
      enAttenteMesure: 2,
      dernierPublieMs: Number.NaN,
    });
    expect(deciderRequalif(sansDate)).toEqual({
      requalifier: true,
      surMesure: false,
      motif: "delai",
    });
  });

  it("un cycle terminé finit toujours par repartir", () => {
    // Le point de la bascule : quelle que soit la répartition des mesures,
    // aucun cycle fini ne reste bloqué au-delà du plafond.
    for (const mesures of [0, 1, 2]) {
      for (const introuvables of [0, 1, 2]) {
        for (const enAttenteMesure of [0, 1, 2]) {
          if (mesures + introuvables + enAttenteMesure !== 2) continue;
          const d = deciderRequalif(
            base({
              mesures,
              introuvables,
              enAttenteMesure,
              moyenne: mesures > 0 ? 3_000 : null,
              dernierPublieMs: MAINTENANT - 10 * JOUR,
            }),
          );
          expect(d.requalifier).toBe(true);
        }
      }
    }
  });

  it("lit directement une ligne de contenu_tier_etat", () => {
    const d = decisionDepuisEtat(
      {
        passages_prevus: 2,
        publies: 2,
        mesures: 0,
        introuvables: 2,
        en_attente_mesure: 0,
        moyenne_vues: null,
        dernier_publie_at: "2026-09-13T08:00:00Z",
      },
      { recul_jours: 1, requalif_max_jours: 3 },
      new Date(MAINTENANT),
    );
    expect(d).toEqual({ requalifier: true, surMesure: false, motif: "introuvable" });
  });

  it("traite une date illisible comme absente", () => {
    const d = decisionDepuisEtat(
      {
        passages_prevus: 1,
        publies: 1,
        mesures: 0,
        introuvables: 0,
        en_attente_mesure: 1,
        moyenne_vues: null,
        dernier_publie_at: "pas une date",
      },
      { recul_jours: 1, requalif_max_jours: 3 },
      new Date(MAINTENANT),
    );
    expect(d).toEqual({ requalifier: true, surMesure: false, motif: "delai" });
  });
});

describe("priorité au tirage du jour", () => {
  const pool = (...entrees: Array<[Tier, boolean]>) =>
    entrees.map(([tier, dejaPoste], i) => ({ id: `${tier}-${i}`, tier, dejaPoste }));
  const ids = (bandes: Array<Array<{ id: string }>>) => bandes.map((b) => b.map((c) => c.id));

  it("sert B et au-dessus, garde C et D pour combler", () => {
    expect(TIER_MIN_PRIORITAIRE).toBe("B");
    expect(estTierPrioritaire("B")).toBe(true);
    expect(estTierPrioritaire("A")).toBe(true);
    expect(estTierPrioritaire("S")).toBe(true);
    expect(estTierPrioritaire("S+")).toBe(true);
    expect(estTierPrioritaire("C")).toBe(false);
    expect(estTierPrioritaire("D")).toBe(false);
  });

  it("ordonne l'échelle D < C < B < A < S < S+", () => {
    const rangs = TIERS.map(rangTier);
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
    expect(new Set(rangs).size).toBe(TIERS.length);
  });

  it("range le pool en quatre bandes : B+ neuf, B+ déjà vu, puis le bas", () => {
    const bandes = bandesDeTirage(
      pool(["C", false], ["A", true], ["S+", false], ["D", true], ["C", true], ["B", false]),
    );
    expect(ids(bandes)).toEqual([
      ["S+-2", "B-5"],
      ["A-1"],
      ["C-0"],
      ["D-3", "C-4"],
    ]);
  });

  it("ne tire un C que si le pool n'a plus rien en B+", () => {
    const avecB = bandesDeTirage(pool(["C", false], ["C", false], ["B", true]));
    // Première bande non vide : le B déjà posté passe devant les C neufs.
    expect(avecB.find((b) => b.length > 0)?.map((c) => c.tier)).toEqual(["B"]);

    const sansB = bandesDeTirage(pool(["C", false], ["C", true]));
    expect(sansB.find((b) => b.length > 0)?.map((c) => c.tier)).toEqual(["C"]);
  });

  it("un pool sans B+ reste servi (jamais de créneau perdu)", () => {
    for (const tier of TIERS) {
      const bandes = bandesDeTirage(pool([tier, false]));
      expect(bandes.flat()).toHaveLength(1);
    }
    expect(bandesDeTirage([]).flat()).toHaveLength(0);
  });

  it("aucune bande servie avant une bande B+ non vide", () => {
    const bandes = bandesDeTirage(pool(["C", false], ["D", false], ["S", true]));
    const premiere = bandes.findIndex((b) => b.length > 0);
    expect(bandes[premiere].every((c) => estTierPrioritaire(c.tier))).toBe(true);
  });
});

describe("étalement des rappels J+7", () => {
  /** `c(id, publié le, jour visé)` — le jour visé vaut publié + 7 par défaut. */
  function c(id: string, publieLe: string, jourCible = ""): CandidatRappel {
    return {
      id,
      compteId: "A",
      publieLe,
      jourCible: jourCible ||
        new Date(Date.parse(`${publieLe}T00:00:00Z`) + 7 * 86_400_000)
          .toISOString()
          .slice(0, 10),
    };
  }

  const quota = (n: number) => () => n;

  it("laisse un rappel à sa date quand elle est libre et à venir", () => {
    const [place] = etalerRappels([c("x", "2026-09-07")], {
      premierJour: "2026-09-13",
      quota: quota(2),
    });
    expect(place.jour).toBe("2026-09-14");
  });

  it("remonte au premier jour ouvrable un J+7 déjà passé", () => {
    const [place] = etalerRappels([c("x", "2026-08-16")], {
      premierJour: "2026-09-13",
      quota: quota(2),
    });
    expect(place.jour).toBe("2026-09-13");
  });

  it("ne dépasse jamais le quota du compte — le surplus glisse", () => {
    // Le cas de prod : 9 rappels échus, un compte à 2 posts/jour.
    const candidats = [
      c("1", "2026-08-16"),
      c("2", "2026-08-19"),
      c("3", "2026-08-22"),
      c("4", "2026-08-23"),
      c("5", "2026-08-28"),
      c("6", "2026-08-29"),
      c("7", "2026-09-01"),
      c("8", "2026-09-04"),
      c("9", "2026-09-04"),
    ];
    const places = etalerRappels(candidats, {
      premierJour: "2026-09-13",
      quota: quota(2),
    });
    const parJour = new Map<string, number>();
    for (const p of places) parJour.set(p.jour, (parJour.get(p.jour) ?? 0) + 1);
    expect([...parJour.entries()].sort()).toEqual([
      ["2026-09-13", 2],
      ["2026-09-14", 2],
      ["2026-09-15", 2],
      ["2026-09-16", 2],
      ["2026-09-17", 1],
    ]);
    expect(places).toHaveLength(9);
  });

  it("sert les plus anciens en premier", () => {
    const places = etalerRappels(
      [c("recent", "2026-09-02"), c("vieux", "2026-08-16"), c("milieu", "2026-08-28")],
      { premierJour: "2026-09-13", quota: quota(1) },
    );
    expect(places.map((p) => [p.id, p.jour])).toEqual([
      ["vieux", "2026-09-13"],
      ["milieu", "2026-09-14"],
      ["recent", "2026-09-15"],
    ]);
  });

  it("compte les passages déjà posés sur le jour visé", () => {
    const places = etalerRappels([c("x", "2026-08-16"), c("y", "2026-08-17")], {
      premierJour: "2026-09-13",
      quota: quota(2),
      // Le compte a déjà un passage le 13 : il ne reste qu'une place.
      occupation: (_, jour) => (jour === "2026-09-13" ? 1 : 0),
    });
    expect(places.map((p) => p.jour)).toEqual(["2026-09-13", "2026-09-14"]);
  });

  it("isole les comptes les uns des autres", () => {
    const places = etalerRappels(
      [
        { id: "a1", compteId: "A", publieLe: "2026-08-16", jourCible: "2026-08-23" },
        { id: "b1", compteId: "B", publieLe: "2026-08-17", jourCible: "2026-08-24" },
        { id: "a2", compteId: "A", publieLe: "2026-08-18", jourCible: "2026-08-25" },
      ],
      { premierJour: "2026-09-13", quota: quota(1) },
    );
    expect(places.map((p) => [p.id, p.jour])).toEqual([
      ["a1", "2026-09-13"],
      ["b1", "2026-09-13"],
      ["a2", "2026-09-14"],
    ]);
  });

  it("pose quand même le rappel d'un compte à quota 0", () => {
    const places = etalerRappels([c("x", "2026-08-16"), c("y", "2026-08-17")], {
      premierJour: "2026-09-13",
      quota: quota(0),
    });
    expect(places.map((p) => p.jour)).toEqual(["2026-09-13", "2026-09-14"]);
  });

  it("passe les fins de mois", () => {
    expect(jourSuivant("2026-09-30")).toBe("2026-10-01");
    expect(jourSuivant("2026-12-31")).toBe("2027-01-01");
    expect(jourSuivant("2028-02-28")).toBe("2028-02-29");
  });
});
