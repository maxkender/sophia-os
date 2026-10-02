import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ID_SOPHIA,
  SLUG_SOPHIA,
  anglesPourApplication,
  applicationsDuLabel,
  applicationsEligiblesCompte,
  applicationsServies,
  blocAngles,
  choisirApplicationCreneau,
  labelsParApplication,
  normaliserParts,
  partsEffectives,
  type ApplicationMoteur,
  type EntreeFenetre,
  type LienLabelApplication,
} from "./multiApp";

const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";

const sophia: ApplicationMoteur = {
  id: ID_SOPHIA,
  slug: "sophia",
  nom: "Sophia",
  langues: null,
  actif: true,
};
const unswipe: ApplicationMoteur = {
  id: ID_UNSWIPE,
  slug: "unswipe",
  nom: "Unswipe",
  langues: ["en", "fr"],
  actif: true,
};

const liens: LienLabelApplication[] = [
  { label_id: "clean", application_id: ID_SOPHIA, angle: null },
  { label_id: "clean", application_id: ID_UNSWIPE, angle: "reprends le contrôle de ton temps" },
  { label_id: "detox", application_id: ID_UNSWIPE, angle: "dopamine detox" },
];

describe("applicationsDuLabel", () => {
  it("un label sans ligne sert Sophia (héritage)", () => {
    expect(applicationsDuLabel("alpha", liens)).toEqual([ID_SOPHIA]);
  });

  it("un label dual sert ses deux applications", () => {
    expect(applicationsDuLabel("clean", liens)).toEqual([ID_SOPHIA, ID_UNSWIPE].sort());
  });

  it("un label Unswipe seul ne sert PAS Sophia", () => {
    expect(applicationsDuLabel("detox", liens)).toEqual([ID_UNSWIPE]);
  });
});

describe("labelsParApplication / applicationsServies", () => {
  it("répartit les labels par application et ignore les labels système", () => {
    const parApp = labelsParApplication(
      [{ id: "alpha" }, { id: "clean" }, { id: "detox" }, { id: "hook", slug: "hook" }],
      liens,
    );
    expect(parApp.get(ID_SOPHIA)).toEqual(["alpha", "clean"]);
    expect(parApp.get(ID_UNSWIPE)).toEqual(["clean", "detox"]);
  });

  it("sans label utile, un contenu reste Sophia", () => {
    expect(applicationsServies([], liens)).toEqual([ID_SOPHIA]);
    expect(applicationsServies([{ id: "h", slug: "hook" }], liens)).toEqual([ID_SOPHIA]);
  });

  it("un contenu Unswipe seul n'est servi que par Unswipe", () => {
    expect(applicationsServies([{ id: "detox" }], liens)).toEqual([ID_UNSWIPE]);
  });
});

describe("applicationsEligiblesCompte", () => {
  const apps = [sophia, unswipe];

  it("filtre par labels, langue, activité et UGC", () => {
    const servies = [ID_SOPHIA, ID_UNSWIPE];
    const ids = (r: ApplicationMoteur[]) => r.map((a) => a.slug);
    expect(ids(applicationsEligiblesCompte({ applications: apps, servies, langue: "fr", ugc: false }))).toEqual(["sophia", "unswipe"]);
    expect(ids(applicationsEligiblesCompte({ applications: apps, servies, langue: "de", ugc: false }))).toEqual(["sophia"]);
    expect(ids(applicationsEligiblesCompte({ applications: apps, servies, langue: "fr", ugc: true }))).toEqual(["sophia"]);
    expect(
      ids(
        applicationsEligiblesCompte({
          applications: [sophia, { ...unswipe, actif: false }],
          servies,
          langue: "fr",
          ugc: false,
        }),
      ),
    ).toEqual(["sophia"]);
    expect(ids(applicationsEligiblesCompte({ applications: apps, servies: [ID_SOPHIA], langue: "fr", ugc: false }))).toEqual(["sophia"]);
  });
});

describe("normaliserParts / partsEffectives", () => {
  it("null, vide ou invalide → null (= 100 % Sophia)", () => {
    expect(normaliserParts(null)).toBeNull();
    expect(normaliserParts({})).toBeNull();
    expect(normaliserParts([10])).toBeNull();
    expect(normaliserParts({ sophia: 0, unswipe: -3 })).toBeNull();
    expect(normaliserParts({ sophia: "70", unswipe: 30.4 })).toEqual({ sophia: 70, unswipe: 30 });
  });

  it("défaut 100 % Sophia", () => {
    expect(partsEffectives(null, ["sophia", "unswipe"])).toEqual({ sophia: 100 });
  });

  it("une application inéligible voit sa part reportée", () => {
    expect(partsEffectives({ sophia: 70, unswipe: 30 }, ["sophia"])).toEqual({ sophia: 100 });
  });

  it("un compte aux labels 100 % Unswipe publie Unswipe quel que soit le réglage", () => {
    expect(partsEffectives(null, ["unswipe"])).toEqual({ unswipe: 100 });
    expect(partsEffectives({ sophia: 100 }, ["unswipe"])).toEqual({ unswipe: 100 });
  });

  it("renormalise à 100", () => {
    expect(partsEffectives({ sophia: 35, unswipe: 15 }, ["sophia", "unswipe"])).toEqual({
      sophia: 70,
      unswipe: 30,
    });
  });

  it("aucune application éligible → aucune part", () => {
    expect(partsEffectives({ sophia: 100 }, [])).toEqual({});
  });
});

