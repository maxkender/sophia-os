import { describe, expect, it } from "vitest";

import { fr } from "@/locales/fr";
import { en } from "@/locales/en";
import {
  basculerSelection,
  formatNote,
  MAX_CONTENUS_A_BLANC,
  motifNonEligibleCle,
  ordonnerLabels,
  raisonDeckCle,
  statutDeckCle,
  tirerAuHasard,
} from "./contenusABlanc";

const cle = (racine: Record<string, unknown>, chemin: string): unknown =>
  chemin.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), racine);

describe("contenusABlanc — aides pures", () => {
  it("sélection : 3 au plus, bascule sans doublon", () => {
    let s: string[] = [];
    for (const id of ["a", "b", "c", "d"]) s = basculerSelection(s, id);
    expect(s).toEqual(["a", "b", "c"]);
    expect(basculerSelection(s, "b")).toEqual(["a", "c"]);
    expect(MAX_CONTENUS_A_BLANC).toBe(3);
  });

  it("tirage au hasard : n éléments distincts de la liste, jamais plus qu'elle", () => {
    const liste = ["a", "b", "c", "d", "e"];
    const tires = tirerAuHasard(liste, 3, () => 0.99);
    expect(tires).toHaveLength(3);
    expect(new Set(tires).size).toBe(3);
    expect(tires.every((x) => liste.includes(x))).toBe(true);
    expect(tirerAuHasard(["a"], 3)).toEqual(["a"]);
    expect(tirerAuHasard([], 3)).toEqual([]);
  });

  it("labels : ceux qui servent l'application d'abord, puis par nom", () => {
    const labels = [
      { id: "1", nom: "zeta" },
      { id: "2", nom: "alpha" },
      { id: "3", nom: "beta" },
    ];
    expect(ordonnerLabels(labels, new Set(["1"])).map((l) => [l.nom, l.sert])).toEqual([
      ["zeta", true],
      ["alpha", false],
      ["beta", false],
    ]);
  });

  it("raisons de deck lisibles : budget, prompt vide, autre", () => {
    expect(raisonDeckCle(null)).toBeNull();
    expect(raisonDeckCle("budget")).toEqual({ cle: "contenusABlanc.raisonBudget" });
    expect(raisonDeckCle("prompt placement_unswipe manquant")).toEqual({
      cle: "contenusABlanc.raisonPrompt",
      brut: "placement_unswipe",
    });
    expect(raisonDeckCle("base polluée par une pub Sophia")).toEqual({
      cle: "contenusABlanc.raison",
      brut: "base polluée par une pub Sophia",
    });
  });

  it("formatNote et clés i18n présentes en FR et EN", () => {
    expect(formatNote(64.27)).toBe("64.3");
    expect(formatNote(null)).toBe("—");
    const cles = [
      motifNonEligibleCle("pertinence_sous_plancher"),
      motifNonEligibleCle("note_sous_seuil"),
      motifNonEligibleCle("inconnu"),
      statutDeckCle("pret"),
      statutDeckCle("ineligible"),
      statutDeckCle("echec"),
      statutDeckCle("autre"),
      "contenusABlanc.raisonBudget",
      "contenusABlanc.raisonPrompt",
    ];
    for (const c of cles) {
      expect(typeof cle(fr.translation, c), `fr ${c}`).toBe("string");
      expect(typeof cle(en.translation, c), `en ${c}`).toBe("string");
    }
  });
});
