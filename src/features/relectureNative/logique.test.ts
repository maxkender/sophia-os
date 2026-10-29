import { describe, expect, it } from "vitest";

import { languesDuPoster, modeleFicheAppli, relecteursAvecEspace } from "./logique";

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
