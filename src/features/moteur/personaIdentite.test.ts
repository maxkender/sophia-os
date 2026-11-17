import { describe, expect, it } from "vitest";

import { themeDuLabel, themeMotsDuLabel } from "../../../supabase/functions/_shared/label_theme";
import { BIO_MAX, composerBio } from "../../../supabase/functions/_shared/persona_bios";
import {
  MOTS_PAR_THEME,
  MOTS_UNIVERSELS,
  NOMS_PAR_LANGUE,
} from "../../../supabase/functions/_shared/persona_donnees";
import {
  HANDLE_MAX,
  composerIdentite,
  motsDuHandle,
  racineHandle,
} from "../../../supabase/functions/_shared/persona_identite";
import { LANGUES_CIBLES } from "./langues";

/** Hasard reproductible (mulberry32). */
function hasardFixe(graine: number): () => number {
  let a = graine;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LABELS = ["alpha_male", "smart_girl", "RH", "clean_study", "psychologiefaits", "Plony", "Dorian", null];

describe("thème des mots", () => {
  it("donne leurs propres mots aux labels d'études, de carrière, de psycho et de philo", () => {
    expect(themeMotsDuLabel("clean_study")).toBe("etude");
    expect(themeMotsDuLabel("that_girl_study")).toBe("etude");
    expect(themeMotsDuLabel("RH")).toBe("carriere");
    expect(themeMotsDuLabel("psychologiefaits")).toBe("psycho");
    expect(themeMotsDuLabel("mentalmaxxing")).toBe("psycho");
    expect(themeMotsDuLabel("Plony")).toBe("philo");
    expect(themeMotsDuLabel("alpha_male_yellow")).toBe("alpha_male");
    expect(themeMotsDuLabel("beau_smart_girl")).toBe("smart_girl");
    expect(themeMotsDuLabel("Dorian")).toBe("default");
  });

  it("ne change pas le thème qui règle le genre et la photo de profil", () => {
    expect(themeDuLabel("clean_study")).toBe("clean_girl");
    expect(themeDuLabel("RH")).toBe("default");
  });
});

describe("listes de l'identité", () => {
  it("n'a que des morceaux de @ valides, sans doublon", () => {
    const listes: string[][] = [...Object.values(MOTS_UNIVERSELS)];
    for (const jeu of Object.values(NOMS_PAR_LANGUE)) {
      listes.push(jeu.prenomsH, jeu.prenomsF, jeu.noms);
    }
    for (const parLangue of Object.values(MOTS_PAR_THEME)) {
      listes.push(...Object.values(parLangue));
    }
    for (const liste of listes) {
      expect(new Set(liste).size).toBe(liste.length);
      for (const mot of liste) expect(mot).toMatch(/^[a-z0-9]{2,}$/);
    }
  });

  it("offre au moins 900 racines de @ par langue, genre et thème", () => {
    for (const langue of LANGUES_CIBLES) {
      for (const label of LABELS) {
        const { locaux, universels } = motsDuHandle(label, langue);
        const mots = locaux.length + universels.length;
        expect(40 * mots, `${label} ${langue}`).toBeGreaterThanOrEqual(900);
      }
    }
  });
});

describe("composerIdentite", () => {
  it("rend un @ valide, un nom et une bio dans chaque langue et pour chaque label", () => {
    const hasard = hasardFixe(7);
    for (const langue of LANGUES_CIBLES) {
      for (const label of LABELS) {
        for (const genre of ["homme", "femme"] as const) {
          for (let i = 0; i < 20; i += 1) {
            const id = composerIdentite(
              { langue, genre, labelNom: label, racinesPrises: new Set(), nomsPris: new Set(), annee: 2026 },
              hasard,
            );
            expect(id.handle).toMatch(/^[a-z0-9]+\.[a-z0-9]+[1-9]\d{2}$/);
            expect(id.handle.length).toBeLessThanOrEqual(HANDLE_MAX);
            expect(id.nom).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
            expect(id.bio.length).toBeGreaterThan(0);
            expect([...id.bio].length).toBeLessThanOrEqual(BIO_MAX);
          }
        }
      }
    }
  });

  it("ne reprend jamais une racine de @ déjà prise tant qu'il en reste", () => {
    const hasard = hasardFixe(11);
    const racinesPrises = new Set<string>();
    for (let i = 0; i < 800; i += 1) {
      const { handle } = composerIdentite(
        { langue: "de", genre: "homme", labelNom: "alpha_male", racinesPrises, nomsPris: new Set(), annee: 2026 },
        hasard,
      );
      const racine = racineHandle(handle);
      expect(racinesPrises.has(racine)).toBe(false);
      racinesPrises.add(racine);
    }
  });

  it("tire des @ et des bios variés", () => {
    const hasard = hasardFixe(3);
    const mots = new Set<string>();
    const prenoms = new Set<string>();
    const bios = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      const id = composerIdentite(
        { langue: "fr", genre: "femme", labelNom: "RH", racinesPrises: new Set(), nomsPris: new Set(), annee: 2026 },
        hasard,
      );
      const [prenom, mot] = racineHandle(id.handle).split(".");
      prenoms.add(prenom!);
      mots.add(mot!);
      bios.add(id.bio);
    }
    expect(prenoms.size).toBeGreaterThanOrEqual(35);
    expect(mots.size).toBeGreaterThanOrEqual(25);
    expect(bios.size).toBeGreaterThanOrEqual(150);
  });
});

describe("composerBio", () => {
  it("écrit la phrase dans la langue du compte et l'anglais pour une langue inconnue", () => {
    const hasard = hasardFixe(5);
    const bios = Array.from({ length: 200 }, () =>
      composerBio({ prenom: "noam", langue: "he", theme: "default", annee: 2026 }, hasard),
    );
    expect(bios.some((b) => /[֐-׿]/.test(b))).toBe(true);
    const inconnue = Array.from({ length: 200 }, () =>
      composerBio({ prenom: "ana", langue: "xx", theme: "etude", annee: 2026 }, hasard),
    );
    expect(inconnue.some((b) => b.includes("library regular"))).toBe(true);
  });
});
