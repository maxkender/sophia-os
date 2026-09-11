import { describe, expect, it } from "vitest";

import { VOIX_NARRATION_PAPIER, VOIX_NOVA, VOIX_PAPIER_CATALOGUE } from "./papierReglages";
import {
  estIdentifiantVoix,
  estLocuteurCm,
  estVoixLegacyDefaut,
  filtrerVoixParLangue,
  fusionnerCatalogueVoix,
  motsDepuisAlignement,
  NOM_LOCUTEUR_CM,
  resoudreVoix,
  voixDefautDepuisListe,
  voixOrdonneesEleven,
  type VoixEleven,
} from "./papierVoix";

const cm: VoixEleven = {
  id: "abcCM123",
  name: "locuteur-cm",
  languages: [],
  previewUrl: "https://example.com/cm.mp3",
  category: "cloned",
  gender: null,
  accent: null,
  source: "library",
  custom: true,
};

const alice: VoixEleven = {
  id: "alice1",
  name: "Alice",
  languages: ["fr"],
  previewUrl: null,
  category: "premade",
  gender: "female",
  accent: "standard",
  source: "library",
  custom: false,
};

const george: VoixEleven = {
  id: "george1",
  name: "George",
  languages: ["en"],
  previewUrl: null,
  category: "premade",
  gender: "male",
  accent: "british",
  source: "shared",
  custom: false,
};

describe("voix ElevenLabs", () => {
  it("reconnaît locuteur-cm et le filtre encore en FR", () => {
    expect(estLocuteurCm(cm)).toBe(true);
    expect(NOM_LOCUTEUR_CM).toBe("locuteur-cm");
    const fr = filtrerVoixParLangue([george, alice, cm], "fr");
    expect(fr.some((v) => v.name === "locuteur-cm")).toBe(true);
    expect(fr.some((v) => v.name === "Alice")).toBe(true);
    expect(fr.some((v) => v.name === "George")).toBe(false);
  });

  it("résout par nom ou id et préfère le pin papier comme défaut", () => {
    const liste = [george, alice, cm];
    expect(resoudreVoix("locuteur-cm", liste)?.id).toBe("abcCM123");
    expect(resoudreVoix("abcCM123", liste)?.name).toBe("locuteur-cm");
    expect(voixDefautDepuisListe(liste, "fr")).toBe("abcCM123");
    const fusion = fusionnerCatalogueVoix(liste, VOIX_PAPIER_CATALOGUE, "fr");
    expect(voixDefautDepuisListe(fusion, "fr", [VOIX_NARRATION_PAPIER, VOIX_NOVA])).toBe(
      VOIX_NARRATION_PAPIER,
    );
  });

  it("accepte un voice_id libre (plus le catalogue Fal figé)", () => {
    expect(estIdentifiantVoix("locuteur-cm")).toBe(true);
    expect(estIdentifiantVoix("JBFqnCBsd6RMkjVDRZzb")).toBe(true);
    expect(estIdentifiantVoix("")).toBe(false);
  });

  it("traite locuteur-cm / George comme anciens défauts et pinne Nova + narration", () => {
    expect(estVoixLegacyDefaut("George")).toBe(true);
    expect(estVoixLegacyDefaut("locuteur-cm")).toBe(true);
    expect(estVoixLegacyDefaut(VOIX_NARRATION_PAPIER)).toBe(false);
    const fusion = fusionnerCatalogueVoix([alice, cm], VOIX_PAPIER_CATALOGUE, "fr");
    expect(fusion[0]?.name).toBe("Voix Narration Papier");
    expect(fusion[1]?.name).toBe("Nova");
    expect(fusion[2]?.name).toBe("Marishnou");
    const ord = voixOrdonneesEleven(["alice1"], fusion, [VOIX_NARRATION_PAPIER, VOIX_NOVA]);
    expect(ord[0]?.id).toBe(VOIX_NARRATION_PAPIER);
    expect(ord.some((v) => v.name === "locuteur-cm")).toBe(true);
  });

  it("regroupe l'alignement caractère → mots", () => {
    const mots = motsDepuisAlignement(
      "Sauf que Troie",
      ["S", "a", "u", "f", " ", "q", "u", "e", " ", "T", "r", "o", "i", "e"],
      [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3],
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    );
    expect(mots.map((m) => m.word)).toEqual(["Sauf", "que", "Troie"]);
    expect(mots[0]?.start).toBe(0);
    expect(mots[2]?.end).toBeCloseTo(1.4);
  });
});
