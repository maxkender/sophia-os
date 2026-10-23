/**
 * Cohortes du lundi de la page Posters : lundi de départ, cohorte du posteur,
 * semaine du parcours, options du filtre et tri.
 */
import { describe, expect, it } from "vitest";

import {
  cohortePosteur,
  COHORTE_PAS_DEMARRE,
  comparerCohortes,
  lundiDepartCompte,
  optionsCohortes,
  semaineDansCohorte,
  semaineIso,
} from "./cohortes";

describe("lundi de départ d'un compte", () => {
  it("le premier post prévu donne le lundi de sa semaine", () => {
    expect(lundiDepartCompte("2026-10-19", null)).toBe("2026-10-19");
    expect(lundiDepartCompte("2026-10-22", "2026-10-18T22:00:00Z")).toBe("2026-10-19");
    // Ancien posteur parti un mercredi.
    expect(lundiDepartCompte("2026-07-22", null)).toBe("2026-07-20");
  });

  it("sans post, la fin du warm-up (lundi 00 h, Paris) : la cohorte à venir", () => {
    // Lundi 26/10 00 h à Paris = dimanche 25/10 23 h UTC (heure d'hiver).
    expect(lundiDepartCompte(null, "2026-10-25T23:00:00Z")).toBe("2026-10-26");
    // Lundi 19/10 00 h à Paris = dimanche 18/10 22 h UTC (heure d'été).
    expect(lundiDepartCompte(undefined, "2026-10-18T22:00:00Z")).toBe("2026-10-19");
  });

  it("ni post ni warm-up : pas de lundi", () => {
    expect(lundiDepartCompte(null, null)).toBeNull();
    expect(lundiDepartCompte(null, "pas une date")).toBeNull();
  });
});

describe("cohorte d'un posteur", () => {
  it("le plus ancien lundi de ses comptes : un posteur doublé ou recréé garde sa cohorte", () => {
    expect(cohortePosteur(["2026-10-19", "2026-09-14", null])).toBe("2026-09-14");
    expect(cohortePosteur([null, null])).toBeNull();
    expect(cohortePosteur([])).toBeNull();
  });

  it("semaine du parcours : 1 la semaine du lundi, 0 ou moins à venir", () => {
    expect(semaineDansCohorte("2026-10-19", "2026-10-21")).toBe(1);
    expect(semaineDansCohorte("2026-10-12", "2026-10-21")).toBe(2);
    expect(semaineDansCohorte("2026-10-12", "2026-10-25")).toBe(2);
    expect(semaineDansCohorte("2026-10-26", "2026-10-21")).toBe(0);
    // Passage à l'heure d'hiver le 25/10 : la semaine ne glisse pas.
    expect(semaineDansCohorte("2026-10-19", "2026-11-02")).toBe(3);
  });

  it("numéro de semaine ISO", () => {
    expect(semaineIso("2026-10-19")).toBe(43);
    expect(semaineIso("2026-10-26")).toBe(44);
    expect(semaineIso("2026-12-28")).toBe(53);
    expect(semaineIso("2027-01-04")).toBe(1);
  });
});

describe("filtre et tri", () => {
  it("options : du lundi le plus récent au plus ancien, puis « pas démarré », avec les effectifs", () => {
    expect(optionsCohortes(["2026-10-12", null, "2026-10-19", "2026-10-19", "2026-10-26"])).toEqual([
      { cle: "2026-10-26", n: 1 },
      { cle: "2026-10-19", n: 2 },
      { cle: "2026-10-12", n: 1 },
      { cle: COHORTE_PAS_DEMARRE, n: 1 },
    ]);
    expect(optionsCohortes(["2026-10-19"])).toEqual([{ cle: "2026-10-19", n: 1 }]);
  });

  it("tri : récente ou ancienne d'abord, « pas démarré » toujours en dernier", () => {
    const liste = ["2026-10-12", null, "2026-10-26", "2026-10-19"];
    expect([...liste].sort((a, b) => comparerCohortes(a, b, true))).toEqual([
      "2026-10-26",
      "2026-10-19",
      "2026-10-12",
      null,
    ]);
    expect([...liste].sort((a, b) => comparerCohortes(a, b, false))).toEqual([
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      null,
    ]);
  });
});
