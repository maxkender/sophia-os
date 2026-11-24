// apps/join : chaque clé de en.json existe dans toutes les autres langues, avec les mêmes variables, et chaque texte
// y est traduit (hors exceptions listées dans apps/join/scripts/traductions.mjs).
import { describe, expect, it } from "vitest";

// @ts-expect-error module JS sans déclaration de types (script Node de apps/join)
import { clesManquantes, clesNonTraduites } from "../../apps/join/scripts/traductions.mjs";

describe("traductions de apps/join", () => {
  it("aucune clé de en.json ne manque dans une langue, et les variables {x} sont les mêmes", () => {
    expect(clesManquantes()).toEqual([]);
  });

  it("aucune clé non vide de en.json n'a la même valeur dans une autre langue", () => {
    expect(clesNonTraduites()).toEqual([]);
  });
});
