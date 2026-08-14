import { describe, expect, it } from "vitest";

import {
  APIFY_LISTING_ACTOR,
  APIFY_LISTING_MAX,
  echantillonClesItems,
  extraireErrorCodesApify,
  extraireUrlsEmbedHtml,
  extraireUrlsPostsHtml,
  inputListingProfil,
} from "../../../supabase/functions/_shared/tiktok_listing";

describe("inputListingProfil", () => {
  it("demande tout le profil sans filtre date ni proxy None", () => {
    const input = inputListingProfil("@infinitydream7");
    expect(input.profiles).toEqual(["infinitydream7"]);
    expect(input.resultsPerPage).toBe(APIFY_LISTING_MAX);
    expect(input.shouldDownloadSlideshowImages).toBe(false);
    expect(input.oldestPostDateUnified).toBeUndefined();
    expect(input.newestPostDate).toBeUndefined();
    expect(input.proxyCountryCode).toBeUndefined();
    expect(APIFY_LISTING_ACTOR).toBe("clockworks~tiktok-profile-scraper");
  });
});

describe("extraireUrlsPostsHtml", () => {
  it("prend /photo/ et /video/", () => {
    const html = `href="/@foo/photo/7594071018667265302"> <a href="/@foo/video/7615749056157027606">`;
    expect(extraireUrlsPostsHtml(html, "foo").sort()).toEqual([
      "https://www.tiktok.com/@foo/photo/7594071018667265302",
      "https://www.tiktok.com/@foo/video/7615749056157027606",
    ]);
  });
});

describe("extraireUrlsEmbedHtml", () => {
  it("extrait les liens embed @handle/video/", () => {
    const html = `
      <a target="_blank" href="https://www.tiktok.com/@infinitydream7/video/7594071018667265302?referer_url=&amp;ref=embed">
      <a href="https://www.tiktok.com/@infinitydream7/video/7615749056157027606">
    `;
    const urls = extraireUrlsEmbedHtml(html, "infinitydream7");
    expect(urls).toHaveLength(2);
    expect(urls).toContain(
      "https://www.tiktok.com/@infinitydream7/video/7594071018667265302",
    );
  });
});

describe("extraireErrorCodesApify", () => {
  it("lit PROFILE_EMPTY sur un item d'erreur", () => {
    expect(
      extraireErrorCodesApify([
        { errorCode: "PROFILE_EMPTY", input: "infinitydream7" },
      ]),
    ).toEqual(["PROFILE_EMPTY"]);
  });

  it("ignore un dataset de vrais posts", () => {
    expect(
      extraireErrorCodesApify([{ id: "1", webVideoUrl: "https://x" }]),
    ).toEqual([]);
  });
});

describe("echantillonClesItems", () => {
  it("dit dataset vide", () => {
    expect(echantillonClesItems([])).toBe("dataset vide");
  });

  it("liste les clés du premier item", () => {
    expect(echantillonClesItems([{ errorCode: "PROFILE_EMPTY", input: "x" }])).toBe(
      "errorCode,input",
    );
  });
});
