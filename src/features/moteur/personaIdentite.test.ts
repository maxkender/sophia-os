import { describe, expect, it } from "vitest";

import { themeDuLabel, themeMotsDuLabel } from "../../../supabase/functions/_shared/label_theme";
import { BIO_MAX, composerBio } from "../../../supabase/functions/_shared/persona_bios";
import {
  MOTS_PAR_THEME,
  MOTS_UNIVERSELS,
  NOMS_PAR_LANGUE,
} from "../../../supabase/functions/_shared/persona_donnees";
import {
  HANDLE_VALIDE,
  MOTS_APRES_PRENOM,
  MOTS_QUOTIDIEN,
  MOTS_QUOTIDIEN_F,
  MOTS_QUOTIDIEN_H,
  squelette,
  tirerHandleVarie,
  tirerNombre,
} from "../../../supabase/functions/_shared/persona_handles_varies";
import {
  HANDLE_MAX,
  THEMES_VARIES,
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

const LABELS = ["alpha_male", "smart_girl", "RH", "clean_study", "psychologiefaits", "Plony", "Dorian", "clean_girl_run", null];

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

  it("donne aux labels de running (Atala) leurs mots de course, en mot entier seulement", () => {
    for (const label of ["male_run", "clean_girl_run", "white_female_run", "anxiety_run", "white_bg_run"]) {
      expect(themeMotsDuLabel(label), label).toBe("running");
    }
    expect(themeMotsDuLabel("brunch_girl")).toBe("smart_girl");
    expect(motsDuHandle("male_run", "fr").locaux).toContain("footing");
    expect(motsDuHandle("male_run", "de").universels).toContain("marathon");
    // Le genre et la photo de profil restent ceux de la famille du label.
    expect(themeDuLabel("clean_girl_run")).toBe("clean_girl");
    expect(themeDuLabel("white_female_run")).toBe("default");
  });

  it("donne aux labels d'art (Artura) leurs mots d'art, en mot entier seulement", () => {
    for (const label of ["art_girl", "museum_girl", "painting_male", "arthistory", "artsy_clean_girl", "Renaissance"]) {
      expect(themeMotsDuLabel(label), label).toBe("art");
    }
    // « smart », « start », « party », « partner » contiennent « art » : pas de l'art.
    for (const label of ["smart_girl", "beau_smart_girl", "start_up", "party_girl", "partner"]) {
      expect(themeMotsDuLabel(label), label).not.toBe("art");
    }
    // Le running passe avant l'art.
    expect(themeMotsDuLabel("art_run")).toBe("running");
    // Les thèmes d'avant aussi : `psych_art` (label existant) garde son identité psycho.
    expect(themeMotsDuLabel("psych_art")).toBe("psycho");
    expect(motsDuHandle("art_girl", "fr").locaux).toContain("peinture");
    expect(motsDuHandle("art_girl", "ja").locaux).toContain("bijutsu");
    expect(motsDuHandle("art_girl", "de").universels).toContain("monet");
    // Le genre et la photo de profil restent ceux de la famille du label.
    expect(themeDuLabel("art_girl")).toBe("smart_girl");
    expect(themeDuLabel("painting_male")).toBe("alpha_male");
  });

  it("a des mots et des bios d'art dans toutes les langues des comptes", () => {
    for (const langue of Object.keys(NOMS_PAR_LANGUE)) {
      expect(MOTS_PAR_THEME.art[langue]?.length ?? 0, langue).toBeGreaterThanOrEqual(10);
      for (const mot of MOTS_PAR_THEME.art[langue]!) expect(mot, `${langue} ${mot}`).toMatch(/^[a-z]+$/);
    }
    for (const mot of MOTS_UNIVERSELS.art) expect(mot).toMatch(/^[a-z]+$/);
    const hasard = hasardFixe(9);
    for (const langue of Object.keys(NOMS_PAR_LANGUE)) {
      for (let i = 0; i < 40; i += 1) {
        const bio = composerBio({ prenom: "lea", langue, theme: "art", annee: 2026 }, hasard);
        expect([...bio].length, bio).toBeLessThanOrEqual(BIO_MAX);
      }
    }
  });

  it("ne change pas le thème qui règle le genre et la photo de profil", () => {
    expect(themeDuLabel("clean_study")).toBe("clean_girl");
    expect(themeDuLabel("RH")).toBe("default");
  });
});

