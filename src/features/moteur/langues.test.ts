import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  canoniserLangue,
  LANGUES_CIBLES,
  LANGUES_RTL,
  classeDirectionTexte,
  contientLettresRtl,
  directionTexte,
  drapeauLangue,
  estLangueRtl,
  nomLangue,
  nomPays,
} from "./langues";

describe("LANGUES_CIBLES", () => {
  it("inclut les 11 nouvelles langues cibles", () => {
    for (const code of ["da", "no", "ru", "hr", "sl", "sk", "sr", "ar", "he", "fi", "et"]) {
      expect(LANGUES_CIBLES).toContain(code);
    }
  });

  it("inclut le bulgare", () => {
    expect(LANGUES_CIBLES).toContain("bg");
  });

  it("a un pays OS pour chaque code", () => {
    expect(nomPays("ar")).toBe("Égypte");
    expect(nomPays("he")).toBe("Israël");
    expect(nomPays("sr")).toBe("Serbie");
    expect(nomPays("da")).toBe("Danemark");
    expect(nomPays("bg")).toBe("Bulgarie");
  });
});

describe("variantes régionales", () => {
  it("expose l'Amérique latine et le Brésil comme langues cibles", () => {
    expect(LANGUES_CIBLES).toContain("es-419");
    expect(LANGUES_CIBLES).toContain("pt-BR");
  });

  it("garde la variante d'Europe distincte de celle des Amériques", () => {
    expect(nomPays("es")).toBe("Espagne");
    expect(nomPays("es-419")).toBe("Amérique latine");
    expect(nomPays("pt")).toBe("Portugal");
    expect(nomPays("pt-BR")).toBe("Brésil");
  });

  it("nomme la région dans le libellé, pour qu'un recruteur ne confonde pas", () => {
    expect(nomLangue("es")).toBe("Espagnol (Espagne)");
    expect(nomLangue("es-419")).toBe("Espagnol (Amérique latine)");
    expect(nomLangue("pt")).toBe("Portugais (Portugal)");
    expect(nomLangue("pt-BR")).toBe("Portugais (Brésil)");
  });

  it("donne un drapeau propre à chaque variante", () => {
    const codes = ["es", "es-419", "pt", "pt-BR"];
    const drapeaux = codes.map(drapeauLangue);
    expect(new Set(drapeaux).size).toBe(codes.length);
    for (const d of drapeaux) expect(d).not.toBe("");
  });

  it("reste LTR : une variante régionale n'est pas une écriture différente", () => {
    expect(estLangueRtl("es-419")).toBe(false);
    expect(estLangueRtl("pt-BR")).toBe(false);
    expect(directionTexte("pt-BR", "Quer aprender algo novo?")).toBe("ltr");
  });
});

describe("RTL contenu", () => {
  it("marque arabe et hébreu comme langues RTL", () => {
    expect([...LANGUES_RTL]).toEqual(["ar", "he"]);
    expect(estLangueRtl("ar")).toBe(true);
    expect(estLangueRtl("he")).toBe(true);
    expect(estLangueRtl("fr")).toBe(false);
    expect(estLangueRtl("sr")).toBe(false);
  });

  it("détecte les lettres arabes et hébraïques", () => {
    expect(contientLettresRtl("مرحبا")).toBe(true);
    expect(contientLettresRtl("שלום")).toBe(true);
    expect(contientLettresRtl("hello #fyp")).toBe(false);
    expect(contientLettresRtl("prosto savet")).toBe(false);
  });

  it("aligne à droite seulement le contenu RTL, pas le latin", () => {
    expect(directionTexte("ar", "نصيحة سريعة")).toBe("rtl");
    expect(directionTexte("he", "טיפ מהיר")).toBe("rtl");
    expect(directionTexte("ar", "#fyp #booktok")).toBe("ltr");
    expect(directionTexte("fr", "שלום")).toBe("rtl");
    expect(directionTexte("ar", "")).toBe("rtl");
    expect(directionTexte("fr", "")).toBe("ltr");
    expect(classeDirectionTexte("he", "שלום")).toBe("text-right");
    expect(classeDirectionTexte("ar", "hello")).toBe("text-left");
  });
});

describe("canoniserLangue", () => {
  it("rend le code canonique quelle que soit la casse", () => {
    expect(canoniserLangue("pt-br")).toBe("pt-BR");
    expect(canoniserLangue(" PT-BR ")).toBe("pt-BR");
    expect(canoniserLangue("ES-419")).toBe("es-419");
    expect(canoniserLangue("FR")).toBe("fr");
    expect(canoniserLangue("pt")).toBe("pt");
  });

  it("inconnu en minuscules, vide reste vide", () => {
    expect(canoniserLangue("XX")).toBe("xx");
    expect(canoniserLangue("")).toBe("");
    expect(canoniserLangue(null)).toBe("");
  });

  it("la copie Deno a la même liste", () => {
    const deno = readFileSync("supabase/functions/_shared/langues_cibles.ts", "utf8");
    const liste = deno.slice(deno.indexOf("LANGUES_CIBLES = ["), deno.indexOf("] as const"));
    expect([...liste.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual([...LANGUES_CIBLES]);
  });
});
