import { describe, expect, it } from "vitest";

import {
  languesDuPoster,
  modeleFicheAppli,
  progressionQuestionnaire,
  relecteursAvecEspace,
  reponseRemplie,
  type ReponseQuestionnaire,
} from "./logique";

const r = (question_cle: string, reponse: string, choix: ReponseQuestionnaire["choix"] = null) => ({
  question_cle,
  reponse,
  choix,
});

describe("reponseRemplie", () => {
  it("compte une question ouverte dès qu'elle a du texte", () => {
    expect(reponseRemplie(r("intro.pays", "Deutschland"))).toBe(true);
    expect(reponseRemplie(r("intro.pays", "   "))).toBe(false);
    expect(reponseRemplie(undefined)).toBe(false);
  });

  it("compte un mot quand un choix est fait, et le mot local écrit s'il en faut un", () => {
    expect(reponseRemplie(r("mot.brain-rot", "", "anglais"))).toBe(true);
    expect(reponseRemplie(r("mot.brain-rot", "", "personne"))).toBe(true);
    expect(reponseRemplie(r("mot.brain-rot", "", "notre_mot"))).toBe(false);
    expect(reponseRemplie(r("mot.brain-rot", "Hirnfäule", "notre_mot"))).toBe(true);
    expect(reponseRemplie(r("mot.brain-rot", "texte sans choix"))).toBe(false);
  });
});

describe("progressionQuestionnaire", () => {
  it("compte sur 88 réponses attendues et ignore une ancienne clé", () => {
    const p = progressionQuestionnaire([
      r("intro.pays", "Türkiye"),
      r("ecole.examen_fin_lycee", "YKS"),
      r("mot.glow-up", "", "anglais"),
      r("ancienne.question", "réponse orpheline"),
    ]);
    expect(p).toEqual({ repondues: 3, total: 88 });
  });
});

describe("relecteursAvecEspace", () => {
  const relecteurs = [
    { id: "a", statut: "invite" },
    { id: "b", statut: "actif" },
    { id: "c", statut: "pause" },
    { id: "d", statut: "retire" },
  ];

  it("ne montre rien tant que l'espace est fermé", () => {
    expect(relecteursAvecEspace(relecteurs, false)).toEqual([]);
  });

  it("ouvert, montre seulement les relecteurs invités ou actifs", () => {
    expect(relecteursAvecEspace(relecteurs, true).map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("languesDuPoster", () => {
  it("met d'abord les langues de ses comptes, sans doublon", () => {
    expect(
      languesDuPoster({
        comptes: [{ langue: "tr" }, { langue: "de" }] as never,
        langues: ["de", "en"],
      }),
    ).toEqual(["tr", "de", "en"]);
  });
});

describe("modeleFicheAppli", () => {
  it("prépare les rubriques de la fiche avec le nom de l'appli", () => {
    const modele = modeleFicheAppli("micabo");
    expect(modele.startsWith("# micabo\n")).toBe(true);
    expect(modele).toContain("## Ce qu'on a le droit d'affirmer");
    expect(modele).toContain("## Ses concurrents");
    expect(modele).toContain("Nom exact : micabo");
  });
});
