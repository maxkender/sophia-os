import { describe, expect, it } from "vitest";

import {
  consommerFileSlideshow,
  estLabelFileSlideshow,
  estLabelUgcAiVideo,
} from "./fileLabelsSlideshow";

describe("estLabelFileSlideshow", () => {
  it("accepte un label thématique slideshow", () => {
    expect(estLabelFileSlideshow({ slug: "alpha-male", ugc_ai_video: false })).toBe(true);
    expect(estLabelFileSlideshow({ slug: "test" })).toBe(true);
  });

  it("refuse Hook, la marque système, et les labels UGC AI VIDEO", () => {
    expect(estLabelFileSlideshow({ slug: "hook" })).toBe(false);
    expect(estLabelFileSlideshow({ slug: "ugc-ai-video" })).toBe(false);
    expect(estLabelFileSlideshow({ slug: "test", ugc_ai_video: true })).toBe(false);
    expect(estLabelUgcAiVideo({ slug: "test", ugc_ai_video: true })).toBe(true);
    expect(estLabelUgcAiVideo({ slug: "ugc-ai-video" })).toBe(true);
  });
});

describe("consommerFileSlideshow", () => {
  const eligible = ["alpha", "clean"];

  it("prend le premier éligible et saute les labels vidéo en tête", () => {
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

  it("vide la file si tout est UGC vidéo", () => {
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
