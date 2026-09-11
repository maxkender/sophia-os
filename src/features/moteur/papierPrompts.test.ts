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
    expect(CTA_SOPHIA_DEFAUT).toContain("histoires");
    expect(promptPapierOuDefaut(CLE_PROMPT_IMAGE)).toContain("paper");
    expect(promptPapierOuDefaut(CLE_PROMPT_SCRIPT, "  ")).toBe(SCRIPT_GENERATION_DEFAUT);
    expect(promptPapierOuDefaut(CLE_PROMPT_VOIX, "lent")).toBe("lent");
  });

  it("cible un viewer TikTok, fluide comme les 7 scripts de référence", () => {
    expect(SCRIPT_GENERATION_DEFAUT).toContain("PAS de template");
    expect(SCRIPT_GENERATION_DEFAUT).toContain("LES 7");
    expect(SCRIPT_GENERATION_DEFAUT).toMatch(/vigies/);
    expect(SCRIPT_GENERATION_DEFAUT).toMatch(/Cyclope|Spider-Man/);
    expect(SCRIPT_GENERATION_DEFAUT).toMatch(/lycéen/);
    expect(SCRIPT_GENERATION_DEFAUT).not.toMatch(/DIRIAIT collé/);
    expect(SCRIPT_GENERATION_DEFAUT).toMatch(/tu penses que/);
    expect(SCRIPT_GENERATION_DEFAUT).toMatch(/Titanic/);
    expect(SCRIPT_GENERATION_DEFAUT).toContain("toutes lettres");
    expect(SCRIPT_GENERATION_DEFAUT).toMatch(/de plus|pire encore/);
    expect(SCRIPT_GENERATION_DEFAUT).toContain("HISTOIRE FINIE");
    expect(SCRIPT_GENERATION_DEFAUT).toMatch(/2 à 4 phrases/);
    expect(IMAGE_STYLE_DEFAUT).toMatch(/ACCENT/);
    expect(IMAGE_STYLE_DEFAUT).toMatch(/mid-dark/);
    expect(CTA_SOPHIA_DEFAUT).toMatch(/histoires/);
    expect(CTA_SOPHIA_DEFAUT).toContain("Plus d'histoires");
    expect(CTA_SOPHIA_DEFAUT).not.toMatch(/cette anecdote vient/);
    expect(CTA_SOPHIA_DEFAUT).not.toMatch(/télécharge-la pour/);
  });

  it("lit vitesse et stabilité depuis le prompt voix", () => {
    expect(vitesseVoixDepuisPrompt(VOICE_DELIVERY_DEFAUT)).toBeCloseTo(1.0);
    expect(stabiliteVoixDepuisPrompt(VOICE_DELIVERY_DEFAUT)).toBeCloseTo(0.58);
  });
});

describe("assemblage pipeline", () => {
  it("le sujet n'écrit pas le script et injecte le style", () => {
    const p = topicSystemPrompt("question", ["Troie"], "seed1", "mythes");
    expect(p).toContain("ÉTAPE ACTIVE : 1");
    expect(p).toContain("Big question — But do you really know why");
    expect(p).toContain("vampires");
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
    expect(p).toContain("Lune");
    expect(p).toContain(CTA_SOPHIA_DEFAUT.slice(0, 40));
    expect(p).toContain("vitesse: 1.0");
    expect(p).toContain("paper cut-out");
    expect(p).toContain("Découpe en");
    expect(p).toContain("HISTOIRE FINIE");
    expect(p).toMatch(/≈ 16 mots|≈ 16/);
    expect(p).not.toContain("Produis exactement");
  });

  it("le cover utilise le style admin", () => {
    const cover = coverPromptPapier("a red boat", { styleVisuel: "neon paper only" });
    expect(cover).toContain("neon paper only");
    expect(cover).toContain("SAFE AREA");
    expect(cover).toContain("a red boat");
    expect(IMAGE_STYLE_DEFAUT).toMatch(/ACCENT/);
  });
});
