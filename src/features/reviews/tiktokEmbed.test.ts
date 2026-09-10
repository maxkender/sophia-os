import { describe, expect, it } from "vitest";

import { idTiktokDepuisUrl, urlEmbedTiktok, estLienCourtTiktok, besoinResoudreTiktok } from "./tiktokEmbed";

describe("tiktokEmbed", () => {
  it("extrait l'id d'un photo ou d'une vidéo", () => {
    expect(idTiktokDepuisUrl("https://www.tiktok.com/@src/photo/7123456789")).toBe("7123456789");
    expect(idTiktokDepuisUrl("https://www.tiktok.com/@src/video/7990000000000000000?x=1")).toBe(
      "7990000000000000000",
    );
    expect(idTiktokDepuisUrl("https://m.tiktok.com/v/7123456789.html")).toBe("7123456789");
    expect(idTiktokDepuisUrl("https://www.tiktok.com/share?item_id=7123456789")).toBe("7123456789");
  });

  it("refuse un profil (sans id)", () => {
    expect(idTiktokDepuisUrl("https://www.tiktok.com/@src")).toBeNull();
    expect(idTiktokDepuisUrl("https://vm.tiktok.com/ZMabcdef")).toBeNull();
    expect(idTiktokDepuisUrl(null)).toBeNull();
  });

  it("détecte un lien court à résoudre", () => {
    expect(estLienCourtTiktok("https://vm.tiktok.com/ZMabcdef")).toBe(true);
    expect(estLienCourtTiktok("https://vt.tiktok.com/ZSTD5bW7/")).toBe(true);
    expect(estLienCourtTiktok("https://www.tiktok.com/t/ZTxxxxxxx/")).toBe(true);
    expect(estLienCourtTiktok("https://www.tiktok.com/@src/photo/7123")).toBe(false);
    expect(besoinResoudreTiktok("https://vm.tiktok.com/ZMabcdef")).toBe(true);
    expect(besoinResoudreTiktok("https://www.tiktok.com/@src/photo/7123")).toBe(false);
    expect(besoinResoudreTiktok("https://www.tiktok.com/@src")).toBe(true);
  });

  it("construit l'URL d'embed v2", () => {
    expect(urlEmbedTiktok("https://www.tiktok.com/@src/photo/7123")).toBe(
      "https://www.tiktok.com/embed/v2/7123",
    );
    expect(urlEmbedTiktok("https://www.tiktok.com/@src")).toBeNull();
  });
});
