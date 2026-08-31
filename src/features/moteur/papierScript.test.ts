import { describe, expect, it } from "vitest";

import {
  budgetScript,
  compterMots,
  compterSophia,
  coverPromptPapier,
  dureeCibleClip,
  estimerSecondesParole,
  extraireJson,
  finaliserScript,
  motionPromptPapier,
  normaliserCtaSophiaUnique,
  protegerNomSophia,
  remplacerSophiaParAppli,
  SOPHIA_OUTRO,
} from "./papierScript";

describe("durée de clip", () => {
  it("compte les mots et estime ~2,6 mots/s", () => {
    expect(compterMots("  un deux   trois ")).toBe(3);
    expect(estimerSecondesParole("un deux trois quatre")).toBeCloseTo(4 / 2.6, 5);
  });

  it("arrondit la durée Seedance à 4, 6 ou 8 s", () => {
    expect(dureeCibleClip("un deux trois quatre cinq six sept huit")).toBe(4);
    expect(dureeCibleClip("mot ".repeat(14))).toBe(6);
    expect(dureeCibleClip("mot ".repeat(22))).toBe(8);
  });
});

describe("budget script", () => {
  it("réserve ~3 s de CTA et calcule scènes / mots", () => {
    const b = budgetScript(48);
    expect(b.narrationSeconds).toBe(45);
    expect(b.totalWords).toBe(Math.round(45 * 2.6));
    expect(b.sceneCount).toBeGreaterThanOrEqual(5);
    expect(b.sceneCount).toBeLessThanOrEqual(16);
    expect(b.wordsPerScene).toBeGreaterThanOrEqual(8);
  });
});

describe("JSON modèle", () => {
  it("extrait un objet depuis un fence markdown", () => {
    const j = extraireJson<{ topic: string }>('Voici\n```json\n{"topic":"Les chats"}\n```');
    expect(j.topic).toBe("Les chats");
  });

  it("extrait un objet entouré de texte", () => {
    const j = extraireJson<{ a: number }>("ok {\"a\": 2} fin");
    expect(j.a).toBe(2);
  });
});

describe("CTA Sophia unique", () => {
  it("remplace Sophia hors CTA par l'appli", () => {
    expect(remplacerSophiaParAppli("Ouvre Sophia puis lis")).toBe("Ouvre l'appli puis lis");
  });

  it("ne garde Sophia qu'une fois dans le CTA", () => {
    const cta = normaliserCtaSophiaUnique("Sophia t'aide. Télécharge Sophia maintenant.");
    expect(compterSophia(cta)).toBe(1);
  });

  it("finalise le script : strip pub, CTA collé, Sophia hors scènes", () => {
    const script = finaliserScript(
      {
        title: "Test",
        hook: "Hook",
        cta: "Des histoires comme ça, Sophia t'en apprend une. Télécharge Sophia.",
        scenes: [
          { index: 0, narration: "Hook choc ici", overlay: "Hook", imagePrompt: "a", videoPrompt: "b" },
          { index: 1, narration: "En 1870 à Paris", overlay: "1870", imagePrompt: "c", videoPrompt: "d" },
          { index: 2, narration: "Télécharge Sophia tout de suite", overlay: "App", imagePrompt: "e", videoPrompt: "f" },
        ],
      },
      5,
    );
    expect(script.scenes.length).toBe(3);
    expect(script.scenes[0]?.narration).toBe("Hook choc ici");
    expect(script.scenes[2]?.narration).toContain("Sophia");
    expect(compterSophia(script.scenes.slice(0, -1).map((s) => s.narration).join(" "))).toBe(0);
    expect(compterSophia(script.cta)).toBe(1);
    expect(script.scenes[2]?.overlay).toBe("Sophia");
  });

  it("corrige Sofia en Sophia dans le CTA", () => {
    expect(protegerNomSophia("Télécharge Sofia maintenant")).toBe("Télécharge Sophia maintenant");
    expect(compterSophia(normaliserCtaSophiaUnique("Ouvre Sofia puis lis Sofia"))).toBe(1);
  });

  it("l'outro par défaut ne dit Sophia qu'une fois", () => {
    expect(compterSophia(SOPHIA_OUTRO)).toBe(1);
  });

  it("utilise l'outro par défaut si CTA vide", () => {
    const script = finaliserScript(
      {
        scenes: [
          { index: 0, narration: "A", overlay: "", imagePrompt: "", videoPrompt: "" },
          { index: 1, narration: "B", overlay: "", imagePrompt: "", videoPrompt: "" },
        ],
      },
      2,
    );
    expect(script.cta).toBe(SOPHIA_OUTRO);
    expect(compterSophia(script.cta)).toBe(1);
  });
});

describe("prompts papercraft", () => {
  it("cadre carré letterbox + pas de texte", () => {
    const cover = coverPromptPapier("a red paper boat");
    expect(cover).toContain("SAFE AREA");
    expect(cover).toContain("Do NOT draw black bars");
    expect(cover).toContain("no text");
    expect(cover).toContain("a red paper boat");
    const motion = motionPromptPapier("the boat drifts");
    expect(motion).toContain("LOCKED camera");
    expect(motion).toContain("never change the frame");
  });
});
