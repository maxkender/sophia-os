import { describe, expect, it } from "vitest";

import {
  dureeDepuisTimings,
  estLanguePapier,
  finaliserTraductionPapier,
  LANGUES_PAPIER,
  nomLangueModele,
  normaliserTimestampsFal,
  prochaineLangueATiquer,
  statutDepuisLocaleAssets,
  wordTimingsEstimes,
} from "./papierLocales";

describe("langues papier", () => {
  it("couvre les 14 langues OS", () => {
    expect(LANGUES_PAPIER).toHaveLength(14);
    expect(estLanguePapier("fr")).toBe(true);
    expect(estLanguePapier("xx")).toBe(false);
    expect(nomLangueModele("de")).toContain("allemand");
  });

  it("pique le FR d'abord, puis les autres langues en cours", () => {
    expect(
      prochaineLangueATiquer([
        { id: "en", langue: "en", statut: "voice" },
        { id: "fr", langue: "fr", statut: "queued" },
      ]),
    ).toBe("fr");
    expect(
      prochaineLangueATiquer([
        { id: "fr", langue: "fr", statut: "ready" },
        { id: "es", langue: "es", statut: "translating" },
      ]),
    ).toBe("es");
    expect(
      prochaineLangueATiquer([
        { id: "fr", langue: "fr", statut: "ready" },
        { id: "es", langue: "es", statut: "ready" },
      ]),
    ).toBeNull();
  });
});

describe("timings", () => {
  it("estime un timing par mot sur la durée", () => {
    const w = wordTimingsEstimes("un deux trois", 3);
    expect(w).toHaveLength(3);
    expect(w[0]!.start).toBeGreaterThanOrEqual(0);
    expect(w[2]!.end).toBeLessThanOrEqual(3);
  });

  it("lit les timestamps Fal {word,start,end}", () => {
    const w = normaliserTimestampsFal(
      [{ word: "Hello", start: 0.1, end: 0.4 }],
      "Hello",
      1,
    );
    expect(w).toEqual([{ word: "Hello", start: 0.1, end: 0.4 }]);
  });

  it("replie sur l'estimation si Fal renvoie rien", () => {
    const w = normaliserTimestampsFal(null, "un deux", 2);
    expect(w.length).toBe(2);
  });

  it("prend la fin du dernier mot + marge", () => {
    expect(
      dureeDepuisTimings(
        [
          { word: "a", start: 0, end: 0.4 },
          { word: "b", start: 0.4, end: 1.2 },
        ],
        0.5,
      ),
    ).toBeCloseTo(1.35, 5);
  });
});

describe("traduction CTA", () => {
  it("retire Sophia des scènes et n'en garde qu'une dans le CTA", () => {
    const t = finaliserTraductionPapier(
      {
        title: "T",
        hook: "H",
        cta: "Download Sophia now then open Sophia today",
        hashtags: ["learn", "#fyp", "x", "y"],
        scenes: [
          { index: 0, narration: "Hook Sophia", overlay: "H" },
          { index: 1, narration: "Fact", overlay: "F" },
          { index: 2, narration: "old cta", overlay: "C" },
        ],
      },
      3,
    );
    expect(t.scenes[0]?.narration).toBe("Hook l'appli");
    expect(t.scenes[2]?.narration).toMatch(/Sophia/);
    expect((t.cta.match(/\bSophia\b/gi) ?? []).length).toBe(1);
    expect(t.hashtags).toEqual(["#learn", "#fyp", "#x"]);
  });
});

describe("statut locale", () => {
  it("enchaîne translating → voice → mix → render → karaoke → ready", () => {
    expect(statutDepuisLocaleAssets({})).toBe("translating");
    expect(
      statutDepuisLocaleAssets({
        script: {},
        scenes: [{}, {}],
      }),
    ).toBe("voice");
    expect(
      statutDepuisLocaleAssets({
        script: {},
        scenes: [{ audio_url: "a" }, { audio_url: "b" }],
      }),
    ).toBe("mix");
    expect(
      statutDepuisLocaleAssets({
        script: {},
        scenes: [
          { audio_url: "a", mix_url: "m" },
          { audio_url: "b", mix_url: "n" },
        ],
      }),
    ).toBe("render");
    expect(
      statutDepuisLocaleAssets({
        script: {},
        scenes: [{ audio_url: "a", mix_url: "m" }],
        video_mix_url: "v",
      }),
    ).toBe("karaoke");
    expect(statutDepuisLocaleAssets({ video_url: "ok" })).toBe("ready");
  });
});
