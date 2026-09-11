import { describe, expect, it } from "vitest";

import {
  doitAttendreValidation,
  doitCreerMasterPapier,
  etapeActivePipeline,
  etapeApresValidation,
  etatEtapePipeline,
  holdPourCouperAuto,
  modeHoldPourMasterEnCours,
  pipelineEstArretee,
  tickPapierDoitEnchainer,
  corpsKickSuitePapier,
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
  it("connaît les catégories TikTok demandées", () => {
    expect(PAPIER_CATEGORIES).toHaveLength(22);
    expect(normaliserCategorie("psychologie")).toBe("psychologie");
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

describe("arrêt pipeline", () => {
  it("détecte un master arrêté", () => {
    expect(pipelineEstArretee({ statut: "stopped" })).toBe(true);
    expect(pipelineEstArretee({ annule: true, statut: "scripting" })).toBe(true);
    expect(pipelineEstArretee({ statut: "images" })).toBe(false);
  });

  it("ne recrée pas un original auto après un stop", () => {
    expect(
      doitCreerMasterPapier({ enCours: false, manuel: false, dernier: { statut: "stopped" } }),
    ).toBe(false);
    expect(
      doitCreerMasterPapier({ enCours: false, manuel: false, dernier: { annule: true } }),
    ).toBe(false);
    expect(
      doitCreerMasterPapier({ enCours: false, manuel: true, dernier: { statut: "stopped" } }),
    ).toBe(true);
    expect(doitCreerMasterPapier({ enCours: false, manuel: false, dernier: null })).toBe(true);
    expect(
      doitCreerMasterPapier({ enCours: false, manuel: false, dernier: { statut: "ready" } }),
    ).toBe(true);
    expect(doitCreerMasterPapier({ enCours: true, manuel: false })).toBe(false);
  });

  it("n'enchaîne plus un tick arrêté", () => {
    expect(tickPapierDoitEnchainer({ done: false, statut: "stopped" })).toBe(false);
    expect(tickPapierDoitEnchainer({ done: false, kick: false, statut: "images" })).toBe(false);
    expect(tickPapierDoitEnchainer({ idle: true, done: false, statut: "scripting" })).toBe(false);
    expect(tickPapierDoitEnchainer({ done: false, statut: "images" })).toBe(true);
    expect(tickPapierDoitEnchainer({ done: true, statut: "clips" })).toBe(false);
  });

  it("reprend un master en pause avec manuel=true", () => {
    expect(corpsKickSuitePapier({ masterId: "m1" })).toEqual({
      action: "tick",
      masterId: "m1",
      manuel: true,
    });
    expect(corpsKickSuitePapier({ masterId: "m1", langueId: "l1" })).toEqual({
      action: "tick_locales",
      masterId: "m1",
      langueId: "l1",
      manuel: true,
    });
    expect(corpsKickSuitePapier({ masterId: "m1", action: "tick_locales" })).toEqual({
      action: "tick_locales",
      masterId: "m1",
      manuel: true,
    });
  });

  it("coupe l'auto en posant un hold manuel", () => {
    expect(holdPourCouperAuto({ statut: "queued" })).toBe("topic");
    expect(holdPourCouperAuto({ statut: "scripting", etape: "script" })).toBe("script");
    expect(holdPourCouperAuto({ statut: "images" })).toBe("images");
    expect(holdPourCouperAuto({ statut: "clips" })).toBe("images");
    expect(holdPourCouperAuto({ statut: "scripting", hold: "topic" })).toBe("topic");
  });
});

describe("mode demandé sur un master en cours", () => {
  it("n'interrompt pas images/clips : pose le mode, pas de hold prématuré", () => {
    expect(
      modeHoldPourMasterEnCours({
        actuelMode: "auto",
        demandeMode: "manuel",
        statut: "images",
        aTopic: true,
        aScript: true,
      }),
    ).toEqual({ pipeline_mode: "manuel", pipeline_hold: null });
    expect(
      modeHoldPourMasterEnCours({
        actuelMode: "auto",
        demandeMode: "manuel",
        statut: "clips",
        aTopic: true,
        aScript: true,
      }),
    ).toEqual({ pipeline_mode: "manuel", pipeline_hold: null });
  });

  it("hold sujet si le topic est là, hold script si le script est là", () => {
    expect(
      modeHoldPourMasterEnCours({
        actuelMode: "auto",
        demandeMode: "manuel",
        statut: "scripting",
        aTopic: true,
        aScript: false,
      }),
    ).toEqual({ pipeline_mode: "manuel", pipeline_hold: "topic" });
    expect(
      modeHoldPourMasterEnCours({
        actuelMode: "auto",
        demandeMode: "manuel",
        statut: "scripting",
        aTopic: true,
        aScript: true,
      }),
    ).toEqual({ pipeline_mode: "manuel", pipeline_hold: "script" });
  });

  it("repasse en auto sans hold", () => {
    expect(
      modeHoldPourMasterEnCours({
        actuelMode: "manuel",
        demandeMode: "auto",
        statut: "scripting",
        hold: "script",
        aTopic: true,
        aScript: true,
      }),
    ).toEqual({ pipeline_mode: "auto", pipeline_hold: null });
  });

  it("ne touche à rien si le mode demandé est déjà en place", () => {
    expect(
      modeHoldPourMasterEnCours({
        actuelMode: "auto",
        demandeMode: "auto",
        statut: "images",
      }),
    ).toBeNull();
  });
});
