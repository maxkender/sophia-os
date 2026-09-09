import { describe, expect, it } from "vitest";

import { idTiktokDepuisUrl, urlEmbedTiktok } from "./tiktokEmbed";

describe("tiktokEmbed", () => {
  it("extrait l'id d'un photo ou d'une vidéo", () => {
    expect(idTiktokDepuisUrl("https://www.tiktok.com/@src/photo/7123456789")).toBe("7123456789");
    expect(idTiktokDepuisUrl("https://www.tiktok.com/@src/video/7990000000000000000?x=1")).toBe(
      "7990000000000000000",
    );
  });

  it("refuse un profil ou un lien court", () => {
    expect(idTiktokDepuisUrl("https://www.tiktok.com/@src")).toBeNull();
    expect(idTiktokDepuisUrl("https://vm.tiktok.com/ZMabcdef")).toBeNull();
    expect(idTiktokDepuisUrl(null)).toBeNull();
  });

  it("construit l'URL d'embed v2", () => {
    expect(urlEmbedTiktok("https://www.tiktok.com/@src/photo/7123")).toBe(
      "https://www.tiktok.com/embed/v2/7123",
    );
    expect(urlEmbedTiktok("https://www.tiktok.com/@src")).toBeNull();
  });
});
