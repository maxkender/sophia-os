import { describe, expect, it } from "vitest";

import {
  doitAttendreValidation,
  etapeActivePipeline,
  etapeApresValidation,
  etatEtapePipeline,
} from "./papierPipeline";
import { PAPIER_CATEGORIES, normaliserCategorie } from "./papierSujets";
import { budgetScript } from "./papierScript";
import { labelVoixPapier, VOIX_PAPIER, voixOrdonnees } from "./papierReglages";

describe("pipeline papier", () => {
  it("attend une validation seulement en mode manuel avec hold", () => {
    expect(doitAttendreValidation({ mode: "auto", hold: "topic" })).toBe(false);
    expect(doitAttendreValidation({ mode: "manuel", hold: null })).toBe(false);
    expect(doitAttendreValidation({ mode: "manuel", hold: "script" })).toBe(true);
    expect(doitAttendreValidation({ mode: "manuel", hold: "images" })).toBe(true);
  });

  it("marque hold sur le sujet puis le script", () => {
    expect(
      etapeActivePipeline({ statut: "scripting", etape: "topic", hold: "topic" }),
    ).toBe("topic");
    expect(
      etatEtapePipeline("topic", { active: "topic", statut: "scripting", hold: "topic" }),
    ).toBe("hold");
    expect(
      etatEtapePipeline("script", { active: "topic", statut: "scripting", hold: "topic" }),
    ).toBe("pending");
  });

  it("hold images après les photos, avant les clips", () => {
    expect(
      etapeActivePipeline({ statut: "images", hold: "images" }),
    ).toBe("images");
    expect(
      etatEtapePipeline("images", { active: "images", statut: "images", hold: "images" }),
    ).toBe("hold");
    expect(etapeApresValidation("topic")).toEqual({ statut: "scripting", etape: "script" });
    expect(etapeApresValidation("script")).toEqual({ statut: "images", etape: "images" });
    expect(etapeApresValidation("images")).toEqual({ statut: "clips", etape: "clips" });
  });

  it("une vidéo prête complète toute la pipeline", () => {
    expect(etapeActivePipeline({ statut: "ready", videoUrl: "https://v" })).toBe("karaoke");
    expect(etatEtapePipeline("images", { active: "karaoke", statut: "ready" })).toBe("done");
  });
});

describe("sujets / durée / voix", () => {
  it("connaît les 12 catégories demandées", () => {
    expect(PAPIER_CATEGORIES).toHaveLength(12);
    expect(normaliserCategorie("mysteres")).toBe("mysteres");
    expect(normaliserCategorie("xx")).toBe("aleatoire");
  });

  it("plus de durée = plus de plans", () => {
    expect(budgetScript(24).sceneCount).toBeLessThan(budgetScript(72).sceneCount);
  });

  it("offre plus de voix et met les favoris en tête", () => {
    expect(VOIX_PAPIER.length).toBeGreaterThan(20);
    expect(voixOrdonnees(["Alice", "Rachel"])[0]).toBe("Alice");
    expect(labelVoixPapier("Alice")).toContain("FR");
  });
});
