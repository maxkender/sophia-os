import { describe, expect, it } from "vitest";

import {
  accrochePost,
  avancementKit,
  avecSlideEcrite,
  etatPostKit,
  postsDuKit,
  slidesKitDepuisContenu,
  texteEcrit,
  toutesSlidesEcrites,
} from "./kit";

const posts = [4, 1, 3, 2].map((rang) => ({ id: `k${rang}`, rang, actif: rang !== 2 }));

describe("postsDuKit", () => {
  it("tout le kit, dans l'ordre, sauf les posts retirés", () => {
    expect(postsDuKit(posts).map((p) => p.rang)).toEqual([1, 3, 4]);
  });
});

describe("etatPostKit et avancementKit", () => {
  it("à faire, en cours, rendu", () => {
    expect(etatPostKit(undefined)).toBe("a_faire");
    expect(etatPostKit({ slides: [{ position: 1, texte: "  " }], rendu_at: null })).toBe("a_faire");
    expect(etatPostKit({ slides: [{ position: 1, texte: "Hallo" }], rendu_at: null })).toBe("en_cours");
    expect(etatPostKit({ slides: [], rendu_at: "2026-10-27T10:00:00Z" })).toBe("rendu");
  });

  it("ne compte que les posts rendus parmi ceux du relecteur", () => {
    const ecritures = [
      { kit_id: "k1", rendu_at: "2026-10-27T10:00:00Z" },
      { kit_id: "k3", rendu_at: null },
      { kit_id: "k4", rendu_at: "2026-10-27T10:00:00Z" },
    ];
    expect(avancementKit([{ id: "k1" }, { id: "k3" }], ecritures)).toEqual({ rendus: 1, total: 2 });
  });
});

describe("slides écrites", () => {
  it("remplace le texte d'une slide et garde l'ordre", () => {
    const slides = avecSlideEcrite([{ position: 2, texte: "b" }], 1, "a");
    expect(slides).toEqual([
      { position: 1, texte: "a" },
      { position: 2, texte: "b" },
    ]);
    expect(texteEcrit(avecSlideEcrite(slides, 2, "B"), 2)).toBe("B");
    expect(texteEcrit(slides, 3)).toBe("");
  });

  it("le post est prêt quand chaque slide anglaise a sa version", () => {
    const en = [{ position: 1 }, { position: 2 }];
    expect(toutesSlidesEcrites(en, [{ position: 1, texte: "a" }])).toBe(false);
    expect(toutesSlidesEcrites(en, [{ position: 1, texte: "a" }, { position: 2, texte: " " }])).toBe(false);
    expect(toutesSlidesEcrites(en, [{ position: 1, texte: "a" }, { position: 2, texte: "b" }])).toBe(true);
    expect(toutesSlidesEcrites([], [])).toBe(false);
  });
});

describe("slidesKitDepuisContenu", () => {
  it("prend le texte d'origine quand il existe, et l'image de la même position", () => {
    const slides = slidesKitDepuisContenu(
      {
        slides: [{ position: 1, texte_overlay: "placed by Gemini" }],
        slides_base: [
          { position: 2, texte_overlay: "two" },
          { position: 1, texte_overlay: "one" },
        ],
      },
      [
        { position: 2, reference_url: "https://x/2.jpg" },
        { position: 1, raw_url: "https://x/1.jpg", reference_url: "https://x/1b.jpg" },
      ],
    );
    expect(slides).toEqual([
      { position: 1, texte: "one", image_url: "https://x/1.jpg" },
      { position: 2, texte: "two", image_url: "https://x/2.jpg" },
    ]);
  });

  it("retombe sur les slides quand il n'y a pas de texte d'origine", () => {
    expect(
      slidesKitDepuisContenu({ slides: [{ position: 1, texte_overlay: null }], slides_base: [] }, null),
    ).toEqual([{ position: 1, texte: "", image_url: null }]);
    expect(slidesKitDepuisContenu(null, null)).toEqual([]);
  });

  it("l'accroche est la première slide, sur une ligne", () => {
    expect(accrochePost({ slides_en: [{ position: 2, texte: "b", image_url: null }, { position: 1, texte: "6 hobbies\nthat", image_url: null }] })).toBe(
      "6 hobbies that",
    );
  });
});
