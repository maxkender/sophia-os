import { describe, expect, it } from "vitest";

import { avecTirage, fenetreVide, rafale } from "./fenetreRafale";

const TAILLE = 3;

describe("fenêtre anti-rafale pendant une projection", () => {
  it("sans tirage, les chiffres de la base passent tels quels", () => {
    const f = fenetreVide(TAILLE);
    expect(rafale(f, "a", 2, 3)).toEqual({ recents: 2, recence: 3 });
    expect(rafale(f, "b", 0, 0)).toEqual({ recents: 0, recence: 0 });
  });

  it("un label qu'on vient de tirer est le plus récent de la fenêtre", () => {
    const f = avecTirage(fenetreVide(TAILLE), "a");
    // Rang 1 sur 3 : récence maximale.
    expect(rafale(f, "a", 0, 0)).toEqual({ recents: 1, recence: TAILLE });
  });

  it("deux tirages du même label déclenchent la barrière", () => {
    // `rafaleRecents` vaut 2 par défaut : à deux occurrences dans la fenêtre,
    // le label passe derrière tous les autres.
    let f = fenetreVide(TAILLE);
    f = avecTirage(f, "a");
    f = avecTirage(f, "a");
    expect(rafale(f, "a", 0, 0).recents).toBe(2);
  });

  it("la fenêtre oublie au-delà de sa taille", () => {
    let f = fenetreVide(TAILLE);
    f = avecTirage(f, "a");
    for (const x of ["b", "c", "d"]) f = avecTirage(f, x);
    // « a » est sorti des trois derniers.
    expect(rafale(f, "a", 0, 0)).toEqual({ recents: 0, recence: 0 });
    expect(rafale(f, "d", 0, 0).recence).toBe(TAILLE);
  });

  it("chaque tirage chasse un porteur de la base", () => {
    // Trois comptes réels portaient « a » ; après deux tirages d'autre chose,
    // il n'en reste qu'un dans la fenêtre.
    let f = fenetreVide(TAILLE);
    expect(rafale(f, "a", 3, 3).recents).toBe(3);
    f = avecTirage(f, "x");
    expect(rafale(f, "a", 3, 3).recents).toBe(2);
    f = avecTirage(f, "y");
    expect(rafale(f, "a", 3, 3).recents).toBe(1);
    f = avecTirage(f, "z");
    // La fenêtre est entièrement faite de comptes simulés : plus rien d'estimé.
    expect(rafale(f, "a", 3, 3)).toEqual({ recents: 0, recence: 0 });
  });

  it("la récence de la base recule d'un cran par tirage, puis sort", () => {
    let f = fenetreVide(TAILLE);
    // Récence 3 = rang 1, le compte le plus récent de la langue.
    expect(rafale(f, "a", 1, 3).recence).toBe(3);
    f = avecTirage(f, "x");
    expect(rafale(f, "a", 1, 3).recence).toBe(2);
    f = avecTirage(f, "y");
    expect(rafale(f, "a", 1, 3).recence).toBe(1);
    f = avecTirage(f, "z");
    expect(rafale(f, "a", 1, 3).recence).toBe(0);
  });

  it("un tirage récent l'emporte sur un porteur ancien de la base", () => {
    const f = avecTirage(fenetreVide(TAILLE), "a");
    // Base : rang 3, donc récence 1. Simulé : rang 1, donc récence 3.
    expect(rafale(f, "a", 1, 1).recence).toBe(TAILLE);
  });

  it("une fenêtre de taille nulle ne compte rien", () => {
    const f = fenetreVide(0);
    expect(rafale(f, "a", 5, 5)).toEqual({ recents: 0, recence: 0 });
    expect(avecTirage(f, "a").tires).toEqual([]);
  });

  it("le compte rendu ne dépasse jamais la taille de la fenêtre", () => {
    let f = fenetreVide(TAILLE);
    for (const x of ["a", "a", "a", "a"]) f = avecTirage(f, x);
    expect(rafale(f, "a", 3, 3).recents).toBe(TAILLE);
  });
});
