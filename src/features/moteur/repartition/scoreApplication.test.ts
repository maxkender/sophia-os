import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";


import {
  applicationsEligibles,
  classerApplications,
  ecartsFlotte,
  lireCibleApplications,
  type MarcheApplications,
} from "./scoreApplication";

// Les vraies langues de la prod au 18/10 : Sophia partout, Unswipe sur six
// langues, Micabo sur quatre.
const APPS = [
  { id: "id-sophia", slug: "sophia", langues: null },
  { id: "id-unswipe", slug: "unswipe", langues: ["fr", "en", "de", "it", "es", "tr"] },
  { id: "id-micabo", slug: "micabo", langues: ["fr", "tr", "de", "es"] },
];
const DENO = "supabase/functions/_shared/choix_application.ts";
const FRONT = "src/features/moteur/repartition/scoreApplication.ts";

/**
 * Le moteur d'application existe en deux exemplaires : ce fichier, que la page
 * Répartition affiche, et `_shared/choix_application.ts`, que `manage-users`
 * exécute à la création d'un compte. Deux copies qui dérivent, c'est une page
 * qui montre autre chose que ce que fait la production, et personne qui s'en
 * aperçoit. On compare donc le TEXTE SOURCE, commentaires compris.
 *
 * Même mécanisme que « copie Deno » dans scoreLabel.test.ts, où exactement ce
 * bug s'était produit : le miroir lisait `ouverts` quand le moteur lisait
 * `labels_ouverts`.
 */
describe("copie Deno", () => {
  const bloc = (chemin: string, debut: string, fin: string) => {
    const src = readFileSync(chemin, "utf8");
    const i = src.indexOf(debut);
    expect(i, `${debut} absent de ${chemin}`).toBeGreaterThan(-1);
    const j = src.indexOf(fin, i);
    expect(j, `fin de ${debut} absente de ${chemin}`).toBeGreaterThan(-1);
    return src.slice(i, j).replace(/\s+/g, " ").trim();
  };

  it.each([
    ["applicationsEligibles", "export function applicationsEligibles("],
    ["lireCibleApplications", "export function lireCibleApplications("],
    ["classerApplications", "export function classerApplications("],
  ])("le code de %s est le même des deux côtés", (_nom, debut) => {
    expect(bloc(FRONT, debut, "\n}")).toBe(bloc(DENO, debut, "\n}"));
  });

  it.each([
    ["ApplicationCandidate", "export interface ApplicationCandidate {"],
    ["PartApplication", "export interface PartApplication {"],
    ["MarcheApplications", "export interface MarcheApplications {"],
    ["CibleApplications", "export interface CibleApplications {"],
    ["ApplicationClassee", "export interface ApplicationClassee {"],
  ])("le type %s est le même des deux côtés", (_nom, debut) => {
    expect(bloc(FRONT, debut, "\n}")).toBe(bloc(DENO, debut, "\n}"));
  });
});

const SLUGS = APPS.map((a) => a.slug);

function marche(parts: Record<string, number>, langue = "de", pays: string | null = "DE"): MarcheApplications {
  return {
    langue,
    pays,
    parts: Object.entries(parts).map(([slug, comptes]) => ({
      application_id: `id-${slug}`,
      slug,
      comptes,
    })),
  };
}

describe("cible", () => {
  it("sans réglage, parts égales, et la page doit pouvoir le dire", () => {
    const c = lireCibleApplications(null, SLUGS);
    expect(c.source).toBe("defaut");
    expect(c.parts.sophia).toBeCloseTo(100 / 3);
  });

  it("un réglage est renormalisé à 100", () => {
    const c = lireCibleApplications({ sophia: 6, unswipe: 3, micabo: 1 }, SLUGS);
    expect(c.source).toBe("reglage");
    expect(c.parts.sophia).toBe(60);
    expect(c.parts.unswipe).toBe(30);
    expect(c.parts.micabo).toBe(10);
  });

  it("une application absente du réglage vise zéro", () => {
    const c = lireCibleApplications({ sophia: 100 }, SLUGS);
    expect(c.parts.unswipe).toBe(0);
  });

  it("une application hors catalogue est ignorée", () => {
    const c = lireCibleApplications({ sophia: 50, fantome: 50 }, SLUGS);
    expect(c.parts.fantome).toBeUndefined();
    expect(c.parts.sophia).toBe(100);
  });

  it("un réglage illisible retombe sur les parts égales", () => {
    expect(lireCibleApplications({ sophia: -3 }, SLUGS).source).toBe("defaut");
    expect(lireCibleApplications("n'importe quoi", SLUGS).source).toBe("defaut");
  });
});

