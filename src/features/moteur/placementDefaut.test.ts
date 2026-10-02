import { describe, expect, it } from "vitest";

import {
  languesSansPlacementParDefaut,
  placementParDefaut,
} from "../../../supabase/functions/_shared/applications";
import { LANGUES_CIBLES } from "./langues";

const CIBLES = LANGUES_CIBLES as readonly string[];

describe("placementParDefaut — couverture", () => {
  it("Sophia a un texte propre à CHAQUE langue cible", () => {
    // Avant : 11 langues retombaient sur l'anglais, dont ar et he — une phrase
    // latine LTR posée sur la dernière slide d'un diaporama RTL.
    expect(languesSansPlacementParDefaut(CIBLES)).toEqual([]);
  });

  it("chaque langue cible a un texte DISTINCT (aucun copier-coller entre langues)", () => {
    const textes = CIBLES.map((code) => placementParDefaut(code));
    expect(new Set(textes).size).toBe(CIBLES.length);
  });

  it("les langues RTL reçoivent bien un texte en écriture RTL", () => {
    expect(placementParDefaut("ar")).toMatch(/[؀-ۿ]/);
    expect(placementParDefaut("he")).toMatch(/[֐-׿]/);
  });

  it("le russe et le bulgare sont en cyrillique, le serbe en latin", () => {
    expect(placementParDefaut("ru")).toMatch(/[Ѐ-ӿ]/);
    // Doctrine `traduction_bg` : cyrillique, la shlyokavitsa latine est bannie.
    expect(placementParDefaut("bg")).toMatch(/[Ѐ-ӿ]/);
    // Doctrine `traduction_sr` : latinica obligatoire, cyrillique bannie.
    expect(placementParDefaut("sr")).not.toMatch(/[Ѐ-ӿ]/);
  });
});

describe("placementParDefaut — forme", () => {
  it("nomme Sophia, sans faute d'orthographe", () => {
    for (const code of CIBLES) {
      const texte = placementParDefaut(code);
      expect(texte, code).toContain("Sophia");
      expect(texte, code).not.toMatch(/\bSofia\b/);
    }
  });

  it("ne nomme aucune autre application (micabo est supprimé, Unswipe n'a pas de repli)", () => {
    for (const code of CIBLES) {
      expect(placementParDefaut(code), code).not.toMatch(/micabo|unswipe/i);
    }
  });

  it("ne contient aucun tiret cadratin — le signal n°1 d'un texte d'IA", () => {
    for (const code of CIBLES) {
      expect(placementParDefaut(code), code).not.toMatch(/[—–]/);
    }
  });

  it("aucune langue non française ne contient « l'appli »", () => {
    for (const code of CIBLES) {
      if (code === "fr") continue;
      expect(placementParDefaut(code), code).not.toMatch(/l'appli/i);
    }
  });

  it("reste court, comme les slides voisines", () => {
    for (const code of CIBLES) {
      expect(placementParDefaut(code).length, code).toBeLessThanOrEqual(220);
    }
  });

  it("une langue hors cibles retombe sur l'anglais", () => {
    expect(placementParDefaut("xx")).toBe(placementParDefaut("en"));
  });
});
