import { describe, expect, it } from "vitest";

import { etatStock, filtrerGroupes, groupesSources, resumeSources } from "./groupesSources";
import type { CompteReference } from "./types";

const source = (id: string, patch: Partial<CompteReference> = {}): CompteReference => ({
  id,
  handle_tiktok: id,
  niche: "white_bg",
  langue: "en",
  application_id: "sophia",
  style_profile: null,
  genre: "femme",
  parent_id: null,
  ordre_assignation: null,
  ordre_par_langue: {},
  is_active: true,
  dernier_scrape_at: "2026-10-20T08:00:00Z",
  created_at: "2026-09-01T08:00:00Z",
  ...patch,
});

const sources = [
  source("amayareading"),
  source("amaya.conjoint", { parent_id: "amayareading", dernier_scrape_at: "2026-10-22T08:00:00Z" }),
  source("careerswemma", { niche: "RH", langue: "fr" }),
  source("vide", { niche: "smart_girl", dernier_scrape_at: null }),
  source("eteinte", { is_active: false }),
];
const stock = { amayareading: 30, "amaya.conjoint": 12, careerswemma: 4, eteinte: 0 };

describe("etatStock", () => {
  it("épuisé à 0, faible sous 10, sinon bon", () => {
    expect([0, 1, 9, 10].map(etatStock)).toEqual(["epuise", "faible", "faible", "ok"]);
  });
});

describe("groupesSources", () => {
  it("groupe les conjoints sous leur principal et additionne leur stock", () => {
    const g = groupesSources(sources, stock).find((x) => x.principal.id === "amayareading")!;
    expect(g.conjoints.map((c) => c.id)).toEqual(["amaya.conjoint"]);
    expect(g.stock).toBe(42);
  });

  it("les actifs d'abord, du stock le plus bas au plus haut", () => {
    expect(groupesSources(sources, stock).map((g) => g.principal.id)).toEqual([
      "vide",
      "careerswemma",
      "amayareading",
      "eteinte",
    ]);
  });
});

describe("filtrerGroupes", () => {
  const groupes = groupesSources(sources, stock);
  it("trouve un groupe par le @ d'un conjoint, par la niche ou par la langue", () => {
    expect(filtrerGroupes(groupes, "@amaya.conj").map((g) => g.principal.id)).toEqual(["amayareading"]);
    expect(filtrerGroupes(groupes, "rh").map((g) => g.principal.id)).toEqual(["careerswemma"]);
    expect(filtrerGroupes(groupes, "fr").map((g) => g.principal.id)).toEqual(["careerswemma"]);
    expect(filtrerGroupes(groupes, "  ")).toHaveLength(4);
  });
});

describe("resumeSources", () => {
  it("compte les sources actives, leur stock, les épuisées et les faibles, sans les éteintes", () => {
    const r = resumeSources(groupesSources(sources, stock));
    expect(r).toMatchObject({
      actives: 3,
      total: 4,
      conjoints: 1,
      stock: 46,
      epuisees: 1,
      faibles: 1,
      jamaisExtraites: 1,
      derniereExtraction: "2026-10-22T08:00:00Z",
    });
  });
});
