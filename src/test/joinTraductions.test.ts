// apps/join : chaque texte de en.json est traduit dans les 16 autres langues (hors exceptions listées dans
// apps/join/scripts/traductions.mjs).
import { describe, expect, it } from "vitest";

// @ts-expect-error module JS sans déclaration de types (script Node de apps/join)
import { clesNonTraduites } from "../../apps/join/scripts/traductions.mjs";

describe("traductions de apps/join", () => {
  it("aucune clé non vide de en.json n'a la même valeur dans une autre langue", () => {
    expect(clesNonTraduites()).toEqual([]);
  });
});
