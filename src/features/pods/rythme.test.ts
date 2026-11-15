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
    expect(parJourVoie1("originaux_plony")).toBeGreaterThan(0);
    expect(parJourVoie1("remakes_kaja")).toBeNull();
  });

  it("écrit le changement de rythme et trie les langues", () => {
    expect([libelleChangement(2), libelleChangement(-1), libelleChangement(0)]).toEqual(["+2", "−1", "0"]);
    expect(languesParComptes({ it: 1, en: 3, es: 1 })).toEqual([["en", 3], ["es", 1], ["it", 1]]);
  });
});
