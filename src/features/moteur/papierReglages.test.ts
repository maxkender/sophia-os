import { describe, expect, it } from "vitest";

import {
  dureeCibleClipReglee,
  estErreurQuotaFal,
  erreurQuotaFal,
  normaliserReglagesPapier,
  peutReserverFal,
  REGLAGES_PAPIER_DEFAUT,
  usageFalDuJour,
  VOIX_DE_PAPIER,
  VOIX_ES_PAPIER,
  VOIX_NARRATION_PAPIER,
  VOIX_PETER,
  voixEffectiveMaster,
  voixPourLangue,
} from "./papierReglages";

describe("normaliserReglagesPapier", () => {
  it("applique les défauts", () => {
    expect(normaliserReglagesPapier(null)).toEqual(REGLAGES_PAPIER_DEFAUT);
  });

  it("borne durée et quota, accepte pause", () => {
    const r = normaliserReglagesPapier({
      actif: false,
      duree_cible_sec: 200,
      duree_clip: "6",
      voix: "Alice",
      voix_par_langue: { DE: "Lily", xx: "" },
      fal_quota_jour: -4,
    });
    expect(r.actif).toBe(false);
    expect(r.duree_cible_sec).toBe(90);
    expect(r.duree_clip).toBe(6);
    expect(r.voix).toBe("Alice");
    expect(r.voix_par_langue).toEqual({ de: "Lily" });
    expect(r.voix_favoris).toEqual([]);
    expect(r.topic_categorie).toBe("aleatoire");
    expect(r.narration_style).toBe("revelation");
    expect(r.pipeline_mode).toBe("auto");
    expect(r.fal_quota_jour).toBe(0);
  });

  it("garde les favoris et le mode manuel", () => {
    const r = normaliserReglagesPapier({
      voix_favoris: ["Alice", "", "x", "locuteur-cm", "inconnu", VOIX_PETER],
      pipeline_mode: "manuel",
      topic_categorie: "espace",
      narration_style: "question",
    });
    expect(r.voix_favoris).toEqual(["Alice", "locuteur-cm", "inconnu", VOIX_PETER]);
    expect(r.pipeline_mode).toBe("manuel");
    expect(r.topic_categorie).toBe("espace");
    expect(r.narration_style).toBe("question");
  });
});

describe("voix / durée clip", () => {
  it("prend la voix de la langue puis le défaut", () => {
    const r = normaliserReglagesPapier({
      voix: VOIX_PETER,
      voix_par_langue: { de: VOIX_DE_PAPIER },
    });
    expect(voixPourLangue(r, "de")).toBe(VOIX_DE_PAPIER);
    expect(voixPourLangue(r, "fr")).toBe(VOIX_PETER);
  });

  it("hors FR, pose la voix papier de la langue si pas de surcharge", () => {
    const r = normaliserReglagesPapier({ voix: VOIX_NARRATION_PAPIER });
    expect(voixPourLangue(r, "en")).toBe(VOIX_PETER);
    expect(voixPourLangue(r, "es")).toBe(VOIX_ES_PAPIER);
    expect(voixPourLangue(r, "de")).toBe(VOIX_DE_PAPIER);
    expect(voixPourLangue(r, "fr")).toBe(VOIX_NARRATION_PAPIER);
  });

  it("le master impose la voix FR ; DE garde sa surcharge", () => {
    const r = normaliserReglagesPapier({
      voix: VOIX_PETER,
      voix_par_langue: { de: VOIX_DE_PAPIER },
    });
    expect(voixEffectiveMaster("Alice", r, "fr")).toBe("Alice");
    expect(voixEffectiveMaster("Alice", r, "de")).toBe(VOIX_DE_PAPIER);
    expect(voixEffectiveMaster("Alice", r, "en")).toBe(VOIX_PETER);
    expect(voixEffectiveMaster(null, r, "fr")).toBe(VOIX_PETER);
  });

  it("force 4/6/8 ou calcule auto 4–15", () => {
    expect(dureeCibleClipReglee("mot ".repeat(22), 4)).toBe(4);
    expect(dureeCibleClipReglee("un deux", 8)).toBe(8);
    expect(dureeCibleClipReglee("un deux trois quatre cinq six sept huit", "auto")).toBe(4);
    expect(dureeCibleClipReglee("mot ".repeat(22), "auto")).toBe(9);
  });
});

describe("quota Fal", () => {
  it("remet le compteur à zéro un autre jour", () => {
    expect(usageFalDuJour({ date: "2026-08-19", appels: 40 }, "2026-08-20")).toBe(0);
    expect(usageFalDuJour({ date: "2026-08-20", appels: 12 }, "2026-08-20")).toBe(12);
  });

  it("0 = illimité, sinon plafond strict", () => {
    expect(peutReserverFal(999, 0, 10)).toBe(true);
    expect(peutReserverFal(299, 300, 1)).toBe(true);
    expect(peutReserverFal(300, 300, 1)).toBe(false);
  });

  it("marque l'erreur quota", () => {
    const e = erreurQuotaFal(300, 300);
    expect(estErreurQuotaFal(e)).toBe(true);
    expect(estErreurQuotaFal(new Error("boom"))).toBe(false);
  });
});
