import { describe, expect, it } from "vitest";

import { fr } from "@/locales/fr";
import { en } from "@/locales/en";
import {
  basculerSelection,
  type ContenusABlancResultat,
  decouperEnLots,
  formatNote,
  fusionnerResultats,
  MAX_CONTENUS_A_BLANC,
  MAX_SELECTION_A_BLANC,
  motifNonEligibleCle,
  ordonnerLabels,
  raisonDeckCle,
  statutDeckCle,
  tirerAuHasard,
} from "./contenusABlanc";

const cle = (racine: Record<string, unknown>, chemin: string): unknown =>
  chemin.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), racine);

describe("contenusABlanc — aides pures", () => {
  it("sélection : 12 au plus, bascule sans doublon ; le serveur en teste 3 par appel", () => {
    let s: string[] = [];
    const ids = Array.from({ length: 14 }, (_, i) => `s${i}`);
    for (const id of ids) s = basculerSelection(s, id);
    expect(s).toEqual(ids.slice(0, MAX_SELECTION_A_BLANC));
    expect(basculerSelection(s, "s1")).toEqual(ids.slice(0, MAX_SELECTION_A_BLANC).filter((x) => x !== "s1"));
    expect(basculerSelection(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(MAX_CONTENUS_A_BLANC).toBe(3);
    expect(MAX_SELECTION_A_BLANC).toBe(12);
  });

  it("lots : 3 par 3 dans l'ordre, le dernier plus court", () => {
    expect(decouperEnLots(["a", "b", "c", "d", "e", "f", "g"])).toEqual([["a", "b", "c"], ["d", "e", "f"], ["g"]]);
    expect(decouperEnLots(["a", "b"])).toEqual([["a", "b"]]);
    expect(decouperEnLots([])).toEqual([]);
  });

  describe("fusion des lots", () => {
    const resultat = (ids: string[], extra: Partial<ContenusABlancResultat> = {}): ContenusABlancResultat => ({
      aBlanc: true,
      mode: "contenus",
      ia: true,
      dureeMs: 1000,
      resume: "résumé du lot",
      application: { id: "app", slug: "unswipe", nom: "UnSwipe", actif: true, langues: null },
      prompts: null,
      scoring: null,
      contenus: ids.map((id) => ({
        id,
        titre: id,
        statut: "valide",
        importStatut: "done",
        langueSource: "en",
        langue: "en",
        vues: null,
        pisteSource: null,
        avertissements: [],
        pertinence: null,
        deck: { statut: id === "b" ? "echec" : "pret" } as ContenusABlancResultat["contenus"][number]["deck"],
        dureeMs: 10,
      })),
      ecrituresEvitees: [{ table: "passages", operation: "insert", requetes: 1, lignes: 2 }],
      appelsBloques: [],
      appelsIA: { autorises: 5, bloques: 0 },
      plafondIA: 45,
      lectures: 10,
      limites: ["limite commune"],
      ...extra,
    });

    it("un seul lot : le résultat du serveur tel quel", () => {
      const r = resultat(["a"]);
      expect(fusionnerResultats([{ ok: true, resultat: r }])).toBe(r);
    });

    it("plusieurs lots : slideshows dans l'ordre, compteurs additionnés, résumé recalculé", () => {
      const f = fusionnerResultats([
        { ok: true, resultat: resultat(["a", "b", "c"], { dureeMs: 3000 }) },
        { ok: true, resultat: resultat(["d"], { dureeMs: 2000 }) },
      ])!;
      expect(f.contenus.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
      expect(f.appelsIA).toEqual({ autorises: 10, bloques: 0 });
      expect(f.plafondIA).toBe(90);
      expect(f.lectures).toBe(20);
      expect(f.dureeMs).toBe(3000);
      expect(f.ecrituresEvitees).toEqual([{ table: "passages", operation: "insert", requetes: 2, lignes: 4 }]);
      expect(f.limites).toEqual(["limite commune"]);
      expect(f.resume).toMatch(/^4 slideshow\(s\) testé\(s\) : 0 éligible\(s\), 3 deck\(s\) prêt\(s\)/);
      expect(f.erreurRun).toBeUndefined();
      expect(f.erreursLots).toBeUndefined();
    });

    it("un lot en échec n'efface pas les autres ; aucun lot abouti : null", () => {
      const f = fusionnerResultats([
        { ok: true, resultat: resultat(["a", "b", "c"]) },
        { ok: false, erreur: "HTTP 546" },
      ])!;
      expect(f.contenus).toHaveLength(3);
      expect(f.erreursLots).toEqual(["[2/2] HTTP 546"]);
      expect(fusionnerResultats([{ ok: false, erreur: "x" }, { ok: false, erreur: "y" }])).toBeNull();
    });
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
