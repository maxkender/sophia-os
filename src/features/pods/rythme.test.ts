import { describe, expect, it } from "vitest";

import { languesParComptes, libelleChangement } from "./api";
import { dossierPod, parJourVoie1 } from "./rythme";

describe("fiche d'un podz", () => {
  it("retrouve le dossier de chaque podz dans pods/rythme.json", () => {
    expect(dossierPod("originaux_alpha_male")).toBe("alpha-male");
    expect(dossierPod("originaux_beau_smart_girl")).toBe("beau-smart-girl");
    expect(dossierPod("originaux_weird_alpha")).toBe("originaux");
    expect(dossierPod("originaux_plony")).toBe("plony");
    expect(dossierPod("page_blanche")).toBe("page-blanche");
    expect(parJourVoie1("originaux_alpha_male")).toBeGreaterThan(0);
    expect(parJourVoie1("remakes_kaja")).toBeNull();
  });

  it("écrit le changement de rythme et trie les langues", () => {
    expect([libelleChangement(2), libelleChangement(-1), libelleChangement(0)]).toEqual(["+2", "−1", "0"]);
    expect(languesParComptes({ it: 1, en: 3, es: 1 })).toEqual([["en", 3], ["es", 1], ["it", 1]]);
  });
});

import { serieDuPod } from "./api";

describe("série d'un podz", () => {
  it("ajoute la moyenne de tous les podz du jour, pondérée par les posts", () => {
    const s = serieDuPod(
      [
        { pod: "a", jour: "2026-11-10", posts: 10, moy_j1: 1000, moy_j2: null, moy_j3: 1500, moy_j7: null, moy: 2000, p10k: 0 },
        { pod: "b", jour: "2026-11-10", posts: 30, moy_j1: 3000, moy_j2: null, moy_j3: 3500, moy_j7: null, moy: 4000, p10k: 1 },
        { pod: "a", jour: "2026-11-11", posts: 5, moy_j1: null, moy_j2: null, moy_j3: null, moy_j7: null, moy: 100, p10k: 0 },
      ],
      "a",
    );
    expect(s.map((j) => [j.jour, j.flotte])).toEqual([["2026-11-10", 2500], ["2026-11-11", null]]);
    expect(serieDuPod([], "a", "moy_j3")).toEqual([]);
    expect(serieDuPod([{ pod: "a", jour: "x", posts: 1, moy_j1: 1, moy_j2: null, moy_j3: 9, moy_j7: null, moy: 1, p10k: 0 }], "a", "moy_j3")[0].valeur).toBe(9);
  });
});
