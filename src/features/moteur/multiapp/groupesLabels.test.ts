import { describe, expect, it } from "vitest";

import { HANDLE_VALIDE } from "../../../../supabase/functions/_shared/persona_handles_varies";
import { THEMES_VARIES } from "../../../../supabase/functions/_shared/persona_identite";
import { genreDuLabel, NICHE_DEFAUT, NICHE_PAR_THEME, nicheDesLabels, nicheDuLabel, themeDuLabel, themeMotsDuLabel } from "../themeLabel";
import { EXEMPLES_VARIES, grouperLabelsParApplication, identiteDuNom } from "./groupesLabels";

const APPS = [{ id: "a-sophia" }, { id: "a-micabo" }, { id: "a-atala" }];
const LABELS = [{ id: "smart_girl" }, { id: "clean_study" }, { id: "beau_smart_girl" }, { id: "Hook" }, { id: "male_run" }];
const LIENS = [
  { label_id: "smart_girl", application_id: "a-sophia" },
  { label_id: "clean_study", application_id: "a-micabo" },
  { label_id: "beau_smart_girl", application_id: "a-sophia" },
  { label_id: "beau_smart_girl", application_id: "a-micabo" },
  { label_id: "male_run", application_id: "a-atala" },
];

describe("labels rangés par application", () => {
  it("un groupe par application, dans l'ordre donné ; un label partagé est dans ses deux groupes ; les orphelins à la fin", () => {
    const g = grouperLabelsParApplication(LABELS, APPS, LIENS);
    expect(g.map((x) => [x.application?.id ?? null, x.labels.map((l) => l.id)])).toEqual([
      ["a-sophia", ["smart_girl", "beau_smart_girl"]],
      ["a-micabo", ["clean_study", "beau_smart_girl"]],
      ["a-atala", ["male_run"]],
      [null, ["Hook"]],
    ]);
  });

  it("garde le groupe d'une application sans label (pour pouvoir lui en ajouter un) et n'invente pas de groupe « sans »", () => {
    const g = grouperLabelsParApplication([{ id: "smart_girl" }], APPS, LIENS);
    expect(g.map((x) => [x.application?.id ?? null, x.labels.length])).toEqual([
      ["a-sophia", 1],
      ["a-micabo", 0],
      ["a-atala", 0],
    ]);
  });

  it("range sous « sans application » un label qui ne sert qu'une application inconnue de la liste", () => {
    const g = grouperLabelsParApplication([{ id: "x" }], APPS, [{ label_id: "x", application_id: "a-partie" }]);
    expect(g.at(-1)).toEqual({ application: null, labels: [{ id: "x" }] });
  });
});

