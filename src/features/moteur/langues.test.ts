import { describe, expect, it } from "vitest";

import { LANGUES_CIBLES, nomLangue } from "./langues";

describe("nomLangue", () => {
  it("affiche les noms en français par défaut", () => {
    expect(nomLangue("fr", "fr")).toBe("Français");
    expect(nomLangue("en", "fr")).toBe("Anglais");
    expect(nomLangue("de", "fr")).toBe("Allemand");
    expect(nomLangue("nl", "fr")).toBe("Néerlandais");
  });

  it("affiche les noms en anglais quand la locale UI est en", () => {
    expect(nomLangue("fr", "en")).toBe("French");
    expect(nomLangue("en", "en")).toBe("English");
    expect(nomLangue("de", "en")).toBe("German");
    expect(nomLangue("nl", "en")).toBe("Dutch");
    expect(nomLangue("cs", "en")).toBe("Czech");
    expect(nomLangue("el", "en")).toBe("Greek");
    expect(nomLangue("hu", "en")).toBe("Hungarian");
    expect(nomLangue("pl", "en")).toBe("Polish");
    expect(nomLangue("ro", "en")).toBe("Romanian");
    expect(nomLangue("sv", "en")).toBe("Swedish");
    expect(nomLangue("tr", "en")).toBe("Turkish");
    expect(nomLangue("it", "en")).toBe("Italian");
    expect(nomLangue("es", "en")).toBe("Spanish");
    expect(nomLangue("pt", "en")).toBe("Portuguese");
  });

  it("couvre chaque langue cible dans les deux locales", () => {
    for (const code of LANGUES_CIBLES) {
      expect(nomLangue(code, "fr")).not.toBe(code.toUpperCase());
      expect(nomLangue(code, "en")).not.toBe(code.toUpperCase());
    }
  });

  it("renvoie le code en majuscules si la langue est inconnue", () => {
    expect(nomLangue("xx", "en")).toBe("XX");
    expect(nomLangue("xx", "fr")).toBe("XX");
  });
});
