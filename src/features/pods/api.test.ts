import { describe, expect, it } from "vitest";

import {
  autonomieMin,
  echeanceAutoValidation,
  nomApplication,
  parPod,
  partSurPeriode,
  variantesDeck,
  type AutonomiePod,
  type Livraison,
} from "./api";

const liv = (id: string, pod: string) => ({ id, pod }) as Livraison;

describe("parPod", () => {
  it("groupe par pod, dans l'ordre des pods connus, inconnus à la fin", () => {
    const g = parPod([{ slug: "page_blanche" }, { slug: "originaux" }], [liv("1", "inconnu"), liv("2", "page_blanche"), liv("3", "page_blanche")]);
    expect([...g.keys()]).toEqual(["page_blanche", "originaux", "inconnu"]);
    expect(g.get("page_blanche")!.map((l) => l.id)).toEqual(["2", "3"]);
    expect(g.get("originaux")).toEqual([]);
  });
});

describe("variantesDeck", () => {
  const slide = (position: number, position_sophia = false) => ({ position, media_id: `m${position}`, url: `u${position}`, position_sophia });
  it("deck Sophia seul : une seule version, Sophia", () => {
    const l = { decks: { fr: { hashtags: "#a", slides: [slide(1), slide(2, true)] } } } as unknown as Livraison;
    expect(variantesDeck(l, "fr").map((v) => v.cle)).toEqual(["sophia"]);
  });
  it("Sophia + variante UnSwipe : les deux, Sophia d'abord", () => {
    const l = {
      decks: { fr: { hashtags: "#a", slides: [slide(1), slide(2, true)] } },
      decks_applications: { unswipe: { fr: { slides: [slide(1), slide(2, true)] } } },
    } as unknown as Livraison;
    expect(variantesDeck(l, "fr").map((v) => [v.cle, v.hashtags])).toEqual([["sophia", "#a"], ["unswipe", "#a"]]);
  });
  it("label hors Sophia (pod 6) : seulement la version de l'application", () => {
    const l = {
      decks: { en: { hashtags: "#b", slides: [slide(1), slide(2)] } },
      decks_applications: { unswipe: { en: { hashtags: "#u", slides: [slide(1), slide(2, true)] } } },
    } as unknown as Livraison;
    const v = variantesDeck(l, "en");
    expect(v.map((x) => x.cle)).toEqual(["unswipe"]);
    expect(v[0].hashtags).toBe("#u");
    expect(v[0].slides[1].position_sophia).toBe(true);
    // Une langue absente : rien à montrer.
    expect(variantesDeck(l, "de")).toEqual([]);
  });
  it("nomApplication : nom connu, sinon le slug", () => {
    expect(nomApplication("unswipe")).toBe("UnSwipe");
    expect(nomApplication("autre")).toBe("autre");
  });
});

describe("echeanceAutoValidation", () => {
  it("dépôt + délai du podz", () => {
    expect(echeanceAutoValidation("2026-10-21T06:30:00.000Z", 12)?.toISOString()).toBe("2026-10-21T18:30:00.000Z");
  });
  it("sans date de dépôt ou sans délai : pas d'échéance", () => {
    expect(echeanceAutoValidation(null, 12)).toBeNull();
    expect(echeanceAutoValidation("pas une date", 12)).toBeNull();
    expect(echeanceAutoValidation("2026-10-21T06:30:00.000Z", 0)).toBeNull();
  });
});

describe("partSurPeriode", () => {
  it("posts des podz sur posts publiés, au dixième", () => {
    expect(partSurPeriode([{ publies: 300, publies_pods: 24 }, { publies: 442, publies_pods: 40 }])).toBe(8.6);
  });
  it("rien de publié : pas de part", () => {
    expect(partSurPeriode([])).toBeNull();
    expect(partSurPeriode([{ publies: 0, publies_pods: 0 }])).toBeNull();
  });
});

describe("autonomieMin", () => {
  const a = (application: string, jours: number | null): AutonomiePod => ({
    application,
    a_publier: 10,
    par_jour: 1,
    jours,
    reserve_label_jours: null,
  });
  it("l'application la plus courte, en ignorant celles sans rythme", () => {
    expect(autonomieMin([a("sophia", 9.8), a("unswipe", 3.4), a("micabo", null)])?.application).toBe("unswipe");
  });
  it("rien de mesuré : null", () => {
    expect(autonomieMin([])).toBeNull();
    expect(autonomieMin([a("sophia", null)])).toBeNull();
  });
});
