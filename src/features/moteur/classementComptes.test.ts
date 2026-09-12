import { describe, expect, it } from "vitest";

import {
  CLASSEMENTS,
  CLASSEMENT_REGLAGES_DEFAUT,
  classer,
  estSkippe,
  estSousSurveillance,
  etatTrial,
  finDuSkip,
  lireClassementReglages,
  lireModelesNudge,
  motifsSurveillance,
  pireClassement,
  rangClassement,
  seuilPostes,
  type ClassementEntree,
} from "./classementComptes";

/** Compte régulier (10/10) : seule la moyenne de vues décide. */
function surVues(moyenneVues: number, postes = 10): ClassementEntree {
  return { prevus: 10, postes, moyenneVues, mesures: 10 };
}

describe("échelle", () => {
  it("va de la pire à la meilleure case", () => {
    expect(CLASSEMENTS).toEqual(["inactif", "mauvaises_vues", "passable", "bien", "star"]);
    const rangs = CLASSEMENTS.map(rangClassement);
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
  });

  it("garde la moins bonne des deux cases", () => {
    expect(pireClassement("star", "inactif")).toBe("inactif");
    expect(pireClassement("mauvaises_vues", "passable")).toBe("mauvaises_vues");
    expect(pireClassement("bien", "bien")).toBe("bien");
  });
});

describe("INACTIF", () => {
  it("flague à 6 posts sur 10 prévus ou moins", () => {
    expect(classer({ prevus: 10, postes: 6, moyenneVues: 5_000, mesures: 6 }).classement).toBe(
      "inactif",
    );
    expect(classer({ prevus: 10, postes: 7, moyenneVues: 5_000, mesures: 7 }).classement).not.toBe(
      "inactif",
    );
  });

  it("prime sur les vues — un compte qui ne poste pas n'est pas une STAR", () => {
    const r = classer({ prevus: 10, postes: 5, moyenneVues: 900_000, mesures: 5 });
    expect(r.classement).toBe("inactif");
    expect(r.regle).toContain("5/10");
  });

  it("prime aussi sur les mauvaises vues", () => {
    expect(classer({ prevus: 10, postes: 2, moyenneVues: 50, mesures: 2 }).classement).toBe(
      "inactif",
    );
  });

  it("suit le nombre réel de prévus quand il y en a moins de 10", () => {
    // 5 prévus → seuil 60 % = 3 posts ou moins.
    expect(classer({ prevus: 5, postes: 3, moyenneVues: 5_000, mesures: 3 }).classement).toBe(
      "inactif",
    );
    expect(classer({ prevus: 5, postes: 4, moyenneVues: 5_000, mesures: 4 }).classement).not.toBe(
      "inactif",
    );
  });
});

describe("MAUVAISES VUES", () => {
  it("flague sous 600 vues de moyenne", () => {
    expect(surVues(599).moyenneVues).toBe(599);
    expect(classer(surVues(599)).classement).toBe("mauvaises_vues");
    expect(classer(surVues(0)).classement).toBe("mauvaises_vues");
    expect(classer(surVues(600)).classement).not.toBe("mauvaises_vues");
  });

  it("cite la moyenne dans la règle", () => {
    expect(classer(surVues(120)).regle).toContain("120");
  });
});

describe("PASSABLE", () => {
  it("attrape la zone 600 – 1 000 vues", () => {
    expect(classer(surVues(600)).classement).toBe("passable");
    expect(classer(surVues(999)).classement).toBe("passable");
  });

  it("attrape un compte régulier qui n'atteint pas BIEN", () => {
    expect(classer({ prevus: 10, postes: 7, moyenneVues: 800, mesures: 7 }).classement).toBe(
      "passable",
    );
  });

  it("ne juge pas un compte sans historique suffisant", () => {
    const neuf = classer({ prevus: 2, postes: 0, moyenneVues: null, mesures: 0 });
    expect(neuf.classement).toBe("passable");
    expect(neuf.regle).toContain("pas assez d'historique");
    // 1 post sur 2 prévus : 50 %, mais l'échantillon est trop petit pour flaguer.
    expect(classer({ prevus: 2, postes: 1, moyenneVues: 100, mesures: 1 }).classement).toBe(
      "passable",
    );
  });

  it("reste PASSABLE sans mesure de vues, même en postant tout", () => {
    expect(classer({ prevus: 10, postes: 10, moyenneVues: null, mesures: 0 }).classement).toBe(
      "passable",
    );
  });
});

