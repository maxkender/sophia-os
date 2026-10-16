import { describe, expect, it } from "vitest";

import {
  libelleDefaut,
  normaliserRelecture,
  repartirDefauts,
  estBrouillonIntact,
  slidesEnFrancais,
  videosDuBrouillon,
  type DefautRelecture,
} from "./relectureAgent";

const defaut = (code: string, niveau: "remarque" | "info" = "remarque"): DefautRelecture => ({
  code,
  niveau,
  slides: [1],
  detail: code,
});

describe("relectureAgent", () => {
  it("lit une ligne de relectures_auto, même incomplète", () => {
    const r = normaliserRelecture({
      post_id: "p1",
      statut: "fait",
      defauts: [
        { code: "justification", niveau: "remarque", slides: [5, 6], detail: "lignes trop courtes" },
        { code: "police", niveau: "info", slides: [1], detail: "police" },
        { pas: "de code" },
      ],
      brouillon: "  Great job!  ",
      remarques: [{ id: "j", titre: "Jutifier" }],
      erreur: null,
    });
    expect(r?.defauts.map((d) => d.code)).toEqual(["justification", "police"]);
    expect(r?.brouillon).toBe("Great job!");
    expect(r?.remarques).toEqual([{ id: "j", titre: "Jutifier" }]);
    expect(normaliserRelecture({ post_id: "p1", statut: "inconnu" })).toBeNull();
    expect(normaliserRelecture({ post_id: "p1", statut: "fait", brouillon: " " })?.brouillon).toBeNull();
  });

  it("deux points dans la review, le reste plus tard, les infos à part", () => {
    const { review, plusTard, notes } = repartirDefauts([
      defaut("justification"),
      defaut("alignement"),
      defaut("couleur"),
      defaut("police", "info"),
    ]);
    expect(review.map((d) => d.code)).toEqual(["justification", "alignement"]);
    expect(plusTard.map((d) => d.code)).toEqual(["couleur"]);
    expect(notes.map((d) => d.code)).toEqual(["police"]);
  });

  it("écrit les slides et le constat en français", () => {
    expect(slidesEnFrancais([1])).toBe("slide 1");
    expect(slidesEnFrancais([1, 3, 4])).toBe("slides 1, 3 et 4");
    expect(slidesEnFrancais([])).toBe("");
    expect(
      libelleDefaut({ code: "justification", niveau: "remarque", slides: [5, 6], detail: "lignes trop courtes" }),
    ).toBe("Lignes trop courtes (slides 5 et 6)");
  });

  it("joint les vidéos tuto des remarques-types du brouillon, sans doublon", () => {
    const types = [
      { id: "j", titre: "Justify", video_url: "https://v/j.mp4" },
      { id: "s", titre: "Style", video_url: null },
      { id: "h", titre: "Hello", video_url: "https://v/j.mp4" },
    ];
    expect(
      videosDuBrouillon(
        [
          { id: "h", titre: "Hello" },
          { id: "j", titre: "Justify" },
          { id: "s", titre: "Style" },
          { id: "x", titre: "Supprimée" },
        ],
        types,
      ),
    ).toEqual([{ url: "https://v/j.mp4", titre: "Hello" }]);
  });

  it("reconnaît un brouillon de l'agent envoyé sans retouche", () => {
    expect(estBrouillonIntact("  Hi!\nFix it.  ", "Hi!\nFix it.")).toBe(true);
    expect(estBrouillonIntact("Hi! Fix it please.", "Hi!\nFix it.")).toBe(false);
    expect(estBrouillonIntact("", null)).toBe(false);
    expect(estBrouillonIntact("Hi", undefined)).toBe(false);
  });
});
