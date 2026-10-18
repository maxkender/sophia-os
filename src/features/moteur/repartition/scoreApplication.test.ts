import { describe, expect, it } from "vitest";

import {
  classerApplications,
  ecartsFlotte,
  lireCibleApplications,
  type MarcheApplications,
} from "./scoreApplication";

const APPS = [
  { id: "id-sophia", slug: "sophia" },
  { id: "id-unswipe", slug: "unswipe" },
  { id: "id-micabo", slug: "micabo" },
];
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

describe("écart de la flotte", () => {
  it("l'écart est positif là où l'application manque", () => {
    const cible = lireCibleApplications({ sophia: 60, unswipe: 25, micabo: 15 }, SLUGS);
    const marches = [marche({ sophia: 80, unswipe: 10, micabo: 10 }, "de", "DE")];
    const e = ecartsFlotte(marches, cible);
    expect(e.find((x) => x.slug === "sophia")!.ecart).toBeCloseTo(-20);
    expect(e.find((x) => x.slug === "unswipe")!.ecart).toBeCloseTo(15);
  });

  it("additionne tous les marchés", () => {
    const cible = lireCibleApplications(null, ["sophia"]);
    const marches = [marche({ sophia: 2 }, "de", "DE"), marche({ sophia: 3 }, "fr", "FR")];
    expect(ecartsFlotte(marches, cible)[0].comptes).toBe(5);
  });
});
