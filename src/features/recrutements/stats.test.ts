import { describe, expect, it } from "vitest";

import { baseEmailOs, estCompteTestRecrutement, messageAccesOs } from "./constantes";
import {
  aggregerPassagesCompte,
  assemblerStatsCreateur,
  derniersJoursParis,
  flagVolume,
  formaterPosts10j,
  moyenneHm,
  paye10jUsd,
  usdPour1000,
} from "./stats";

describe("stats 10 j", () => {
  it("flag si < 75 % des passages prévus", () => {
    expect(flagVolume(7, 10)).toBe(true);
    expect(flagVolume(8, 10)).toBe(false);
    expect(flagVolume(0, 0)).toBe(false);
  });

  it("paye essai 15 $ sinon 60 prorata 10/30", () => {
    expect(paye10jUsd({ coutMensuel: null, essai: true })).toBe(15);
    expect(paye10jUsd({ coutMensuel: null, essai: false })).toBe(20);
    expect(paye10jUsd({ coutMensuel: 90, essai: false })).toBe(30);
  });

  it("$ / 1000 vues", () => {
    expect(usdPour1000(20, 10_000)).toBe(2);
    expect(usdPour1000(20, 0)).toBeNull();
  });

  it("ton : shadowban vs sous-quota à grosses vues", () => {
    const shadow = assemblerStatsCreateur({
      posterId: "a",
      prevus: 10,
      postes: 4,
      vuesMoy10: 0,
      vues10j: 0,
      coutMensuel: null,
      essai: false,
    });
    expect(shadow.flagVolume).toBe(true);
    expect(shadow.ton).toBe("vues");

    const doux = assemblerStatsCreateur({
      posterId: "b",
      prevus: 10,
      postes: 5,
      vuesMoy10: 12_000,
      vues10j: 60_000,
      coutMensuel: null,
      essai: false,
    });
    expect(doux.ton).toBe("doux");
  });

  it("moyenne HM, pas la somme", () => {
    const a = assemblerStatsCreateur({
      posterId: "a",
      prevus: 10,
      postes: 10,
      vuesMoy10: 1000,
      vues10j: 10_000,
      coutMensuel: null,
      essai: false,
    });
    const b = assemblerStatsCreateur({
      posterId: "b",
      prevus: 10,
      postes: 5,
      vuesMoy10: 3000,
      vues10j: 15_000,
      coutMensuel: null,
      essai: false,
    });
    const m = moyenneHm([a, b]);
    expect(m.ratio).toBeCloseTo(0.75);
    expect(m.vuesMoy10).toBe(2000);
    expect(m.postes).toBe(7.5);
    expect(m.prevus).toBe(10);
    expect(formaterPosts10j(m.postes, m.prevus)).toBe("8 / 10");
  });

  it("agrège passages OS : prévus, postés, vues 10 j, moyenne des 10 derniers", () => {
    const fenetre = { debut: "2026-08-29", fin: "2026-09-07", apresWarmup: true };
    const agg = aggregerPassagesCompte(
      [
        {
          id: "p1",
          compte_id: "c",
          statut: "publie",
          date_publication_prevue: "2026-08-29",
          publie_at: "2026-08-28T22:30:00.000Z",
          vues: 100,
        },
        {
          id: "p2",
          compte_id: "c",
          statut: "planifie",
          date_publication_prevue: "2026-09-07",
          publie_at: null,
          vues: null,
        },
        {
          id: "brouillon",
          compte_id: "c",
          statut: "brouillon",
          date_publication_prevue: "2026-09-01",
          publie_at: null,
          vues: null,
        },
        {
          id: "hors",
          compte_id: "c",
          statut: "publie",
          date_publication_prevue: "2026-08-20",
          publie_at: "2026-08-20T10:00:00.000Z",
          vues: 50_000,
        },
        {
          id: "p3",
          compte_id: "c",
          statut: "publie",
          date_publication_prevue: "2026-09-01",
          publie_at: "2026-09-01T12:00:00.000Z",
          vues: null,
        },
      ],
      fenetre,
    );
    expect(agg.prevus).toBe(3);
    expect(agg.postes).toBe(2);
    expect(agg.vues10j).toBe(100);
    expect(agg.vuesMoy10).toBe((100 + 50_000) / 2);
  });

  it("warmup : pas de prévus, posts et vues quand même", () => {
    const agg = aggregerPassagesCompte(
      [
        {
          id: "p1",
          compte_id: "c",
          statut: "publie",
          date_publication_prevue: "2026-09-01",
          publie_at: "2026-09-01T12:00:00.000Z",
          vues: 800,
        },
      ],
      { debut: "2026-08-29", fin: "2026-09-07", apresWarmup: false },
    );
    expect(agg.prevus).toBe(0);
    expect(agg.postes).toBe(1);
    expect(agg.vues10j).toBe(800);
    expect(agg.vuesMoy10).toBe(800);
  });

  it("10 jours calendaires Paris ancrés", () => {
    const jours = derniersJoursParis(10, new Date("2026-09-07T12:00:00Z"));
    expect(jours).toHaveLength(10);
    expect(jours[0]).toBe("2026-08-29");
    expect(jours[9]).toBe("2026-09-07");
  });

  it("exclut le compte test", () => {
    expect(estCompteTestRecrutement({ email: "testtt@sophia.com", prenom: "testt" })).toBe(
      true,
    );
    expect(estCompteTestRecrutement({ email: "remim@sophia.com", prenom: "remi" })).toBe(
      false,
    );
  });

  it("login OS = prenom + 1re lettre du nom", () => {
    expect(baseEmailOs("Rémi", "Martin")).toBe("remim@sophia.com");
    expect(messageAccesOs({ prenom: "Remi", email: "remim@sophia.com", fr: true })).toContain(
      "12345678",
    );
  });
});
