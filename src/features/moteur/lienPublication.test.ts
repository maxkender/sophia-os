import { describe, expect, it, vi } from "vitest";

import { dateDepuisErreurLienDejaUtilise, lienPourEnregistrement } from "./lienPublication";

describe("lienPublication", () => {
  it("remplace un lien court par le lien complet du post, sans les paramètres de partage", async () => {
    const resoudre = vi.fn().mockResolvedValue({
      url: "https://www.tiktok.com/@mia.thrives282/photo/7696664996339551509?_r=1&_t=ZS-9AYo2OQidmO",
      id: "7696664996339551509",
    });
    await expect(lienPourEnregistrement(" https://vt.tiktok.com/ZSgd21rcU/ ", resoudre)).resolves.toBe(
      "https://www.tiktok.com/@mia.thrives282/photo/7696664996339551509",
    );
    expect(resoudre).toHaveBeenCalledWith("https://vt.tiktok.com/ZSgd21rcU/");
  });

  it("garde le lien tel quel quand il est complet ou que la résolution échoue", async () => {
    const resoudre = vi.fn().mockRejectedValue(new Error("403"));
    await expect(
      lienPourEnregistrement("https://www.tiktok.com/@x/photo/123", resoudre),
    ).resolves.toBe("https://www.tiktok.com/@x/photo/123");
    expect(resoudre).not.toHaveBeenCalled();
    await expect(lienPourEnregistrement("https://vm.tiktok.com/ABC/", resoudre)).resolves.toBe(
      "https://vm.tiktok.com/ABC/",
    );
    const sansId = vi.fn().mockResolvedValue({ url: "https://www.tiktok.com/", id: null });
    await expect(lienPourEnregistrement("https://vm.tiktok.com/ABC/", sansId)).resolves.toBe(
      "https://vm.tiktok.com/ABC/",
    );
  });

  it("lit la date du post en double dans le refus du serveur, objet PostgREST compris", () => {
    expect(
      dateDepuisErreurLienDejaUtilise({
        message:
          "LIEN_DEJA_UTILISE:15/10 01:11 — ce lien TikTok est déjà celui d'un autre slideshow de ce compte (déclaré le 15/10 01:11) : colle le lien du post de CE slideshow",
      }),
    ).toBe("15/10 01:11");
    expect(dateDepuisErreurLienDejaUtilise(new Error("DELAI_ENTRE_PUBLICATIONS:12"))).toBeNull();
  });
});