describe("classement des applications sur un marché", () => {
  const cible = lireCibleApplications({ sophia: 60, unswipe: 25, micabo: 15 }, SLUGS);

  it("un marché vide donne le premier compte à la plus grosse cible", () => {
    expect(classerApplications(marche({}), cible, APPS)[0].slug).toBe("sophia");
  });

  it("une application très en avance laisse la place", () => {
    const c = classerApplications(marche({ sophia: 20, unswipe: 0, micabo: 0 }), cible, APPS);
    expect(c[0].slug).toBe("unswipe");
  });

  it("la part réelle est celle du marché, pas de la flotte", () => {
    const c = classerApplications(marche({ sophia: 3, unswipe: 1 }), cible, APPS);
    expect(c.find((x) => x.slug === "sophia")!.partReelle).toBe(75);
  });

  it("une cible à zéro écarte l'application du marché", () => {
    const sansMicabo = lireCibleApplications({ sophia: 70, unswipe: 30 }, SLUGS);
    const c = classerApplications(marche({}), sansMicabo, APPS);
    expect(c.map((x) => x.slug)).not.toContain("micabo");
  });

  it("le classement suit le marché : deux langues peuvent différer", () => {
    const de = classerApplications(marche({ sophia: 0, unswipe: 8 }, "de", "DE"), cible, APPS);
    const fr = classerApplications(marche({ sophia: 8, unswipe: 0 }, "fr", "FR"), cible, APPS);
    expect(de[0].slug).toBe("sophia");
    expect(fr[0].slug).toBe("unswipe");
  });

  it("servir un compte fait reculer l'application au tour suivant", () => {
    const avant = classerApplications(marche({ sophia: 2 }), cible, APPS);
    const apres = classerApplications(marche({ sophia: 3 }), cible, APPS);
    const s = (l: typeof avant) => l.find((x) => x.slug === "sophia")!.score;
    expect(s(apres)).toBeLessThan(s(avant));
  });

  it("dix créations d'affilée approchent la cible", () => {
    const comptes: Record<string, number> = { sophia: 0, unswipe: 0, micabo: 0 };
    for (let i = 0; i < 10; i += 1) {
      const gagnant = classerApplications(marche(comptes), cible, APPS)[0].slug;
      comptes[gagnant] += 1;
    }
    // Cible 60/25/15 sur dix comptes, soit 6 / 2,5 / 1,5 en proportion exacte.
    // Le dixième compte se joue sur une égalité parfaite (unswipe 25/5 = 5,
    // micabo 15/3 = 5) que le tri tranche par ordre alphabétique : micabo
    // passe. Le résultat est donc 6 / 2 / 2, et il est STABLE — c'est ce qui
    // compte, un classement qui dépendrait du hasard serait invérifiable.
    expect(comptes).toEqual({ sophia: 6, unswipe: 2, micabo: 2 });
  });

  it("sans égalité, la suite colle à la cible", () => {
    const cibleNette = lireCibleApplications({ sophia: 50, unswipe: 30, micabo: 20 }, SLUGS);
    const comptes: Record<string, number> = { sophia: 0, unswipe: 0, micabo: 0 };
    for (let i = 0; i < 10; i += 1) {
      comptes[classerApplications(marche(comptes), cibleNette, APPS)[0].slug] += 1;
    }
    expect(comptes).toEqual({ sophia: 5, unswipe: 3, micabo: 2 });
  });
});

