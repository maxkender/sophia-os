import { describe, expect, it } from "vitest";

import { referenceAffichee } from "./referencePlacement";

const slides = [
  { position: 1, reference_url: "r1" },
  { position: 2, reference_url: "r2" },
  { position: 3, reference_url: "apify-3" },
  { position: 4, reference_url: "r4" },
  { position: 5, reference_url: null },
  { position: 6, reference_url: "apify-6" },
];

describe("referenceAffichee", () => {
  it("montre l'original de la slide quand il s'affiche", () => {
    expect(referenceAffichee(slides, 0, new Set())).toEqual({ url: "r1", autrePosition: null });
  });

  it("emprunte l'original de la slide voisine qui s'affiche quand le sien est cassé", () => {
    const echouees = new Set(["apify-3", "apify-6"]);
    expect(referenceAffichee(slides, 2, echouees)).toEqual({ url: "r2", autrePosition: 2 });
    expect(referenceAffichee(slides, 5, echouees)).toEqual({ url: "r4", autrePosition: 4 });
  });

  it("passe à la suivante si la voisine casse aussi, et rend null quand plus rien ne s'affiche", () => {
    expect(referenceAffichee(slides, 2, new Set(["apify-3", "r2"]))).toEqual({ url: "r4", autrePosition: 4 });
    expect(referenceAffichee(slides, 2, new Set(["apify-3", "r1", "r2", "r4", "apify-6"]))).toBeNull();
  });

  it("une slide sans original n'en reçoit pas d'emprunté", () => {
    expect(referenceAffichee(slides, 4, new Set())).toBeNull();
  });
});