// 19/11 (Adrien) : « c'est trop cramé, c'est toujours la même chose ». Les
// comptes Atala ne s'appellent plus tous `prenom.<mot de course>123`.
describe("@ variés (art, Artura)", () => {
  it("donne des @ valides, variés, sans mot de course ; un mot d'art moins d'une fois sur cinq", () => {
    const hasard = hasardFixe(47);
    const handles = Array.from({ length: 1000 }, () =>
      composerIdentite(
        { langue: "en", genre: "femme", labelNom: "art_girl", racinesPrises: new Set(), nomsPris: new Set(), annee: 2026 },
        hasard,
      ).handle,
    );
    for (const h of handles) {
      expect(h, h).toMatch(HANDLE_VALIDE);
      expect(h.length, h).toBeLessThanOrEqual(HANDLE_MAX);
      expect(h, h).toMatch(/\d{2,4}/);
      expect(h, h).not.toMatch(/miles|strides|laps|runs/);
    }
    const motsArt = new Set([...MOTS_UNIVERSELS.art, ...MOTS_PAR_THEME.art.en!]);
    const avecArt = handles.filter((h) => h.split(/[._\d]+/).some((m) => motsArt.has(m))).length;
    expect(avecArt / handles.length).toBeGreaterThan(0.03);
    expect(avecArt / handles.length).toBeLessThan(0.25);
    expect(new Set(handles).size / handles.length).toBeGreaterThan(0.97);
  });
});

