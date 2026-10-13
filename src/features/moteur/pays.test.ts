import { afterAll, describe, expect, it } from "vitest";

import i18next from "@/locales";

import { LANGUES_CIBLES } from "./langues";
import {
  PAYS_ISO,
  PAYS_PAR_DEFAUT_LANGUE,
  drapeauPays,
  estCodePays,
  nomPaysIso,
  paysParDefaut,
  paysTries,
} from "./pays";

/**
 * Le défaut que ce module corrige : `PAYS_OS = LANGUES_CIBLES`, donc un code
 * de langue servait de pays et les cinq marchés anglophones partageaient le
 * drapeau 🇬🇧. Impossible de voir où était un posteur.
 */
describe("drapeau et nom d'un pays", () => {
  afterAll(async () => {
    await i18next.changeLanguage("fr");
  });

  it("donne un drapeau DISTINCT à chaque marché anglophone", () => {
    const anglophones = ["GB", "US", "AU", "NZ", "IE", "CA"];
    const drapeaux = anglophones.map(drapeauPays);
    expect(new Set(drapeaux).size).toBe(anglophones.length);
    for (const d of drapeaux) expect(d).not.toBe("");
    expect(drapeauPays("AU")).toBe("🇦🇺");
    expect(drapeauPays("BR")).toBe("🇧🇷");
  });

  it("ne rend rien pour un code qui n'est pas un pays", () => {
    expect(drapeauPays("xx")).toBe("");
    expect(drapeauPays("en")).toBe("");
    expect(drapeauPays(null)).toBe("");
    expect(drapeauPays("")).toBe("");
    expect(estCodePays("FR")).toBe(true);
    expect(estCodePays("fr")).toBe(false);
    expect(estCodePays("ZZ")).toBe(false);
  });

  it("nomme le pays dans la langue de l'interface", async () => {
    await i18next.changeLanguage("fr");
    expect(nomPaysIso("AU")).toBe("Australie");
    expect(nomPaysIso("BR")).toBe("Brésil");

    await i18next.changeLanguage("en");
    expect(nomPaysIso("AU")).toBe("Australia");
    expect(nomPaysIso("BR")).toBe("Brazil");
  });

  it("trie la liste par nom, dans la langue de l'interface", async () => {
    await i18next.changeLanguage("en");
    const liste = paysTries();
    expect(liste.length).toBe(PAYS_ISO.length);
    const noms = liste.map((p) => p.nom);
    expect([...noms].sort((a, b) => a.localeCompare(b, "en"))).toEqual(noms);
    expect(liste.some((p) => p.code === "US")).toBe(true);
  });

  it("porte les 249 codes ISO-3166-1, sans aucune exclusion", () => {
    // Une liste de référence amputée ne se lit pas comme un choix éditorial,
    // elle se lit comme un bug : l'Australie et la Nouvelle-Zélande avaient
    // été signalées manquantes. Elle se tient entière ou pas du tout.
    expect(PAYS_ISO.length).toBe(249);
    expect(new Set(PAYS_ISO).size).toBe(249);
    for (const code of ["GB", "US", "AU", "NZ", "IE", "CA", "BR", "MX", "CH", "AT", "AE"]) {
      expect(PAYS_ISO, code).toContain(code);
    }
    // Y compris les territoires sans population permanente, retirés un temps.
    for (const code of ["AQ", "BV", "HM", "TF", "UM", "GS", "CC", "CX", "NF", "PN", "SJ", "IO"]) {
      expect(PAYS_ISO, code).toContain(code);
    }
    for (const code of PAYS_ISO) expect(code, code).toMatch(/^[A-Z]{2}$/);
  });
});

describe("pays déduit de la langue", () => {
  it("laisse SANS défaut les langues parlées dans plusieurs de nos marchés", () => {
    // Un défaut faux est pire qu'un champ vide : c'est au HM de trancher.
    expect(paysParDefaut("en")).toBeNull();
    expect(paysParDefaut("ar")).toBeNull();
    expect(paysParDefaut("es-419")).toBeNull();
  });

  it("déduit le pays des langues qui ne désignent qu'un marché", () => {
    expect(paysParDefaut("fr")).toBe("FR");
    expect(paysParDefaut("pt")).toBe("PT");
    expect(paysParDefaut("pt-BR")).toBe("BR");
    expect(paysParDefaut("es")).toBe("ES");
    expect(paysParDefaut("bg")).toBe("BG");
    expect(paysParDefaut(null)).toBeNull();
  });

  it("ne propose que des codes ISO réels, et couvre tout le reste des langues", () => {
    const sansDefaut = ["en", "ar", "es-419"];
    for (const code of LANGUES_CIBLES) {
      const pays = paysParDefaut(code);
      if (sansDefaut.includes(code)) {
        expect(pays, code).toBeNull();
      } else {
        expect(pays, `${code} n'a pas de pays par défaut`).toBeTruthy();
        expect(PAYS_ISO, `${code} → ${pays}`).toContain(pays);
      }
    }
    for (const pays of Object.values(PAYS_PAR_DEFAUT_LANGUE)) {
      expect(estCodePays(pays), pays).toBe(true);
    }
  });
});
