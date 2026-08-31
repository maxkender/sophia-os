import { describe, expect, it } from "vitest";

import {
  dureeCibleClipReglee,
  estErreurQuotaFal,
  erreurQuotaFal,
  normaliserReglagesPapier,
  peutReserverFal,
  REGLAGES_PAPIER_DEFAUT,
  usageFalDuJour,
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
      voix_favoris: ["Alice", "inconnu", "George"],
      pipeline_mode: "manuel",
      topic_categorie: "espace",
      narration_style: "question",
    });
    expect(r.voix_favoris).toEqual(["Alice", "George"]);
    expect(r.pipeline_mode).toBe("manuel");
    expect(r.topic_categorie).toBe("espace");
    expect(r.narration_style).toBe("question");
  });
});

describe("voix / durée clip", () => {
  it("prend la voix de la langue puis le défaut", () => {
    const r = normaliserReglagesPapier({
      voix: "George",
      voix_par_langue: { de: "Lily" },
    });
    expect(voixPourLangue(r, "de")).toBe("Lily");
    expect(voixPourLangue(r, "fr")).toBe("George");
  });

  it("le master impose la voix FR ; DE garde sa surcharge", () => {
    const r = normaliserReglagesPapier({
      voix: "George",
      voix_par_langue: { de: "Lily" },
    });
    expect(voixEffectiveMaster("Alice", r, "fr")).toBe("Alice");
    expect(voixEffectiveMaster("Alice", r, "de")).toBe("Lily");
    expect(voixEffectiveMaster("Alice", r, "en")).toBe("Alice");
    expect(voixEffectiveMaster(null, r, "fr")).toBe("George");
  });

  it("force 4/6/8 ou reste en auto", () => {
    expect(dureeCibleClipReglee("mot ".repeat(22), 4)).toBe(4);
    expect(dureeCibleClipReglee("un deux", 8)).toBe(8);
    expect(dureeCibleClipReglee("un deux trois quatre cinq six sept huit", "auto")).toBe(4);
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
