import { describe, expect, it } from "vitest";

import {
  SEUIL_STOCK_SOURCE,
  compteIdDepuisListingUrl,
  cleI18nEtatStock,
  etatStockSource,
} from "./stockSource";

describe("compteIdDepuisListingUrl", () => {
  it("extrait le compte d'une URL listing", () => {
    expect(
      compteIdDepuisListingUrl(
        "listing://412cb1d1-951c-4167-9460-b6f5e3c91efd/358c50e6-e6db-4a35-980a-7519a6543442",
      ),
    ).toBe("412cb1d1-951c-4167-9460-b6f5e3c91efd");
  });

  it("ignore une URL TikTok", () => {
    expect(
      compteIdDepuisListingUrl("https://www.tiktok.com/@infinitydream7/photo/1"),
    ).toBeNull();
  });
});

describe("etatStockSource", () => {
  it("priorise l'import en cours même si stock = 0", () => {
    expect(
      etatStockSource({
        stock: 0,
        importEnCours: true,
        aDejaDeLaMatiere: false,
      }),
    ).toBe("import_en_cours");
  });

  it("ne dit pas épuisé si rien n'a jamais été importé", () => {
    expect(
      etatStockSource({
        stock: 0,
        importEnCours: false,
        aDejaDeLaMatiere: false,
      }),
    ).toBe("jamais_extrait");
  });

  it("dit épuisé seulement après de la matière consommée", () => {
    expect(
      etatStockSource({
        stock: 0,
        importEnCours: false,
        aDejaDeLaMatiere: true,
      }),
    ).toBe("epuise");
  });

  it("signale un stock faible sous le seuil", () => {
    expect(
      etatStockSource({
        stock: SEUIL_STOCK_SOURCE - 1,
        importEnCours: false,
        aDejaDeLaMatiere: true,
      }),
    ).toBe("faible");
  });

  it("est ok au seuil et au-dessus", () => {
    expect(
      etatStockSource({
        stock: SEUIL_STOCK_SOURCE,
        importEnCours: false,
        aDejaDeLaMatiere: true,
      }),
    ).toBe("ok");
  });
});

describe("cleI18nEtatStock", () => {
  it("n'affiche pas de warning si le stock est ok", () => {
    expect(cleI18nEtatStock("ok")).toBeNull();
  });

  it("pointe Extraire, pas un conjoint, si rien n'est importé", () => {
    expect(cleI18nEtatStock("jamais_extrait")).toBe(
      "sources.stockJamaisExtrait",
    );
  });
});
