import { describe, expect, it } from "vitest";

import {
  ajouterJourCalendaire,
  ajouterRemarqueUtilisee,
  ajouterVideoReview,
  estCompteSlideshowAssigne,
  insererRemarqueDansBrouillon,
  isoBornesJourParis,
  jourParisDepuisIso,
  compterMemeTiktok,
  liensDesAutresPosts,
  normaliserRemarquesReview,
  normaliserVideosReview,
  retirerRemarqueUtilisee,
  retirerVideoReview,
} from "./fileJour";

describe("fileJour", () => {
  it("ajoute un jour calendaire", () => {
    expect(ajouterJourCalendaire("2026-09-09", 1)).toBe("2026-09-10");
    expect(ajouterJourCalendaire("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("borne un jour d'été Paris (CEST, UTC+2)", () => {
    const { debut, fin } = isoBornesJourParis("2026-09-09");
    expect(debut).toBe("2026-09-08T22:00:00.000Z");
    expect(fin).toBe("2026-09-09T22:00:00.000Z");
  });

  it("borne un jour d'hiver Paris (CET, UTC+1)", () => {
    const { debut, fin } = isoBornesJourParis("2026-01-15");
    expect(debut).toBe("2026-01-14T23:00:00.000Z");
    expect(fin).toBe("2026-01-15T23:00:00.000Z");
  });

  it("lit le jour Paris depuis un ISO", () => {
    expect(jourParisDepuisIso("2026-09-08T22:30:00.000Z")).toBe("2026-09-09");
    expect(jourParisDepuisIso("2026-09-08T21:30:00.000Z")).toBe("2026-09-08");
  });

  it("écarte CM et UGC vidéo", () => {
    expect(estCompteSlideshowAssigne({ type_compte: "perso", ugc_ai_video: false })).toBe(true);
    expect(estCompteSlideshowAssigne({ type_compte: "cm" })).toBe(false);
    expect(estCompteSlideshowAssigne({ ugc_ai_video: true })).toBe(false);
  });

  it("insère le corps d'une remarque dans le brouillon", () => {
    expect(insererRemarqueDansBrouillon("", "Hook trop lent.")).toBe("Hook trop lent.");
    expect(insererRemarqueDansBrouillon("  Bien.  ", "Raccourcis le texte.")).toBe(
      "Bien.\n\nRaccourcis le texte.",
    );
    expect(insererRemarqueDansBrouillon("ok", "  ")).toBe("ok");
  });

  it("empile les vidéos de remarques sans doublon, dans l'ordre", () => {
    const a = ajouterVideoReview([], { url: "https://cdn/a.mp4", titre: "Hook" });
    const b = ajouterVideoReview(a, { url: "https://cdn/b.mp4", titre: "Timing" });
    const encore = ajouterVideoReview(b, { url: "https://cdn/a.mp4", titre: "Hook" });
    expect(encore).toEqual([
      { url: "https://cdn/a.mp4", titre: "Hook" },
      { url: "https://cdn/b.mp4", titre: "Timing" },
    ]);
    expect(ajouterVideoReview([], { url: null, titre: "x" })).toEqual([]);
    expect(retirerVideoReview(encore, "https://cdn/a.mp4")).toEqual([
      { url: "https://cdn/b.mp4", titre: "Timing" },
    ]);
  });

  it("ne compte une remarque qu'une fois par review", () => {
    const a = ajouterRemarqueUtilisee([], { id: "r1", titre: " Hook trop lent " });
    const b = ajouterRemarqueUtilisee(a, { id: "r2", titre: "Timing" });
    const encore = ajouterRemarqueUtilisee(b, { id: "r1", titre: "Hook trop lent" });
    expect(encore).toEqual([
      { id: "r1", titre: "Hook trop lent" },
      { id: "r2", titre: "Timing" },
    ]);
    expect(ajouterRemarqueUtilisee([], { id: " ", titre: "x" })).toEqual([]);
    expect(retirerRemarqueUtilisee(encore, "r1")).toEqual([{ id: "r2", titre: "Timing" }]);
  });

  it("normalise le jsonb remarques d'une review", () => {
    expect(normaliserRemarquesReview(null)).toEqual([]);
    expect(
      normaliserRemarquesReview([
        { id: " r1 ", titre: " Texte illisible " },
        { id: "", titre: "sans id" },
        { id: "r1", titre: "doublon" },
      ]),
    ).toEqual([{ id: "r1", titre: "Texte illisible" }]);
  });

  it("normalise le jsonb videos d'une review", () => {
    expect(normaliserVideosReview(null)).toEqual([]);
    expect(
      normaliserVideosReview([
        { url: " https://cdn/a.mp4 ", titre: " Hook " },
        { url: "", titre: "vide" },
        { url: "https://cdn/a.mp4", titre: "dup" },
      ]),
    ).toEqual([{ url: "https://cdn/a.mp4", titre: "Hook" }]);
  });

  it("repère le même TikTok collé pour plusieurs posts, lien court résolu compris", () => {
    // asya.ogrenir761 le 15/10 : lien complet à 00:56, puis le même post en lien court deux fois.
    const complet = "https://www.tiktok.com/@asya.ogrenir761/photo/7696656855547825409";
    const court = "https://vt.tiktok.com/ZSgdFvsVU/";
    expect(
      compterMemeTiktok({ lien: court, id: "7696656855547825409" }, [
        { lien: complet, id: null },
        { lien: court, id: "7696656855547825409" },
        { lien: "https://www.tiktok.com/@asya.ogrenir761/photo/7696657695868275988", id: null },
      ]),
    ).toBe(2);
    // Lien court pas encore résolu : on compare au moins les liens identiques.
    expect(compterMemeTiktok({ lien: court, id: null }, [{ lien: "https://vt.tiktok.com/ZSgdFvsVU", id: null }])).toBe(1);
    expect(compterMemeTiktok({ lien: null, id: null }, [{ lien: court, id: null }])).toBe(0);
  });

  it("liste les liens des autres posts du même compte", () => {
    const liens = liensDesAutresPosts([
      { id: "a", compte_id: "c1", publie_url: "u1" },
      { id: "b", compte_id: "c1", publie_url: "u2" },
      { id: "c", compte_id: "c2", publie_url: "u3" },
      { id: "d", compte_id: "c1", publie_url: null },
    ]);
    expect(liens.get("a")).toEqual(["u2"]);
    expect(liens.get("c")).toEqual([]);
  });
});