describe("@ variés (running, Atala)", () => {
  const MOTS_COURSE = new Set([
    ...MOTS_UNIVERSELS.running,
    ...Object.values(MOTS_PAR_THEME.running).flat(),
  ]);
  /** La silhouette d'un @ : ses lettres et ses chiffres ramenés à « a » et « 9 ». */
  const silhouette = (h: string) => h.replace(/[a-z]+/g, "a").replace(/\d+/g, "9");
  const tirer = (n: number, graine: number, langue = "fr", genre: "homme" | "femme" = "femme") => {
    const hasard = hasardFixe(graine);
    return Array.from({ length: n }, () =>
      composerIdentite(
        { langue, genre, labelNom: "clean_girl_run", racinesPrises: new Set(), nomsPris: new Set(), annee: 2026 },
        hasard,
      ),
    );
  };

  it("ne prend le format classique pour aucun label de running ; les autres labels le gardent", () => {
    expect([...THEMES_VARIES]).toEqual(["running", "art"]);
    const hasard = hasardFixe(2);
    const classiques = Array.from({ length: 200 }, () =>
      composerIdentite(
        { langue: "fr", genre: "femme", labelNom: "smart_girl", racinesPrises: new Set(), nomsPris: new Set(), annee: 2026 },
        hasard,
      ).handle,
    );
    for (const h of classiques) expect(h).toMatch(/^[a-z0-9]+\.[a-z0-9]+[1-9]\d{2}$/);
  });

  it("donne des @ valides, de formes différentes, toujours avec un nombre", () => {
    const handles = tirer(1200, 31).map((i) => i.handle);
    for (const h of handles) {
      expect(h, h).toMatch(HANDLE_VALIDE);
      expect(h.length, h).toBeGreaterThanOrEqual(5);
      expect(h.length, h).toBeLessThanOrEqual(HANDLE_MAX);
      expect(h, h).not.toMatch(/\.\.|\._|_\./);
      // « golden_days » serait déjà pris sur TikTok : jamais de @ sans nombre.
      expect(h, h).toMatch(/\d{2,4}/);
      expect(h, h).not.toMatch(/\d{5}/);
    }
    const parSilhouette = new Map<string, number>();
    for (const h of handles) parSilhouette.set(silhouette(h), (parSilhouette.get(silhouette(h)) ?? 0) + 1);
    expect(parSilhouette.size).toBeGreaterThanOrEqual(8);
    expect(Math.max(...parSilhouette.values()) / handles.length).toBeLessThan(0.45);
    // L'ancienne silhouette, « mot.mot » + 3 chiffres, n'est plus qu'une forme parmi d'autres.
    expect(handles.filter((h) => /^[a-z]+\.[a-z]+\d{3}$/.test(h)).length / handles.length).toBeLessThan(0.25);
    // Le nombre lui-même varie : 2, 3 ou 4 chiffres, à la fin ou après le prénom.
    const longueur = (n: number) => handles.filter((h) => h.match(/\d+/)![0].length === n).length / handles.length;
    expect(longueur(2)).toBeGreaterThan(0.05);
    expect(longueur(3)).toBeGreaterThan(0.4);
    expect(longueur(4)).toBeGreaterThan(0.1);
    expect(handles.filter((h) => /^[a-z]+\d+[._][a-z]/.test(h)).length / handles.length).toBeGreaterThan(0.03);
    expect(new Set(handles).size / handles.length).toBeGreaterThan(0.97);
  });

  it("donne 3 ou 4 chiffres aux formes les plus simples, jamais 2", () => {
    const hasard = hasardFixe(23);
    const nus = Array.from({ length: 500 }, () => tirerNombre(2026, true, hasard));
    for (const n of nus) expect(n, n).toMatch(/^\d{3,4}$/);
    const autres = new Set(Array.from({ length: 500 }, () => tirerNombre(2026, false, hasard).length));
    expect([...autres].sort()).toEqual([2, 3, 4]);
    // Deux mots sans nom (« golden_days ») et prénom + nom entier : jamais deux chiffres seulement.
    const pieces = { prenom: "emma", nomFamille: "martin", genre: "femme" as const, langue: "fr", annee: 2026, motsTheme: [] };
    const simples = Array.from({ length: 3000 }, () => tirerHandleVarie(pieces, hasard))
      .filter((h) => !h.includes("emma") || /^emma[._]?martin\d/.test(h));
    expect(simples.length).toBeGreaterThan(100);
    for (const h of simples) expect(h, h).toMatch(/\d{3,4}/);
  });

  it("parle de course moins d'une fois sur cinq, mais pas jamais", () => {
    for (const langue of ["fr", "en", "de", "es"]) {
      const handles = tirer(1000, 7, langue).map((i) => i.handle);
      const course = handles.filter((h) => h.split(/[._]/).some((m) => MOTS_COURSE.has(m.replace(/\d+$/, "")))).length;
      expect(course / handles.length, langue).toBeLessThan(0.2);
      expect(course / handles.length, langue).toBeGreaterThan(0.03);
    }
  });

  it("reprend souvent le prénom et le nom affichés, entiers ou abrégés", () => {
    expect(squelette("martin")).toBe("mrtn");
    expect(squelette("dubois")).toBe("dbs");
    expect(squelette("lee")).toBe("lee");
    const ids = tirer(600, 5);
    for (const i of ids) expect(i.nom).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    const avecPrenom = ids.filter((i) => i.handle.includes(i.nom.split(" ")[0]!.toLowerCase())).length;
    expect(avecPrenom / ids.length).toBeGreaterThan(0.85);
    const avecNom = ids.filter((i) => {
      const famille = i.nom.split(" ")[1]!.toLowerCase();
      return i.handle.includes(famille) || i.handle.includes(squelette(famille));
    }).length;
    expect(avecNom / ids.length).toBeGreaterThan(0.2);
  });

  it("ne reprend jamais une racine de @ déjà prise, sur 800 comptes d'affilée", () => {
    const hasard = hasardFixe(13);
    const racinesPrises = new Set<string>();
    for (let i = 0; i < 800; i += 1) {
      const { handle } = composerIdentite(
        { langue: "en", genre: "homme", labelNom: "male_run", racinesPrises, nomsPris: new Set(), annee: 2026 },
        hasard,
      );
      expect(racinesPrises.has(racineHandle(handle)), handle).toBe(false);
      racinesPrises.add(racineHandle(handle));
    }
  });

  it("garde les « x » et les mots doux pour les comptes femme", () => {
    const hommes = tirer(1500, 3, "en", "homme").map((i) => i.handle);
    const hasard = hasardFixe(41);
    const theo = { prenom: "theo", nomFamille: "martin", genre: "homme" as const, langue: "fr", annee: 2026, motsTheme: [] };
    const bises = /^[a-z]+\.?(?:xo|xx|x)\d/;
    expect(Array.from({ length: 2000 }, () => tirerHandleVarie(theo, hasard)).some((h) => /^theo\.?(?:xo|xx|x)\d/.test(h))).toBe(false);
    const emma = { ...theo, prenom: "emma", genre: "femme" as const };
    expect(Array.from({ length: 2000 }, () => tirerHandleVarie(emma, hasard)).some((h) => bises.test(h))).toBe(true);
    const doux = new Set(MOTS_QUOTIDIEN_F);
    expect(hommes.some((h) => h.split(/[._]/).some((m) => doux.has(m.replace(/\d+$/, ""))))).toBe(false);
  });

  it("n'a que des mots de @ valides, sans doublon entre les listes d'un même genre", () => {
    for (const liste of [
      [...MOTS_QUOTIDIEN, ...MOTS_QUOTIDIEN_F, ...MOTS_APRES_PRENOM],
      [...MOTS_QUOTIDIEN, ...MOTS_QUOTIDIEN_H, ...MOTS_APRES_PRENOM],
    ]) {
      expect(new Set(liste).size).toBe(liste.length);
      for (const mot of liste) expect(mot).toMatch(/^[a-z0-9]{2,}$/);
    }
  });

  it("écrit une bio de course une fois sur trois, sinon de tous les jours", () => {
    const bios = tirer(600, 17, "en").map((i) => i.bio);
    const course = bios.filter((b) => /mile|long runs|first half|clear my head/.test(b)).length;
    const quotidien = bios.filter((b) => /everything|just my life|iced coffee|what i like|sunday morning/.test(b)).length;
    expect(course).toBeGreaterThan(40);
    expect(quotidien).toBeGreaterThan(course);
    for (const b of bios) expect([...b].length).toBeLessThanOrEqual(BIO_MAX);
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
            // Format classique, sauf les thèmes aux @ variés (le running d'Atala).
            if (THEMES_VARIES.has(themeMotsDuLabel(label))) expect(id.handle).toMatch(HANDLE_VALIDE);
            else expect(id.handle).toMatch(/^[a-z0-9]+\.[a-z0-9]+[1-9]\d{2}$/);
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
