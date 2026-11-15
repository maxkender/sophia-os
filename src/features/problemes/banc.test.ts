import { describe, expect, it } from "vitest";

import { casDuBanc, choisirExemples, etiquettes, normaliser, promptCas, type ExempleBot } from "../../../supabase/functions/_shared/bots_banc";
import { pourcent } from "./banc";

const ex = (p: Partial<ExempleBot>): ExempleBot => ({
  id: Math.random().toString(36).slice(2), cle: Math.random().toString(36), bot: null, categorie: "stop", situation: "s",
  message_posteur: null, bonne_decision: "kill_samedi", bonne_reponse: null, pourquoi: null, source: "depart", cree_at: "2026-11-01T00:00:00Z", ...p,
});

describe("banc d'essai des bots (0567)", () => {
  it("prend d'abord les corrections des cartes, au plus 10 Weekly, puis les exemples de départ", () => {
    const cartes = Array.from({ length: 5 }, (_, i) => ex({ source: "ignorer", cree_at: `2026-11-0${i + 1}T00:00:00Z` }));
    const weekly = Array.from({ length: 20 }, () => ex({ source: "weekly" }));
    const depart = Array.from({ length: 13 }, () => ex({ source: "depart" }));
    const cas = casDuBanc([...depart, ...weekly, ...cartes], 30);
    expect(cas).toHaveLength(28);
    expect(cas.slice(0, 5).every((c) => c.source === "ignorer")).toBe(true);
    expect(cas.filter((c) => c.source === "weekly")).toHaveLength(10);
    expect(cas.filter((c) => c.source === "depart")).toHaveLength(13);
  });

  it("compare les décisions sans accents ni majuscules, et liste les étiquettes une fois", () => {
    expect(normaliser("« Lui répondre et garder »")).toBe(normaliser("lui repondre et garder"));
    expect(etiquettes([ex({ bonne_decision: "Kill_samedi" }), ex({ bonne_decision: "garder" })])).toEqual(
      ["Kill_samedi", "garder", "decision_doute", "repondre_garder", "ignorer", "reponse"]);
  });

  it("ne donne jamais le cas lui-même en exemple", () => {
    const cas = ex({ categorie: "plainte" });
    const proches = choisirExemples([cas, ex({ categorie: "plainte" }), ex({ categorie: "stop" })], cas, 5);
    expect(proches.find((p) => p.id === cas.id)).toBeUndefined();
    expect(proches[0].categorie).toBe("plainte");
    expect(promptCas(cas, [{ regle: "Jamais de Kill sans STOP", exemple: null }], proches, ["kill_samedi"])).toContain("Jamais de Kill sans STOP");
    expect(pourcent(0.833)).toBe("83 %");
  });
});
