import { describe, expect, it } from "vitest";

import {
  dureeDepuisTimings,
  estLanguePapier,
  etapeAssemblage,
  finaliserTraductionPapier,
  LANGUES_PAPIER,
  langueFrAContinuer,
  mixEstIntermediaire,
  mixEstSurCanvasTikTok,
  nomLangueModele,
  normaliserTimestampsFal,
  prochaineLangueATiquer,
  statutDepuisLocaleAssets,
  urlVideoExportable,
  wordTimingsEstimes,
  grouperMotsEnCartons,
  sousTitresDepuisScenes,
  langueDoitRelancerAuto,
  langueCaptionsEnCours,
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

  it("aligne les cartons karaoke sur le concat des plans", () => {
    const cartons = sousTitresDepuisScenes([
      {
        index: 0,
        narration: "un deux",
        words: [
          { word: "un", start: 0.1, end: 0.4 },
          { word: "deux", start: 0.4, end: 0.9 },
        ],
        duree_sec: 1,
      },
      {
        index: 1,
        narration: "trois",
        words: [{ word: "trois", start: 0.05, end: 0.5 }],
        duree_sec: 0.8,
      },
    ]);
    expect(cartons).toEqual([
      { start: 0.1, end: 0.4, text: "un" },
      { start: 0.4, end: 0.9, text: "deux" },
      { start: 1.05, end: 1.5, text: "trois" },
    ]);
    expect(
      grouperMotsEnCartons(
        [
          { word: "un", start: 0.1, end: 0.4 },
          { word: "deux", start: 0.4, end: 0.9 },
        ],
        2,
      ),
    ).toEqual([{ start: 0.1, end: 0.9, text: "un deux" }]);
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
        video_mix_path: "papiers/x/fr/mix-raw.mp4",
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

describe("assemblage", () => {
  it("découpe concat → pad → cadre → karaoke, sans exporter le brut", () => {
    expect(etapeAssemblage({})).toBe("merge");
    expect(
      etapeAssemblage({
        video_mix_url: "part",
        video_mix_path: "papiers/x/fr/mix-part.mp4",
      }),
    ).toBe("merge");
    expect(
      etapeAssemblage({
        video_mix_url: "raw",
        video_mix_path: "papiers/x/fr/mix-raw.mp4",
        etape: "cadre",
      }),
    ).toBe("pad");
    expect(
      etapeAssemblage({
        video_mix_url: "pad",
        video_mix_path: "papiers/x/fr/mix-pad.mp4",
        etape: "cadre",
      }),
    ).toBe("cadre");
    expect(
      etapeAssemblage({
        video_mix_url: "mix",
        video_mix_path: "papiers/x/fr/mix.mp4",
      }),
    ).toBe("karaoke");
    expect(etapeAssemblage({ video_url: "final" })).toBe("ready");
    expect(urlVideoExportable({ video_mix_url: "raw", video_mix_path: "x/mix-raw.mp4" })).toBeNull();
    expect(urlVideoExportable({ video_mix_url: "pad", video_mix_path: "x/mix-pad.mp4", etape: "cadre" })).toBeNull();
    expect(urlVideoExportable({ video_mix_url: "mix", video_mix_path: "x/mix.mp4" })).toBe("mix");
    expect(urlVideoExportable({ video_url: "final", video_mix_url: "mix" })).toBe("final");
    expect(mixEstIntermediaire("x/mix-pad.mp4", "cadre")).toBe(true);
    expect(mixEstSurCanvasTikTok("papiers/x/fr/mix-pad.mp4")).toBe(true);
    expect(mixEstSurCanvasTikTok("papiers/x/fr/mix.mp4")).toBe(true);
    expect(mixEstSurCanvasTikTok("papiers/x/fr/mix-raw.mp4")).toBe(false);
  });

  it("n'auto-relance jamais une langue (évite la boucle Fal)", () => {
    const now = Date.parse("2026-09-11T21:00:00Z");
    expect(
      langueDoitRelancerAuto(
        { statut: "karaoke", busy: true, updated_at: "2026-09-11T20:50:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      langueDoitRelancerAuto(
        { statut: "render", busy: false, updated_at: "2026-09-11T20:58:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      langueDoitRelancerAuto(
        { statut: "karaoke", busy: false, updated_at: "2026-09-11T20:55:00Z" },
        now,
      ),
    ).toBe(false);
  });

  it("détecte un FR à continuer jusqu'aux captions", () => {
    expect(langueFrAContinuer([{ id: "fr", langue: "fr", statut: "ready" }])).toBeNull();
    expect(langueFrAContinuer([{ id: "fr", langue: "fr", statut: "karaoke" }])).toEqual({
      id: "fr",
      statut: "karaoke",
    });
  });

  it("bloque Continue tant que le tick captions est busy", () => {
    expect(langueCaptionsEnCours({ statut: "render", busy: true })).toBe(true);
    expect(langueCaptionsEnCours({ statut: "karaoke", busy: false })).toBe(false);
    expect(langueCaptionsEnCours({ statut: "ready", busy: true })).toBe(false);
  });
});
