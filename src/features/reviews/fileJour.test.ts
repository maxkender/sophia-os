import { describe, expect, it } from "vitest";

import {
  ajouterJourCalendaire,
  estCompteSlideshowAssigne,
  insererRemarqueDansBrouillon,
  isoBornesJourParis,
  jourParisDepuisIso,
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
});
