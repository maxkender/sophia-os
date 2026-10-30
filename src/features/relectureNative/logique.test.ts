import { describe, expect, it } from "vitest";

import { FAMILLES_DE_TON, languesDuPoster, modeleFicheAppli, modeleFicheLangue, relecteursAvecEspace } from "./logique";

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

describe("modeleFicheLangue", () => {
  it("prépare les rubriques du brief en anglais, avec une section par famille de ton", () => {
    const modele = modeleFicheLangue("German", "de");
    expect(modele.startsWith("# Language sheet: German (de)\n")).toBe(true);
    expect(modele).toContain("native words, phrases and hooks quoted verbatim in German");
    expect(modele).toContain("## The 8 rules that matter most");
    expect(modele).toContain("### Never write (translation calques)");
    expect(modele).toContain("### Career (RH)");
    expect(modele).toContain("## What our translation gets wrong");
    for (const f of FAMILLES_DE_TON) expect(modele).toContain(`### ${f.nom} (${f.labels.join(", ")})`);
  });

  it("range chaque label dans une seule famille", () => {
    const labels = FAMILLES_DE_TON.flatMap((f) => f.labels);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
