import { describe, expect, it } from "vitest";

import {
  cleMot,
  clesQuestionnaire,
  CONSIGNES_QUESTIONNAIRE,
  MOTS_ANGLAIS,
  PARTIES_QUESTIONNAIRE,
  QUESTION_INTRO,
  questionsNumerotees,
} from "./questionnaire";

describe("questionnaire des relecteurs natifs", () => {
  it("reprend la version Notion : 49 questions numérotées, 38 mots, 9 parties", () => {
    expect(questionsNumerotees()).toHaveLength(49);
    expect(MOTS_ANGLAIS).toHaveLength(38);
    expect(PARTIES_QUESTIONNAIRE).toHaveLength(9);
    expect(PARTIES_QUESTIONNAIRE.map((p) => p.titre.split(" · ")[0])).toEqual([
      "Part 1",
      "Part 2",
      "Part 3",
      "Part 4",
      "Part 5",
      "Part 6",
      "Part 7",
      "Part 8",
      "Part 9",
    ]);
  });

  it("numérote de 1 à 49 sans trou, dans l'ordre des parties", () => {
    const q = questionsNumerotees();
    expect(q.map((x) => x.numero)).toEqual(Array.from({ length: 49 }, (_, i) => i + 1));
    expect(q[0].cle).toBe("ecole.examen_fin_lycee");
    expect(q[19].texte).toContain("viral");
    expect(q[47].texte).toContain("popular creators");
    expect(q[48].cle).toBe("applis.nom");
  });

  it("a des clés uniques : l'intro, les questions puis les mots", () => {
    const cles = clesQuestionnaire();
    expect(cles).toHaveLength(1 + 49 + 38);
    expect(new Set(cles).size).toBe(cles.length);
    expect(cles[0]).toBe(QUESTION_INTRO.cle);
  });

  it("donne une clé lisible et stable à chaque mot", () => {
    expect(cleMot("brain rot")).toBe("mot.brain-rot");
    expect(cleMot("alpha / high-value man")).toBe("mot.alpha-high-value-man");
    expect(cleMot("9-to-5")).toBe("mot.9-to-5");
    expect(cleMot("NPC")).toBe("mot.npc");
  });

  it("garde les consignes telles qu'écrites dans Notion", () => {
    expect(CONSIGNES_QUESTIONNAIRE[0]).toMatch(/^RESPOND IN YOUR LANGUAGE, NOT IN ENGLISH\./);
    expect(CONSIGNES_QUESTIONNAIRE[1]).toMatch(/^Take liberties/);
  });

  it("ne garde pas les questions retirées dans Notion", () => {
    const textes = questionsNumerotees().map((q) => q.texte).join("\n");
    expect(textes).not.toContain("lowercase");
    expect(textes).not.toContain("salary");
    expect(textes).not.toContain("God, the Bible");
    expect(textes).not.toContain("rare words");
  });
});