describe("identité que le nom d'un label donne à ses comptes", () => {
  it("les labels de running de la Bible : @ et bio running, genre et photo de profil de leur famille", () => {
    for (const nom of ["classic_girl_run", "white_female_run", "white_bg_run", "male_run", "clean_girl_run", "anxiety_run"]) {
      expect(themeMotsDuLabel(nom), nom).toBe("running");
    }
    expect(genreDuLabel("male_run")).toBe("homme");
    expect(genreDuLabel("clean_girl_run")).toBe("femme");
    expect(genreDuLabel("classic_girl_run")).toBe("femme");
    // « female » contient « male » : c'est bien une femme, et pas la banque de photos alpha_male.
    expect(genreDuLabel("white_female_run")).toBe("femme");
    expect(themeDuLabel("white_female_run")).toBe("default");
    expect(themeDuLabel("male_run")).toBe("alpha_male");
    expect(themeDuLabel("clean_girl_run")).toBe("clean_girl");
    expect(genreDuLabel("anxiety_run")).toBeNull();
  });

  it("ne prend pas un morceau de mot pour du running, et ne touche pas aux labels d'avant", () => {
    for (const nom of ["brunch_girl", "prune", "truncate", "smart_girl", "alpha_male_yellow", "RH", "Plony", "clean_study"]) {
      expect(themeMotsDuLabel(nom), nom).not.toBe("running");
    }
    expect(themeDuLabel("alpha_male")).toBe("alpha_male");
    expect(genreDuLabel("alpha_male_film")).toBe("homme");
    expect(themeMotsDuLabel("Marathon girls")).toBe("running");
    expect(themeMotsDuLabel("trail-running")).toBe("running");
  });

  it("annonce le thème et un @ d'exemple, et signale un nom qui ne colle pas à l'application", () => {
    expect(identiteDuNom("clean_girl_run", "atala")).toMatchObject({ theme: "running", attendu: null });
    // Le running a des @ variés : plusieurs exemples, de formes différentes.
    expect(identiteDuNom("clean_girl_run", "atala").varies).toEqual(EXEMPLES_VARIES.running);
    expect(identiteDuNom("smart_girl", "sophia").varies).toBeNull();
    expect(identiteDuNom("clean_girl", "atala")).toMatchObject({
      theme: "clean_girl",
      attendu: { theme: "running", suffixe: "_run" },
    });
    expect(identiteDuNom("notes_propres", "micabo").attendu).toEqual({ theme: "etude", suffixe: "_study" });
    expect(identiteDuNom("clean_study", "micabo").attendu).toBeNull();
    // Sophia n'attend aucun thème : tous ses labels vont.
    expect(identiteDuNom("alpha_male", "sophia")).toMatchObject({ theme: "alpha_male", attendu: null });
    expect(identiteDuNom("", null)).toMatchObject({ theme: "default", attendu: null });
  });

  it("Artura attend des labels d'art (« _art »)", () => {
    expect(identiteDuNom("art_girl", "artura")).toMatchObject({ theme: "art", attendu: null });
    expect(identiteDuNom("museum_girl", "artura").varies).toEqual(EXEMPLES_VARIES.art);
    expect(identiteDuNom("smart_girl", "artura").attendu).toEqual({ theme: "art", suffixe: "_art" });
    expect(genreDuLabel("art_girl")).toBe("femme");
    expect(nicheDuLabel("art_girl")).toBe("art");
    expect(nicheDesLabels(["white_bg", "museum_girl"])).toBe("art");
  });

  it("annonce des @ variés pour les mêmes thèmes que le moteur, avec des exemples valides", () => {
    expect(Object.keys(EXEMPLES_VARIES).sort()).toEqual([...THEMES_VARIES].sort());
    for (const exemples of Object.values(EXEMPLES_VARIES)) {
      expect(exemples!.length).toBeGreaterThanOrEqual(3);
      for (const h of exemples!) {
        expect(h).toMatch(HANDLE_VALIDE);
        // Jamais de @ sans nombre : il serait déjà pris sur TikTok.
        expect(h).toMatch(/\d{2,4}/);
      }
    }
  });
});

describe("19/11 : la niche du warm-up suit le label du compte", () => {
  it("la niche d'un label est celle de son thème (le même que le @ et la bio)", () => {
    expect(nicheDuLabel("male_run")).toBe("running");
    // Le running passe avant le reste, comme pour l'identité.
    expect(nicheDuLabel("clean_girl_run")).toBe("running");
    expect(nicheDuLabel("clean_study")).toBe("study");
    expect(nicheDuLabel("that_girl_study")).toBe("study");
    expect(nicheDuLabel("RH")).toBe("career advice");
    expect(nicheDuLabel("alpha_male_yellow")).toBe("self-improvement");
    expect(nicheDuLabel("smart_girl")).toBe("books and culture");
    expect(nicheDuLabel("clean_girl")).toBe("wellness");
    expect(nicheDuLabel("mentalmaxxing")).toBe("psychology");
    expect(nicheDuLabel("Plony")).toBe("philosophy");
    // Aucun mot reconnu : la culture générale, ce que les messages disaient à tous.
    expect(nicheDuLabel("white_bg")).toBe("general knowledge");
    expect(nicheDuLabel(null)).toBe(NICHE_DEFAUT);
    expect(NICHE_DEFAUT).toBe("general knowledge");
  });

  it("chaque thème a sa niche, écrite pour « in the … niche »", () => {
    for (const niche of Object.values(NICHE_PAR_THEME)) {
      expect(niche).toMatch(/^[a-z][a-z -]+$/);
      expect(niche).not.toMatch(/niche/);
    }
  });

  it("un compte à plusieurs labels : le premier, par ordre alphabétique, qui a une niche à lui", () => {
    expect(nicheDesLabels(["male_run"])).toBe("running");
    expect(nicheDesLabels(["white_bg", "male_run"])).toBe("running");
    expect(nicheDesLabels(["smart_girl", "clean_study"])).toBe("study");
    expect(nicheDesLabels(["white_bg", null, " "])).toBe("general knowledge");
    expect(nicheDesLabels([])).toBe("general knowledge");
  });
});
