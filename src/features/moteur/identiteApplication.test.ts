import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { LANGUES_CIBLES, langueInitiale } from "./langues";
import {
  avecFileLabelsApplication,
  clePromptPertinence,
  clePromptPlacement,
  estSlugApplicationValide,
  fileLabelsDeLApplication,
  nomApplication,
  normaliserSlugApplication,
} from "./applications";

describe("langue initiale", () => {
  it("prend fr dès le chargement, sans aller-retour sur une autre langue", () => {
    expect(langueInitiale(["fr", "en", "de"], "")).toBe("fr");
    expect(langueInitiale(["en", "de"], "")).toBe("en");
    expect(langueInitiale(["fr", "en"], "en")).toBe("en");
    expect(langueInitiale([], "")).toBe("");
  });
});

// L'identité d'un compte (prénom, @, bio) est Sophia pour TOUS les comptes,
// quelle que soit l'application promue : persona.ts doit couvrir chaque langue
// cible, sinon un compte créé dans une langue oubliée reçoit des prénoms
// anglais.
describe("identité Sophia", () => {
  it("aligne persona.ts (Sophia) sur les mêmes langues cibles", () => {
    const src = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/persona.ts"),
      "utf8",
    );
    const themes = ["alpha_male", "smart_girl", "clean_girl", "cinema", "anciens", "default"];
    for (const code of LANGUES_CIBLES) {
      expect(src, `prénoms ${code}`).toMatch(new RegExp(`\\n  ${code}: \\{\\n    prenomsH:`));
      for (const theme of themes) {
        const start = src.indexOf(`  ${theme}: {`);
        expect(start, theme).toBeGreaterThan(-1);
        const bloc = src.slice(start, start + 8000);
        expect(bloc, `${theme}.${code}`).toMatch(new RegExp(`\\n    ${code}: \\[`));
      }
    }
  });
});

describe("applications", () => {
  it("valide et normalise un slug", () => {
    expect(normaliserSlugApplication(" UnSwipe ")).toBe("unswipe");
    expect(estSlugApplicationValide("unswipe")).toBe(true);
    expect(estSlugApplicationValide("1bad")).toBe(false);
  });

  it("nomme une application, Sophia par défaut", () => {
    expect(nomApplication({ nom: "Unswipe", slug: "unswipe" })).toBe("Unswipe");
    expect(nomApplication({ nom: "", slug: "sophia" })).toBe("Sophia");
    expect(nomApplication({ nom: null, slug: "unswipe" })).toBe("unswipe");
  });

  it("résout les clés de prompts", () => {
    expect(clePromptPertinence("sophia")).toBe("pertinence");
    expect(clePromptPertinence("unswipe")).toBe("pertinence_unswipe");
    expect(clePromptPlacement("sophia")).toBe("placement_sophia");
    expect(clePromptPlacement("unswipe")).toBe("placement_unswipe");
  });

  it("réécrit la file Sophia à la racine ET dans sa tranche", () => {
    const file = {
      items: [{ label_id: "ancien", ugc: false }],
      par_langue: { fr: [{ label_id: "ancien-fr", ugc: false }] },
    };
    const next = avecFileLabelsApplication(file, "sophia", {
      items: [{ label_id: "sophia-1", ugc: true }],
      par_langue: {} as typeof file.par_langue,
    });
    // Racine = format historique, lu par le bundle figé de manage-users.
    expect(next.items[0]?.label_id).toBe("sophia-1");
    expect(next.par_application.sophia?.items[0]?.label_id).toBe("sophia-1");
    expect(fileLabelsDeLApplication(next, "sophia").items[0]?.label_id).toBe("sophia-1");
    // Sans tranche, Sophia retombe sur la racine ; une autre application, sur rien.
    expect(fileLabelsDeLApplication(file, "sophia").items[0]?.label_id).toBe("ancien");
    expect(fileLabelsDeLApplication(file, "unswipe").items).toEqual([]);
  });
});
