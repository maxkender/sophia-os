import { describe, expect, it } from "vitest";

import { cleErreurSignalement, slideEstLivree, slideEstPropre } from "./signalementTexte";

function slide(storage_path: string | null, texte_restant = false) {
  return {
    media_library: storage_path
      ? { url: "u", storage_path, upscale_le: null, texte_restant }
      : null,
  };
}

describe("slideEstPropre", () => {
  it("accepte une photo nettoyée et non signalée", () => {
    expect(slideEstPropre(slide("propre/c/1.jpg"))).toBe(true);
  });

  it("refuse une photo nettoyée mais signalée encore écrite", () => {
    expect(slideEstPropre(slide("propre/c/1.jpg", true))).toBe(false);
  });

  it("accepte l'image finie d'un pod, même marquée texte_restant", () => {
    expect(slideEstPropre(slide("pods/page_blanche/123/en/1.jpg", true))).toBe(true);
    expect(slideEstLivree(slide("pods/page_blanche/123/en/1.jpg", true))).toBe(true);
    expect(slideEstLivree(slide("propre/c/1.jpg"))).toBe(false);
  });

  it("refuse un brut et une slide sans photo", () => {
    expect(slideEstPropre(slide("brut/c/1"))).toBe(false);
    expect(slideEstPropre(slide(null))).toBe(false);
  });
});

describe("cleErreurSignalement", () => {
  it("traduit les refus du serveur", () => {
    expect(cleErreurSignalement("POST_PUBLIE")).toBe("posts.signalerPublie");
    expect(cleErreurSignalement("SANS_PHOTO")).toBe("posts.signalerSansPhoto");
    expect(cleErreurSignalement("IMAGE_LIVREE")).toBe("posts.signalerLivree");
    expect(cleErreurSignalement("INTERDIT")).toBe("posts.signalerInterdit");
    expect(cleErreurSignalement("forbidden")).toBe("posts.signalerInterdit");
    expect(cleErreurSignalement("Failed to fetch")).toBe("posts.signalerErreur");
  });
});
