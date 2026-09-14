import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  LANGUES_CIBLES,
  LANGUES_RTL,
  classeDirectionTexte,
  contientLettresRtl,
  directionTexte,
  estLangueRtl,
  nomPays,
} from "./langues";

describe("LANGUES_CIBLES", () => {
  it("inclut les 11 nouvelles langues cibles", () => {
    for (const code of ["da", "no", "ru", "hr", "sl", "sk", "sr", "ar", "he", "fi", "et"]) {
      expect(LANGUES_CIBLES).toContain(code);
    }
  });

  it("a un pays OS pour chaque code", () => {
    expect(nomPays("ar")).toBe("Égypte");
    expect(nomPays("he")).toBe("Israël");
    expect(nomPays("sr")).toBe("Serbie");
    expect(nomPays("da")).toBe("Danemark");
  });

  it("a un CTA Sophia natif pour chaque LANGUES_CIBLES", () => {
    const src = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/applications.ts"),
      "utf8",
    );
    const sophia = src.split("slug === SLUG_MICABO")[1] ?? src;
    const bloc = sophia.match(/const par: Record<string, string> = \{([\s\S]*?)\n  \};/);
    expect(bloc).toBeTruthy();
    const cles = [...(bloc![1].matchAll(/^\s{4}([a-z]{2}):/gm))].map((m) => m[1]);
    for (const code of LANGUES_CIBLES) {
      expect(cles, `CTA Sophia manquant pour ${code}`).toContain(code);
    }
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