describe("BIEN", () => {
  it("demande 1 000 vues et 8 posts sur 10", () => {
    expect(classer({ prevus: 10, postes: 8, moyenneVues: 1_000, mesures: 8 }).classement).toBe(
      "bien",
    );
    expect(classer({ prevus: 10, postes: 7, moyenneVues: 5_000, mesures: 7 }).classement).toBe(
      "passable",
    );
    expect(classer({ prevus: 10, postes: 8, moyenneVues: 999, mesures: 8 }).classement).toBe(
      "passable",
    );
  });

  it("rattrape un gros compte qui rate le 9/10 de STAR", () => {
    expect(classer({ prevus: 10, postes: 8, moyenneVues: 50_000, mesures: 8 }).classement).toBe(
      "bien",
    );
  });

  it("suit le nombre réel de prévus (5 prévus → 4 posts)", () => {
    expect(classer({ prevus: 5, postes: 4, moyenneVues: 2_000, mesures: 4 }).classement).toBe(
      "bien",
    );
  });
});

describe("STAR", () => {
  it("demande plus de 10 000 vues et 9 posts sur 10", () => {
    expect(classer({ prevus: 10, postes: 9, moyenneVues: 10_001, mesures: 9 }).classement).toBe(
      "star",
    );
    expect(classer({ prevus: 10, postes: 10, moyenneVues: 10_000, mesures: 10 }).classement).toBe(
      "bien",
    );
    expect(classer({ prevus: 10, postes: 8, moyenneVues: 40_000, mesures: 8 }).classement).toBe(
      "bien",
    );
  });

  it("gagne sur BIEN quand les deux sont atteints", () => {
    // 9/10 et 50 000 vues cochent aussi BIEN : la meilleure case gagne.
    expect(classer({ prevus: 10, postes: 9, moyenneVues: 50_000, mesures: 9 }).classement).toBe(
      "star",
    );
  });
});

describe("seuil au prorata", () => {
  it("monte pour une exigence, descend pour un plafond", () => {
    expect(seuilPostes(8, 10, 10)).toBe(8);
    expect(seuilPostes(8, 5, 10)).toBe(4);
    expect(seuilPostes(9, 3, 10)).toBe(3);
    expect(seuilPostes(6, 10, 10, "bas")).toBe(6);
    expect(seuilPostes(6, 5, 10, "bas")).toBe(3);
    expect(seuilPostes(6, 3, 10, "bas")).toBe(1);
  });
});

describe("réglages", () => {
  it("reprend les défauts sur une valeur absente ou aberrante", () => {
    expect(lireClassementReglages(undefined)).toEqual(CLASSEMENT_REGLAGES_DEFAUT);
    expect(lireClassementReglages({ vues_star: "beaucoup" }).vues_star).toBe(10_000);
    expect(lireClassementReglages({ fenetre: 0 }).fenetre).toBe(10);
  });

  it("applique des seuils personnalisés", () => {
    const r = lireClassementReglages({ vues_mauvaises: 2_000, min_echantillon: 1 });
    expect(classer({ prevus: 5, postes: 5, moyenneVues: 1_500, mesures: 5 }, r).classement).toBe(
      "mauvaises_vues",
    );
  });

  it("classe toujours dans une case connue", () => {
    for (const prevus of [0, 1, 3, 7, 10, 40]) {
      for (const postes of [0, 1, 5, 10, 40]) {
        for (const moyenneVues of [null, 0, 599, 600, 1_000, 10_000, 10_001, 5_000_000]) {
          const out = classer({ prevus, postes, moyenneVues, mesures: postes });
          expect(CLASSEMENTS).toContain(out.classement);
        }
      }
    }
  });
});

describe("trial", () => {
  const t0 = Date.parse("2026-09-12T00:00:00Z");
  const cree = (hDepuis: number) => new Date(t0 - hDepuis * 3600_000).toISOString();

  it("dure 80 h après la création du compte", () => {
    expect(etatTrial(cree(0), CLASSEMENT_REGLAGES_DEFAUT, t0).enTrial).toBe(true);
    expect(etatTrial(cree(79), CLASSEMENT_REGLAGES_DEFAUT, t0).enTrial).toBe(true);
    expect(etatTrial(cree(81), CLASSEMENT_REGLAGES_DEFAUT, t0).enTrial).toBe(false);
  });

  it("alerte dans les 30 dernières heures", () => {
    expect(etatTrial(cree(49), CLASSEMENT_REGLAGES_DEFAUT, t0).alerte).toBe(false);
    expect(etatTrial(cree(50), CLASSEMENT_REGLAGES_DEFAUT, t0).alerte).toBe(true);
    expect(etatTrial(cree(79), CLASSEMENT_REGLAGES_DEFAUT, t0).alerte).toBe(true);
    // Trial fini : plus d'alerte, le compte n'est plus jugé là-dessus.
    expect(etatTrial(cree(90), CLASSEMENT_REGLAGES_DEFAUT, t0).alerte).toBe(false);
  });

  it("tient les heures restantes et la date de fin", () => {
    const e = etatTrial(cree(60), CLASSEMENT_REGLAGES_DEFAUT, t0);
    expect(e.heuresRestantes).toBeCloseTo(20, 5);
    expect(e.finAt).toBe(new Date(t0 + 20 * 3600_000).toISOString());
  });

  it("ne casse pas sur une date absente ou invalide", () => {
    expect(etatTrial(null).enTrial).toBe(false);
    expect(etatTrial("pas une date").finAt).toBeNull();
  });
});

