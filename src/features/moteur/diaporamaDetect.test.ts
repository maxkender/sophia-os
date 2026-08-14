import { describe, expect, it } from "vitest";

import { estPostDiaporama, extraireIdsPhotoHtml } from "./diaporamaDetect";

describe("estPostDiaporama", () => {
  it("accepte /photo/ même sans images", () => {
    expect(
      estPostDiaporama({
        webVideoUrl: "https://www.tiktok.com/@x/photo/123",
        imageUrls: [],
      }),
    ).toBe(true);
  });

  it("accepte isSlideshow sur une URL /video/", () => {
    expect(
      estPostDiaporama({
        webVideoUrl: "https://www.tiktok.com/@x/video/123",
        imageUrls: [],
        isSlideshow: true,
      }),
    ).toBe(true);
  });

  it("accepte une cover photomode", () => {
    expect(
      estPostDiaporama({
        webVideoUrl: "https://www.tiktok.com/@x/video/123",
        imageUrls: [],
        coverUrls: ["https://cdn.tiktokcdn.com/tos-xx-i-photomode-xx/a.jpeg"],
      }),
    ).toBe(true);
  });

  it("refuse une vraie vidéo", () => {
    expect(
      estPostDiaporama({
        webVideoUrl: "https://www.tiktok.com/@x/video/123",
        imageUrls: [],
        isSlideshow: false,
        coverUrls: ["https://cdn.tiktokcdn.com/cover.jpeg"],
      }),
    ).toBe(false);
  });
});

describe("extraireIdsPhotoHtml", () => {
  it("extrait les IDs /photo/", () => {
    const html = `href="/@foo/photo/111"> <a href="/@foo/photo/222">`;
    expect(extraireIdsPhotoHtml(html, "foo").ids.sort()).toEqual(["111", "222"]);
  });

  it("détecte le mur login sans aucun post", () => {
    const html =
      `<title>TikTok - Make Your Day</title>` +
      `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{}</script>` +
      `captcha login`;
    const r = extraireIdsPhotoHtml(html, "infinitydream7");
    expect(r.ids).toEqual([]);
    expect(r.murLogin).toBe(true);
  });
});
