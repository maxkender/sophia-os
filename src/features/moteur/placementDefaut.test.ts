import { describe, expect, it } from "vitest";

import {
  SLUG_MICABO,
  SLUG_SOPHIA,
  languesSansPlacementParDefaut,
  placementParDefaut,
} from "../../../supabase/functions/_shared/applications";
import { LANGUES_CIBLES } from "./langues";

const CIBLES = LANGUES_CIBLES as readonly string[];

describe("placementParDefaut — couverture", () => {
  it("Sophia a un texte propre à CHAQUE langue cible", () => {
    // Avant : 11 langues retombaient sur l'anglais, dont ar et he — une phrase
    // latine LTR posée sur la dernière slide d'un diaporama RTL.
    expect(languesSansPlacementParDefaut(CIBLES, SLUG_SOPHIA)).toEqual([]);
  });

  it("micabo aussi", () => {
    // Avant : 20 langues sur 25, portugais / turc / polonais compris.
    expect(languesSansPlacementParDefaut(CIBLES, SLUG_MICABO)).toEqual([]);
  });

  it("les langues RTL reçoivent bien un texte en écriture RTL", () => {
    expect(placementParDefaut("ar")).toMatch(/[؀-ۿ]/);
    expect(placementParDefaut("he")).toMatch(/[֐-׿]/);
    expect(placementParDefaut("ar", SLUG_MICABO)).toMatch(/[؀-ۿ]/);
    expect(placementParDefaut("he", SLUG_MICABO)).toMatch(/[֐-׿]/);
  });

  it("le russe est en cyrillique, le serbe en latin", () => {
    expect(placementParDefaut("ru")).toMatch(/[Ѐ-ӿ]/);
    // Doctrine `traduction_sr` : latinica obligatoire, cyrillique bannie.
    expect(placementParDefaut("sr")).not.toMatch(/[Ѐ-ӿ]/);
    expect(placementParDefaut("sr", SLUG_MICABO)).not.toMatch(/[Ѐ-ӿ]/);
  });
});

describe("placementParDefaut — forme", () => {
  it("nomme Sophia, sans faute d'orthographe", () => {
    for (const code of CIBLES) {
      const texte = placementParDefaut(code, SLUG_SOPHIA);
      expect(texte, code).toContain("Sophia");
      expect(texte, code).not.toMatch(/\bSofia\b/);
    }
  });

  it("écrit micabo en minuscules, comme l'exige sa charte", () => {
    for (const code of CIBLES) {
      const texte = placementParDefaut(code, SLUG_MICABO);
      expect(texte, code).toContain("micabo");
      expect(texte, code).not.toContain("Micabo");
    }
  });

  it("ne contient aucun tiret cadratin — le signal n°1 d'un texte d'IA", () => {
    for (const slug of [SLUG_SOPHIA, SLUG_MICABO]) {
      for (const code of CIBLES) {
        expect(placementParDefaut(code, slug), `${slug}/${code}`).not.toMatch(/[—–]/);
      }
    }
  });

  it("aucune langue non française ne contient « l'appli »", () => {
    for (const slug of [SLUG_SOPHIA, SLUG_MICABO]) {
      for (const code of CIBLES) {
        if (code === "fr") continue;
        expect(placementParDefaut(code, slug), `${slug}/${code}`).not.toMatch(/l'appli/i);
      }
    }
  });

  it("reste court, comme les slides voisines", () => {
    for (const slug of [SLUG_SOPHIA, SLUG_MICABO]) {
      for (const code of CIBLES) {
        expect(placementParDefaut(code, slug).length, `${slug}/${code}`).toBeLessThanOrEqual(220);
      }
    }
  });

  it("une langue hors cibles retombe sur l'anglais", () => {
    expect(placementParDefaut("xx")).toBe(placementParDefaut("en"));
    expect(placementParDefaut("xx", SLUG_MICABO)).toBe(placementParDefaut("en", SLUG_MICABO));
  });
});
