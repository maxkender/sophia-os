import { describe, expect, it } from "vitest";

import { EMOJIS_BIO, PHRASES_BIO } from "../../../supabase/functions/_shared/persona_bios";
import {
  MOTS_PAR_THEME,
  MOTS_UNIVERSELS,
  NOMS_PAR_LANGUE,
} from "../../../supabase/functions/_shared/persona_donnees";

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
// quelle que soit l'application promue : les listes doivent couvrir chaque
// langue cible, sinon un compte créé dans une langue oubliée reçoit des
// prénoms, des mots et une bio en anglais.
describe("identité Sophia", () => {
  it("couvre chaque langue cible : prénoms, noms, mots de chaque thème, bios", () => {
    const themes = Object.keys(MOTS_PAR_THEME);
    expect(themes).toEqual(Object.keys(MOTS_UNIVERSELS));
    for (const code of LANGUES_CIBLES) {
      const jeu = NOMS_PAR_LANGUE[code];
      expect(jeu, `prénoms ${code}`).toBeDefined();
      expect(jeu!.prenomsH.length, `prénoms H ${code}`).toBeGreaterThanOrEqual(40);
      expect(jeu!.prenomsF.length, `prénoms F ${code}`).toBeGreaterThanOrEqual(40);
      expect(jeu!.noms.length, `noms ${code}`).toBeGreaterThanOrEqual(20);
      for (const theme of themes) {
        const mots = MOTS_PAR_THEME[theme as keyof typeof MOTS_PAR_THEME][code];
        expect(mots?.length ?? 0, `${theme}.${code}`).toBeGreaterThanOrEqual(10);
      }
      for (const phrases of Object.values(PHRASES_BIO[code] ?? {})) {
        expect(phrases.length, `bios ${code}`).toBeGreaterThanOrEqual(3);
      }
      expect(Object.keys(PHRASES_BIO[code] ?? {}), `bios ${code}`).toEqual(
        Object.keys(EMOJIS_BIO),
      );
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