describe("file de surveillance", () => {
  const t0 = Date.parse("2026-09-12T00:00:00Z");
  const cree = (hDepuis: number) => new Date(t0 - hDepuis * 3600_000).toISOString();

  it("prend les INACTIF et les MAUVAISES VUES", () => {
    expect(motifsSurveillance({ classement: "inactif" }, undefined, t0)).toEqual(["inactif"]);
    expect(motifsSurveillance({ classement: "mauvaises_vues" }, undefined, t0)).toEqual([
      "mauvaises_vues",
    ]);
    expect(motifsSurveillance({ classement: "passable" }, undefined, t0)).toEqual([]);
    expect(motifsSurveillance({ classement: "star" }, undefined, t0)).toEqual([]);
  });

  it("prend un trial à 30 h de la fin quel que soit son classement", () => {
    expect(
      motifsSurveillance({ classement: "star", created_at: cree(55) }, undefined, t0),
    ).toEqual(["trial"]);
    expect(
      motifsSurveillance({ classement: "passable", created_at: cree(10) }, undefined, t0),
    ).toEqual([]);
  });

  it("cumule trial et flag", () => {
    expect(
      motifsSurveillance({ classement: "inactif", created_at: cree(55) }, undefined, t0),
    ).toEqual(["inactif", "trial"]);
  });

  it("masque une ligne skippée, puis la rend", () => {
    const skip = { classement: "inactif" as const, surveillance_skip_jusqu: cree(-48) };
    expect(estSkippe(skip.surveillance_skip_jusqu, t0)).toBe(true);
    expect(estSousSurveillance(skip, undefined, t0)).toBe(false);

    const expire = { classement: "inactif" as const, surveillance_skip_jusqu: cree(1) };
    expect(estSkippe(expire.surveillance_skip_jusqu, t0)).toBe(false);
    expect(estSousSurveillance(expire, undefined, t0)).toBe(true);
  });

  it("sort de la file dès qu'il est proposé au non-renouvellement", () => {
    const flague = { classement: "inactif" as const };
    expect(estSousSurveillance(flague, undefined, t0)).toBe(true);
    // La décision est prise : il vit désormais dans la liste « ne pas renouveler ».
    expect(estSousSurveillance({ ...flague, non_renouveler: true }, undefined, t0)).toBe(false);
    // Même en pleine alerte de fin d'essai.
    expect(
      estSousSurveillance(
        { classement: "star", created_at: cree(55), non_renouveler: true },
        undefined,
        t0,
      ),
    ).toBe(false);
    // Retiré de la liste, il revient s'il est toujours flagué.
    expect(estSousSurveillance({ ...flague, non_renouveler: false }, undefined, t0)).toBe(true);
  });

  it("pose un skip de 7 jours", () => {
    expect(finDuSkip(CLASSEMENT_REGLAGES_DEFAUT, t0)).toBe(
      new Date(t0 + 7 * 86_400_000).toISOString(),
    );
  });
});

describe("modèles de nudge", () => {
  it("lit la liste et nettoie les espaces", () => {
    expect(
      lireModelesNudge({
        modeles: [{ id: " regularite ", titre: " On perd le rythme ", corps: " Poste. " }],
      }),
    ).toEqual([{ id: "regularite", titre: "On perd le rythme", corps: "Poste." }]);
  });

  it("jette un modèle sans corps — il n'y aurait rien à envoyer", () => {
    expect(lireModelesNudge({ modeles: [{ id: "vide", titre: "Titre" }] })).toEqual([]);
    expect(lireModelesNudge({ modeles: [{ corps: "   " }] })).toEqual([]);
  });

  it("donne un id positionnel quand il manque", () => {
    const out = lireModelesNudge({ modeles: [{ corps: "a" }, { corps: "b" }] });
    expect(out.map((m) => m.id)).toEqual(["modele_1", "modele_2"]);
  });

  it("tolère une valeur absente ou mal formée", () => {
    expect(lireModelesNudge(undefined)).toEqual([]);
    expect(lireModelesNudge({})).toEqual([]);
    expect(lireModelesNudge({ modeles: "oui" })).toEqual([]);
    expect(lireModelesNudge({ modeles: [null, 42, { corps: "ok" }] })).toEqual([
      { id: "modele_3", titre: "", corps: "ok" },
    ]);
  });
});
