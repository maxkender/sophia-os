import { describe, expect, it } from "vitest";

import { filtrerGroupes, groupesSources, resumeSources } from "./groupesSources";
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
describe("groupesSources", () => {
  it("groupe les conjoints sous leur principal", () => {
    const g = groupesSources(sources).find((x) => x.principal.id === "amayareading")!;
    expect(g.conjoints.map((c) => c.id)).toEqual(["amaya.conjoint"]);
  });

  it("les actifs d'abord, puis par @", () => {
    expect(groupesSources(sources).map((g) => g.principal.id)).toEqual([
      "amayareading",
      "careerswemma",
      "vide",
      "eteinte",
    ]);
  });
});

describe("filtrerGroupes", () => {
  const groupes = groupesSources(sources);
  it("trouve un groupe par le @ d'un conjoint, par la niche ou par la langue", () => {
    expect(filtrerGroupes(groupes, "@amaya.conj").map((g) => g.principal.id)).toEqual(["amayareading"]);
    expect(filtrerGroupes(groupes, "rh").map((g) => g.principal.id)).toEqual(["careerswemma"]);
    expect(filtrerGroupes(groupes, "fr").map((g) => g.principal.id)).toEqual(["careerswemma"]);
    expect(filtrerGroupes(groupes, "  ")).toHaveLength(4);
  });
});

describe("resumeSources", () => {
  it("compte les sources actives, les jamais extraites et la dernière extraction", () => {
    const r = resumeSources(groupesSources(sources));
    expect(r).toEqual({
      actives: 3,
      total: 4,
      conjoints: 1,
      jamaisExtraites: 1,
      derniereExtraction: "2026-10-22T08:00:00Z",
    });
  });
});
