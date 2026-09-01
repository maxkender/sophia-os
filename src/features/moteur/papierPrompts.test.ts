import { describe, expect, it } from "vitest";

import {
  CLE_PROMPT_CTA,
  CLE_PROMPT_IMAGE,
  CLE_PROMPT_SCRIPT,
  CLE_PROMPT_VOIX,
  CTA_SOPHIA_DEFAUT,
  IMAGE_STYLE_DEFAUT,
  SCRIPT_GENERATION_DEFAUT,
  VOICE_DELIVERY_DEFAUT,
  promptPapierOuDefaut,
  stabiliteVoixDepuisPrompt,
  vitesseVoixDepuisPrompt,
} from "./papierPromptDefauts";
import { scriptSystemPrompt, topicSystemPrompt } from "./papierPrompts";
import { coverPromptPapier } from "./papierScript";

describe("défauts prompts papier", () => {
  it("pré-remplit les 4 clés sans champ vide", () => {
    expect(promptPapierOuDefaut(CLE_PROMPT_SCRIPT).length).toBeGreaterThan(400);
    expect(promptPapierOuDefaut(CLE_PROMPT_VOIX).length).toBeGreaterThan(80);
    expect(promptPapierOuDefaut(CLE_PROMPT_CTA)).toContain("Sophia");
    expect(promptPapierOuDefaut(CLE_PROMPT_IMAGE)).toContain("paper");
    expect(promptPapierOuDefaut(CLE_PROMPT_SCRIPT, "  ")).toBe(SCRIPT_GENERATION_DEFAUT);
    expect(promptPapierOuDefaut(CLE_PROMPT_VOIX, "lent")).toBe("lent");
  });

  it("exige une collision preuve + objet culturel", () => {
    expect(SCRIPT_GENERATION_DEFAUT).toContain("collision");
    expect(SCRIPT_GENERATION_DEFAUT).toContain("preuve matérielle");
    expect(SCRIPT_GENERATION_DEFAUT).toMatch(/Titanic|pyramides/);
    expect(SCRIPT_GENERATION_DEFAUT).toContain("Reveal — Clues, then a final twist");
    expect(SCRIPT_GENERATION_DEFAUT).toContain("Big question — But do you really know why");
    expect(SCRIPT_GENERATION_DEFAUT).toContain("Immersive story — the scene as it was lived");
    expect(SCRIPT_GENERATION_DEFAUT).toContain("toutes lettres");
  });

  it("lit vitesse et stabilité depuis le prompt voix", () => {
    expect(vitesseVoixDepuisPrompt(VOICE_DELIVERY_DEFAUT)).toBeCloseTo(0.92);
    expect(stabiliteVoixDepuisPrompt(VOICE_DELIVERY_DEFAUT)).toBeCloseTo(0.58);
  });
});

describe("assemblage pipeline", () => {
  it("le sujet n'écrit pas le script et injecte le style", () => {
    const p = topicSystemPrompt("question", ["Troie"], "seed1", "mythes");
    expect(p).toContain("ÉTAPE ACTIVE : 1");
    expect(p).toContain("Big question — But do you really know why");
    expect(p).toContain("origine physique");
    expect(p).toContain("Troie");
    expect(p).not.toContain("ÉTAPE ACTIVE : 2 et 3");
  });

  it("le script injecte doctrine, CTA, voix et style image", () => {
    const p = scriptSystemPrompt("culture", 6, "revelation", 16, 90, {
      doctrine: SCRIPT_GENERATION_DEFAUT,
      cta: CTA_SOPHIA_DEFAUT,
      voix: VOICE_DELIVERY_DEFAUT,
      imageStyle: IMAGE_STYLE_DEFAUT,
      categorie: "espace",
    });
    expect(p).toContain("Reveal — Clues, then a final twist");
    expect(p).toContain("mesure ou une observation datée");
    expect(p).toContain(CTA_SOPHIA_DEFAUT.slice(0, 40));
    expect(p).toContain("vitesse: 0.92");
    expect(p).toContain("paper cut-out");
    expect(p).toContain("Produis exactement 6 scènes");
  });

  it("le cover utilise le style admin", () => {
    const cover = coverPromptPapier("a red boat", { styleVisuel: "neon paper only" });
    expect(cover).toContain("neon paper only");
    expect(cover).toContain("SAFE AREA");
    expect(cover).toContain("a red boat");
  });
});
