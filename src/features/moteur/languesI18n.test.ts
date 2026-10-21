import { afterAll, describe, expect, it } from "vitest";

import i18next from "@/locales";
import { en } from "@/locales/en";
import { fr } from "@/locales/fr";

import { LANGUES_CIBLES, nomLangue, nomPays } from "./langues";

/**
 * `nomLangue` et `nomPays` rendaient des tables françaises en dur : le
 * sélecteur FR/EN de l'AppShell traduisait toute la page SAUF la liste des
 * langues, qui restait « Anglais, Allemand, Tchèque » pour un utilisateur
 * anglophone. Ces tests tiennent les deux bouts : la couverture des libellés
 * et le fait qu'ils suivent bien le sélecteur.
 */
describe("libellés de langue et de pays", () => {
  afterAll(async () => {
    await i18next.changeLanguage("fr");
  });

  it("chaque langue cible a un libellé FR et EN, langue comme pays", () => {
    for (const code of LANGUES_CIBLES) {
      for (const [nom, paquet] of [
        ["fr", fr],
        ["en", en],
      ] as const) {
        expect(paquet.translation.langues[code], `langues.${code} manque en ${nom}`).toBeTruthy();
        expect(paquet.translation.pays[code], `pays.${code} manque en ${nom}`).toBeTruthy();
      }
    }
  });

  it("suit le sélecteur FR/EN", async () => {
    await i18next.changeLanguage("fr");
    expect(nomLangue("de")).toBe("Allemand");
    expect(nomPays("en")).toBe("Royaume-Uni");

    await i18next.changeLanguage("en");
    expect(nomLangue("de")).toBe("German");
    expect(nomPays("en")).toBe("United Kingdom");
  });

  it("nomme la région des variantes dans les deux langues", async () => {
    await i18next.changeLanguage("fr");
    expect(nomLangue("es-419")).toBe("Espagnol (Amérique latine)");
    expect(nomPays("pt-BR")).toBe("Brésil");

    await i18next.changeLanguage("en");
    expect(nomLangue("es-419")).toBe("Spanish (Latin America)");
    expect(nomPays("pt-BR")).toBe("Brazil");
  });

  it("un code inconnu rend le code, jamais la clé i18n brute", async () => {
    await i18next.changeLanguage("en");
    expect(nomLangue("xx")).toBe("XX");
    expect(nomPays("xx")).toBe("XX");
  });
});
