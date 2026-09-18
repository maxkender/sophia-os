import { describe, expect, it } from "vitest";

import { langueDepuisPays, languesReferencees } from "./paysLangue";

describe("langueDepuisPays", () => {
  it("rattache les pays RC aux langues OS", () => {
    expect(langueDepuisPays("France")).toBe("fr");
    expect(langueDepuisPays("Türkiye")).toBe("tr");
    expect(langueDepuisPays("Turkey")).toBe("tr");
    expect(langueDepuisPays("United Kingdom")).toBe("en");
    expect(langueDepuisPays("United States")).toBe("en");
    expect(langueDepuisPays("Poland")).toBe("pl");
    expect(langueDepuisPays("Germany")).toBe("de");
    expect(langueDepuisPays("Brazil")).toBe("pt");
    expect(langueDepuisPays("Denmark")).toBe("da");
    expect(langueDepuisPays("Norway")).toBe("no");
    expect(langueDepuisPays("Russia")).toBe("ru");
    expect(langueDepuisPays("Croatia")).toBe("hr");
    expect(langueDepuisPays("Slovenia")).toBe("sl");
    expect(langueDepuisPays("Slovakia")).toBe("sk");
    expect(langueDepuisPays("Serbia")).toBe("sr");
    expect(langueDepuisPays("Egypt")).toBe("ar");
    expect(langueDepuisPays("Saudi Arabia")).toBe("ar");
    expect(langueDepuisPays("United Arab Emirates")).toBe("ar");
    expect(langueDepuisPays("Israel")).toBe("he");
    expect(langueDepuisPays("Finland")).toBe("fi");
    expect(langueDepuisPays("Estonia")).toBe("et");
  });

  it("accepte déjà un code langue", () => {
    expect(langueDepuisPays("fr")).toBe("fr");
    expect(langueDepuisPays("TR")).toBe("tr");
  });

  it("ignore Other / Total / inconnu", () => {
    expect(langueDepuisPays("Other")).toBeNull();
    expect(langueDepuisPays("Total")).toBeNull();
    expect(langueDepuisPays("Japan")).toBeNull();
  });
});

describe("codes ISO-3166 : un segment à deux lettres est un PAYS", () => {
  it("les cinq collisions historiques sont résolues comme des pays", () => {
    // Avant : le code était lu comme une langue, donc AR → arabe, SV → suédois…
    expect(langueDepuisPays("AR")).toBe("es"); // Argentine, pas l'arabe
    expect(langueDepuisPays("SV")).toBe("es"); // Salvador, pas la Suède
    expect(langueDepuisPays("ET")).toBeNull(); // Éthiopie, pas l'Estonie
    expect(langueDepuisPays("SL")).toBeNull(); // Sierra Leone, pas la Slovénie
    expect(langueDepuisPays("SR")).toBeNull(); // Suriname, pas la Serbie
  });

  it("les vrais codes de nos marchés résolvent enfin", () => {
    // Avant : absents des deux tables, donc revenus non attribués.
    expect(langueDepuisPays("CZ")).toBe("cs");
    expect(langueDepuisPays("GR")).toBe("el");
    expect(langueDepuisPays("DK")).toBe("da");
    expect(langueDepuisPays("SE")).toBe("sv");
    expect(langueDepuisPays("RS")).toBe("sr");
    expect(langueDepuisPays("SI")).toBe("sl");
    expect(langueDepuisPays("EE")).toBe("et");
    expect(langueDepuisPays("IL")).toBe("he");
  });

  it("les autres codes marché restent corrects", () => {
    const attendu: Record<string, string> = {
      FR: "fr", GB: "en", US: "en", CA: "en", AU: "en", IE: "en",
      DE: "de", AT: "de", CH: "de", IT: "it", ES: "es", MX: "es",
      PT: "pt", BR: "pt", NL: "nl", BE: "nl", HU: "hu", PL: "pl",
      RO: "ro", TR: "tr", NO: "no", RU: "ru", HR: "hr", SK: "sk",
      EG: "ar", SA: "ar", AE: "ar", FI: "fi",
    };
    for (const [code, langue] of Object.entries(attendu)) {
      expect(langueDepuisPays(code), code).toBe(langue);
    }
  });

  it("les codes langue sans homonyme pays restent acceptés", () => {
    // en, cs, el, da, he ne sont PAS des codes ISO-3166 : aucune collision.
    expect(langueDepuisPays("en")).toBe("en");
    expect(langueDepuisPays("cs")).toBe("cs");
    expect(langueDepuisPays("el")).toBe("el");
    expect(langueDepuisPays("da")).toBe("da");
    expect(langueDepuisPays("he")).toBe("he");
  });

  it("le code pays l'emporte toujours sur le code langue homonyme", () => {
    // NO = Norvège ET code du norvégien : même réponse, pas de piège.
    expect(langueDepuisPays("NO")).toBe("no");
    // SE = Suède mais `sv` = suédois : c'est le pays qui décide.
    expect(langueDepuisPays("SE")).toBe("sv");
  });
});

describe("noms de pays", () => {
  it("couvre les libellés ajoutés", () => {
    expect(langueDepuisPays("El Salvador")).toBe("es");
    expect(langueDepuisPays("Czechia")).toBe("cs");
    expect(langueDepuisPays("Sverige")).toBe("sv");
    expect(langueDepuisPays("New Zealand")).toBe("en");
    expect(langueDepuisPays("England")).toBe("en");
  });

  it("résout la Bulgarie, dont le code pays et le code langue coïncident", () => {
    expect(langueDepuisPays("BG")).toBe("bg");
    expect(langueDepuisPays("Bulgaria")).toBe("bg");
  });

  it("garde la règle majoritaire assumée sur les pays multilingues", () => {
    // Choix produit, pas un oubli : RC ne découpe pas par langue.
    expect(langueDepuisPays("Belgium")).toBe("nl");
    expect(langueDepuisPays("Switzerland")).toBe("de");
    expect(langueDepuisPays("Canada")).toBe("en");
    expect(langueDepuisPays("Austria")).toBe("de");
  });
});

describe("intégrité des tables", () => {
  it("toute langue référencée est une langue cible de l'OS", () => {
    expect(languesReferencees()).toEqual([]);
  });

  it("ne rend jamais autre chose qu'une langue ou null", () => {
    for (const entree of ["", "  ", "Total", "Unknown", "ZZ", "123"]) {
      const r = langueDepuisPays(entree);
      expect(r === null || /^[a-z]{2}$/.test(r), entree).toBe(true);
    }
  });
});