describe("choisirApplicationCreneau", () => {
  const derouler = (parts: Record<string, number>, n: number): string[] => {
    const fenetre: EntreeFenetre[] = [];
    const sortie: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const app = choisirApplicationCreneau(parts, fenetre);
      if (!app) throw new Error("aucune application");
      sortie.push(app);
      fenetre.push({ application: app, poids: 1 });
    }
    return sortie;
  };

  it("100 % Sophia rend toujours Sophia", () => {
    expect(new Set(derouler({ sophia: 100 }, 30))).toEqual(new Set(["sophia"]));
  });

  it("70/30 donne 7/3 sur TOUTE suite de 10 posts, sans longue série", () => {
    const suite = derouler({ sophia: 70, unswipe: 30 }, 60);
    for (let debut = 0; debut + 10 <= suite.length; debut += 1) {
      const bloc = suite.slice(debut, debut + 10);
      expect(bloc.filter((a) => a === "unswipe")).toHaveLength(3);
    }
    const serieMax = suite.join(",").split("unswipe").map((s) => s.split("sophia").length - 1);
    expect(Math.max(...serieMax)).toBeLessThanOrEqual(3);
  });

  it("80/20 et 60/40 tiennent aussi sur toute fenêtre glissante", () => {
    for (const [parts, attendu] of [
      [{ sophia: 80, unswipe: 20 }, 2],
      [{ sophia: 60, unswipe: 40 }, 4],
    ] as const) {
      const suite = derouler(parts, 50);
      for (let debut = 0; debut + 10 <= suite.length; debut += 1) {
        expect(suite.slice(debut, debut + 10).filter((a) => a === "unswipe")).toHaveLength(attendu);
      }
    }
  });

  it("50/50 alterne", () => {
    expect(derouler({ sophia: 50, unswipe: 50 }, 4)).toEqual(["sophia", "unswipe", "sophia", "unswipe"]);
  });

  it("rattrape un retard hérité de la fenêtre", () => {
    const fenetre: EntreeFenetre[] = Array.from({ length: 10 }, () => ({ application: SLUG_SOPHIA, poids: 1 }));
    expect(choisirApplicationCreneau({ sophia: 70, unswipe: 30 }, fenetre)).toBe("unswipe");
  });

  it("un post double compte pour moitié à chacune", () => {
    const fenetre: EntreeFenetre[] = [
      { application: "sophia", poids: 0.5 },
      { application: "unswipe", poids: 0.5 },
    ];
    expect(choisirApplicationCreneau({ sophia: 50, unswipe: 50 }, fenetre)).toBe("sophia");
  });

  it("sans part → null", () => {
    expect(choisirApplicationCreneau({}, [])).toBeNull();
  });
});

describe("angles", () => {
  const labels = [
    { id: "clean", nom: "Clean Girl" },
    { id: "detox", nom: "Detox" },
    { id: "h", slug: "hook", nom: "Hook" },
  ];

  it("liste les angles de l'application, dédoublonnés", () => {
    expect(anglesPourApplication(labels, liens, ID_UNSWIPE)).toEqual([
      { label: "Clean Girl", angle: "reprends le contrôle de ton temps" },
      { label: "Detox", angle: "dopamine detox" },
    ]);
    expect(anglesPourApplication(labels, liens, ID_SOPHIA)).toEqual([]);
  });

  it("aucun angle → aucun bloc (prompt inchangé)", () => {
    expect(blocAngles([], "Sophia")).toBe("");
    expect(blocAngles([{ label: "Clean Girl", angle: "x" }], "Unswipe")).toContain("- Clean Girl : x");
  });
});

describe("copie Deno", () => {
  it("`multi_app.ts` est identique au module front (hors en-tête)", () => {
    const corps = (chemin: string) =>
      readFileSync(chemin, "utf8").split("*/").slice(1).join("*/").trim();
    expect(corps("supabase/functions/_shared/multi_app.ts")).toBe(
      corps("src/features/moteur/multiApp.ts"),
    );
  });
});
