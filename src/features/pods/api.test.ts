import { describe, expect, it } from "vitest";

import { nomApplication, parPod, variantesDeck, type Livraison } from "./api";

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
