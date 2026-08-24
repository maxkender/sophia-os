import { describe, expect, it } from "vitest";

import {
  captionEstVide,
  extraireCaptionFal,
  estLabelHook,
  estLabelPoolUgcAiVideo,
  estLabelSysteme,
  idsPremiereSlide,
  mediaEstPremiereSlide,
  normaliserCaptionOk,
  pathEstPremiereSlide,
  raccourcirCaption,
  SLUG_HOOK,
} from "./mediaCaption";

describe("estLabelSysteme / hook", () => {
  it("reconnaît hook et ugc-ai-video", () => {
    expect(estLabelSysteme({ slug: SLUG_HOOK })).toBe(true);
    expect(estLabelSysteme({ slug: "ugc-ai-video" })).toBe(true);
    expect(estLabelSysteme({ slug: "alpha-male" })).toBe(false);
    expect(estLabelHook({ slug: "Hook" })).toBe(false);
    expect(estLabelHook({ slug: "hook" })).toBe(true);
  });

  it("isole le pool UGC AI VIDEO des labels slideshow", () => {
    expect(estLabelPoolUgcAiVideo({ slug: "ugc-ai-video" })).toBe(true);
    expect(estLabelPoolUgcAiVideo({ slug: "dating-tips", ugc_ai_video: true })).toBe(true);
    expect(estLabelPoolUgcAiVideo({ slug: "alpha-male", ugc_ai_video: false })).toBe(false);
  });
});

describe("captionEstVide", () => {
  it("rejette les placeholders", () => {
    expect(captionEstVide("")).toBe(true);
    expect(captionEstVide("  ")).toBe(true);
    expect(captionEstVide("n/a")).toBe(true);
    expect(captionEstVide("(aucun texte)")).toBe(true);
    expect(captionEstVide("ab")).toBe(true);
    expect(captionEstVide("A woman standing on a beach")).toBe(false);
  });
});

describe("raccourcirCaption", () => {
  it("garde une phrase courte", () => {
    expect(raccourcirCaption("A red car parked outside.")).toBe("A red car parked outside.");
  });

  it("coupe après la première phrase", () => {
    expect(
      raccourcirCaption("A red car parked outside. There are trees and a long fence behind it."),
    ).toBe("A red car parked outside.");
  });

  it("tronque sans casser un mot", () => {
    const long = `${"word ".repeat(80)}end`;
    const out = raccourcirCaption(long, 40);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out).not.toMatch(/wo…/);
  });
});

describe("extraireCaptionFal", () => {
  it("lit results Florence", () => {
    expect(extraireCaptionFal({ results: "  A cat on a sofa.  " })).toBe("A cat on a sofa.");
  });

  it("lit output Moondream", () => {
    expect(extraireCaptionFal({ output: "A cat." })).toBe("A cat.");
  });

  it("lit data imbriqué", () => {
    expect(extraireCaptionFal({ data: { text: "Nested" } })).toBe("Nested");
  });

  it("ignore un objet vide", () => {
    expect(extraireCaptionFal({})).toBe("");
    expect(extraireCaptionFal(null)).toBe("");
  });
});

describe("normaliserCaptionOk", () => {
  it("null si vide après raccourci", () => {
    expect(normaliserCaptionOk("n/a")).toBeNull();
    expect(normaliserCaptionOk("A detailed view of a kitchen counter.")).toBe(
      "A detailed view of a kitchen counter.",
    );
  });
});

describe("premiere slide / Hook", () => {
  const slides = [
    { position: 1, media_id: "m-hook" },
    { position: 2, media_id: "m-mid" },
  ];

  it("détecte la première slide", () => {
    expect(mediaEstPremiereSlide("m-hook", slides)).toBe(true);
    expect(mediaEstPremiereSlide("m-mid", slides)).toBe(false);
    expect(mediaEstPremiereSlide("m-hook", [])).toBe(false);
    expect(idsPremiereSlide(slides)).toEqual(["m-hook"]);
  });

  it("détecte le chemin propre/brut position 1", () => {
    expect(pathEstPremiereSlide("propre/abc/1.jpg")).toBe(true);
    expect(pathEstPremiereSlide("brut/abc/1")).toBe(true);
    expect(pathEstPremiereSlide("propre/abc/2.jpg")).toBe(false);
    expect(pathEstPremiereSlide("propre/abc/10.jpg")).toBe(false);
  });
});
