import { describe, expect, it } from "vitest";

import { avancementBloc, blocsQuestionnaire, clesDuBloc, premierBlocAFaire } from "./parcours";
import { clesQuestionnaire, MOTS_ANGLAIS, PARTIES_QUESTIONNAIRE } from "./questionnaire";

describe("blocsQuestionnaire", () => {
  const blocs = blocsQuestionnaire();

  it("accueil, une partie par bloc, les mots en 3 blocs, puis l'envoi", () => {
    expect(blocs[0].type).toBe("avant");
    expect(blocs[blocs.length - 1].type).toBe("envoi");
    const mots = blocs.filter((b) => b.type === "mots");
    expect(mots).toHaveLength(3);
    expect(mots.map((b) => (b.type === "mots" ? b.mots.length : 0))).toEqual([13, 13, 12]);
    expect(blocs).toHaveLength(1 + (PARTIES_QUESTIONNAIRE.length - 1) + 3 + 1);
  });

  it("chaque clé du questionnaire est dans un seul bloc", () => {
    const toutes = blocs.flatMap(clesDuBloc);
    expect(new Set(toutes).size).toBe(toutes.length);
    expect([...toutes].sort()).toEqual([...clesQuestionnaire()].sort());
    expect(toutes.filter((c) => c.startsWith("mot.")).length).toBe(MOTS_ANGLAIS.length);
  });
});

describe("avancement et reprise", () => {
  const blocs = blocsQuestionnaire();
  const r = (question_cle: string, reponse = "x", choix: "anglais" | "notre_mot" | "personne" | null = null) => ({
    question_cle,
    reponse,
    choix,
  });

  it("compte les réponses remplies d'un bloc", () => {
    expect(avancementBloc(blocs[0], [r("intro.pays")])).toEqual({ repondues: 1, total: 1 });
    expect(avancementBloc(blocs[0], [r("intro.pays", "  ")])).toEqual({ repondues: 0, total: 1 });
    expect(avancementBloc(blocs[blocs.length - 1], [])).toEqual({ repondues: 0, total: 0 });
  });

  it("reprend au premier bloc incomplet, à l'accueil sans réponse, à l'envoi quand tout est rempli", () => {
    expect(premierBlocAFaire(blocs, [])).toBe(0);
    expect(premierBlocAFaire(blocs, [r("intro.pays")])).toBe(1);
    const tout = clesQuestionnaire().map((c) => (c.startsWith("mot.") ? r(c, "", "anglais") : r(c)));
    expect(premierBlocAFaire(blocs, tout)).toBe(blocs.length - 1);
  });
});