describe("langues servies", () => {
  it("une application sans restriction sert toutes les langues", () => {
    expect(applicationsEligibles("pl", APPS).map((a) => a.slug)).toEqual(["sophia"]);
  });

  it("en français, les trois servent", () => {
    expect(applicationsEligibles("fr", APPS)).toHaveLength(3);
  });

  it("en italien, Micabo ne sert pas", () => {
    expect(applicationsEligibles("it", APPS).map((a) => a.slug)).toEqual(["sophia", "unswipe"]);
  });

  it("la casse de la langue est ignorée", () => {
    expect(applicationsEligibles("FR", APPS)).toHaveLength(3);
  });

  it("la cible est renormalisée sur les seules applications servies", () => {
    const cible = lireCibleApplications({ sophia: 60, unswipe: 25, micabo: 15 }, SLUGS);
    // En polonais, Sophia est seule : elle doit viser 100 %, pas 60 %, sinon
    // 40 % de la cible disparaîtraient dans le vide.
    const pl = classerApplications(marche({}, "pl", "PL"), cible, APPS);
    expect(pl).toHaveLength(1);
    expect(pl[0].partVisee).toBe(100);

    // En italien, les 15 % de Micabo se répartissent entre les deux autres.
    const it = classerApplications(marche({}, "it", "IT"), cible, APPS);
    expect(it.reduce((a, x) => a + x.partVisee, 0)).toBeCloseTo(100);
    expect(it.find((x) => x.slug === "sophia")!.partVisee).toBeCloseTo((100 * 60) / 85);
  });

  it("une langue non servie n'apparaît jamais dans le classement", () => {
    const cible = lireCibleApplications({ sophia: 50, micabo: 50 }, SLUGS);
    expect(classerApplications(marche({}, "pl", "PL"), cible, APPS).map((x) => x.slug)).toEqual([
      "sophia",
    ]);
  });
});

describe("écart de la flotte", () => {
  it("l'écart est positif là où l'application manque", () => {
    const cible = lireCibleApplications({ sophia: 60, unswipe: 25, micabo: 15 }, SLUGS);
    const marches = [marche({ sophia: 80, unswipe: 10, micabo: 10 }, "de", "DE")];
    const e = ecartsFlotte(marches, cible, APPS);
    expect(e.find((x) => x.slug === "sophia")!.ecart).toBeCloseTo(-20);
    expect(e.find((x) => x.slug === "unswipe")!.ecart).toBeCloseTo(15);
  });

  it("additionne tous les marchés", () => {
    const cible = lireCibleApplications(null, ["sophia"]);
    const marches = [marche({ sophia: 2 }, "de", "DE"), marche({ sophia: 3 }, "fr", "FR")];
    expect(ecartsFlotte(marches, cible, APPS)[0].comptes).toBe(5);
  });

  it("LE test : la cible de la flotte tient compte des marchés où Sophia est seule", () => {
    // Le piège qui a failli faire baisser la part de Sophia alors qu'il
    // fallait la monter. Deux marchés de même taille : le polonais, que seule
    // Sophia sert, et le français, que les trois servent. Si chacun atteint
    // sa cible, la flotte N'EST PAS à 60 % de Sophia mais à 80 % :
    // 100 % sur l'un, 60 % sur l'autre.
    const cible = lireCibleApplications({ sophia: 60, unswipe: 25, micabo: 15 }, SLUGS);
    const marches = [
      marche({ sophia: 10 }, "pl", "PL"),
      marche({ sophia: 6, unswipe: 2.5, micabo: 1.5 }, "fr", "FR"),
    ];
    const e = ecartsFlotte(marches, cible, APPS);
    expect(e.find((x) => x.slug === "sophia")!.partVisee).toBeCloseTo(80);
    // Et la flotte EST à sa cible : chaque marché y est, donc l'écart est nul.
    expect(e.find((x) => x.slug === "sophia")!.ecart).toBeCloseTo(0);
    expect(e.find((x) => x.slug === "unswipe")!.ecart).toBeCloseTo(0);
  });

  it("les cibles visées de la flotte somment à 100", () => {
    const cible = lireCibleApplications({ sophia: 70, unswipe: 20, micabo: 10 }, SLUGS);
    const marches = [
      marche({ sophia: 10 }, "pl", "PL"),
      marche({ sophia: 11 }, "it", "IT"),
      marche({ sophia: 16, unswipe: 3, micabo: 2 }, "fr", "FR"),
    ];
    const somme = ecartsFlotte(marches, cible, APPS).reduce((a, x) => a + x.partVisee, 0);
    expect(somme).toBeCloseTo(100);
  });

  it("un marché vide ne pèse pas dans la cible de la flotte", () => {
    const cible = lireCibleApplications({ sophia: 60, unswipe: 40 }, SLUGS);
    const avec = ecartsFlotte(
      [marche({ sophia: 5, unswipe: 5 }, "fr", "FR"), marche({}, "pl", "PL")],
      cible,
      APPS,
    );
    const sans = ecartsFlotte([marche({ sophia: 5, unswipe: 5 }, "fr", "FR")], cible, APPS);
    expect(avec.find((x) => x.slug === "sophia")!.partVisee).toBeCloseTo(
      sans.find((x) => x.slug === "sophia")!.partVisee,
    );
  });
});
