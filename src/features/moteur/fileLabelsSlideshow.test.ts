import { describe, expect, it } from "vitest";

import {
  consommerFileSlideshow,
  estLabelFileSlideshow,
  estLabelInterditCompte,
  estLabelManuel,
  labelsApresAjout,
  labelsProposesCompte,
} from "./fileLabelsSlideshow";

describe("estLabelFileSlideshow", () => {
  it("accepte un label thématique slideshow", () => {
    expect(estLabelFileSlideshow({ slug: "alpha-male", manuel: false })).toBe(true);
    expect(estLabelFileSlideshow({ slug: "classic-study" })).toBe(true);
  });

  it("refuse Hook et les labels manuels (UGCV : jamais tirés)", () => {
    expect(estLabelFileSlideshow({ slug: "hook" })).toBe(false);
    expect(estLabelFileSlideshow({ slug: "HOOK" })).toBe(false);
    expect(estLabelFileSlideshow({ nom: "Hook" })).toBe(false);
    expect(estLabelFileSlideshow({ slug: "ugcv", nom: "UGCV", manuel: true })).toBe(false);
    expect(estLabelManuel({ slug: "ugcv", manuel: true })).toBe(true);
    expect(estLabelManuel({ slug: "ugcv" })).toBe(false);
    expect(estLabelInterditCompte({ slug: "hook" })).toBe(true);
    expect(estLabelInterditCompte({ slug: "ugcv", manuel: true })).toBe(false);
    expect(estLabelInterditCompte({ slug: "classic-study" })).toBe(false);
  });
});

describe("consommerFileSlideshow", () => {
  const eligible = ["alpha", "clean"];

  it("prend le premier éligible et saute les labels manuels en tête", () => {
    const out = consommerFileSlideshow(
      [
        { label_id: "test", ugc: false },
        { label_id: "alpha", ugc: false },
        { label_id: "clean", ugc: true },
      ],
      eligible,
    );
    expect(out.item).toEqual({ label_id: "alpha", ugc: false });
    expect(out.skipped).toEqual([{ label_id: "test", ugc: false }]);
    expect(out.rest).toEqual([{ label_id: "clean", ugc: true }]);
  });

  it("vide la file si tout est manuel", () => {
    const out = consommerFileSlideshow(
      [{ label_id: "test", ugc: false }],
      eligible,
    );
    expect(out.item).toBeNull();
    expect(out.rest).toEqual([]);
    expect(out.skipped).toHaveLength(1);
  });

  it("ne consomme rien sur une file vide", () => {
    const out = consommerFileSlideshow([], eligible);
    expect(out.item).toBeNull();
    expect(out.rest).toEqual([]);
    expect(out.skipped).toEqual([]);
  });
});

describe("labels d'un compte : UGCV manuel et exclusif", () => {
  const alpha = { id: "alpha", slug: "alpha-male", nom: "alpha_male" };
  const clean = { id: "clean", slug: "clean-study", nom: "clean_study" };
  const hook = { id: "hook", slug: "hook", nom: "Hook" };
  const ugcv = { id: "ugcv", slug: "ugcv", nom: "UGCV", manuel: true };
  const tous = [alpha, clean, hook, ugcv];

  it("seul l'admin se voit proposer UGCV ; Hook jamais", () => {
    expect(labelsProposesCompte(tous, [alpha], false).map((l) => l.id)).toEqual(["clean"]);
    expect(labelsProposesCompte(tous, [alpha], true).map((l) => l.id)).toEqual(["clean", "ugcv"]);
  });

  it("un compte UGCV ne se voit plus rien proposer, même par l'admin", () => {
    expect(labelsProposesCompte(tous, [ugcv], true)).toEqual([]);
  });

  it("poser UGCV retire les autres labels ; un label slideshow s'ajoute", () => {
    expect(labelsApresAjout(["alpha", "clean"], ugcv)).toEqual(["ugcv"]);
    expect(labelsApresAjout(["alpha"], clean)).toEqual(["alpha", "clean"]);
  });
});
