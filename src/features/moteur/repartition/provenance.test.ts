import { describe, expect, it } from "vitest";

import {
  cibleHorsSite,
  estTirageSite,
  partSite,
  prochaineAppSite,
  RECRUES_MINIMUM_MARCHE,
  type RecruesMarche,
} from "./provenance";
import { lireCibleApplications } from "./scoreApplication";

const SLUGS = ["sophia", "unswipe", "micabo"];

function rec(
  langue: string,
  recrues: number,
  recruesSite: number,
  siteParApp: Record<string, number> = recruesSite > 0 ? { sophia: recruesSite } : {},
): RecruesMarche {
  return { langue, pays: langue.toUpperCase(), recrues, recruesSite, siteParApp };
}

// Les chiffres de la prod au 18/10, fenêtre de 30 jours : c'est le cas qui a
// motivé tout le module, il mérite d'être figé dans un test.
const FLOTTE: RecruesMarche[] = [
  rec("fr", 11, 5),
  rec("it", 9, 1),
  rec("es", 7, 1),
  rec("de", 15, 0),
  rec("tr", 9, 0),
];

describe("part des recrues hors moteur", () => {
  it("un marché assez fourni parle pour lui-même", () => {
    const p = partSite(rec("fr", 11, 5), FLOTTE);
    expect(p.base).toBe("marche");
    expect(p.part).toBeCloseTo(5 / 11);
    expect(p.recrues).toBe(11);
    expect(p.recruesSite).toBe(5);
    expect(p.parApp).toEqual({ sophia: 1 });
  });

  it("un marché trop mince retombe sur la flotte, et le dit", () => {
    const p = partSite(rec("pl", 1, 1), FLOTTE);
    // Sans ce garde-fou, une seule recrue ferait « 100 % hors moteur » et
    // verrouillerait tout le marché polonais dans la projection.
    expect(p.base).toBe("flotte");
    expect(p.part).toBeCloseTo(7 / 51);
    expect(p.recrues).toBe(51);
  });

  it("le seuil est celui annoncé, pas un de plus", () => {
    expect(partSite(rec("pl", RECRUES_MINIMUM_MARCHE, 1), FLOTTE).base).toBe("marche");
    expect(partSite(rec("pl", RECRUES_MINIMUM_MARCHE - 1, 1), FLOTTE).base).toBe("flotte");
  });

  it("un marché inconnu retombe aussi sur la flotte", () => {
    expect(partSite(undefined, FLOTTE).base).toBe("flotte");
  });

  it("sans aucune recrue nulle part, la part est zéro et c'est annoncé", () => {
    expect(partSite(undefined, [])).toEqual({
      part: 0,
      base: "aucune",
      recrues: 0,
      recruesSite: 0,
      parApp: {},
    });
  });

  it("la destination est MESURÉE, pas supposée : le site peut envoyer ailleurs", () => {
    // C'est tout l'intérêt du modèle. Rien n'impose Sophia, et le jour où le
    // site partage, la page le voit sans qu'on touche à une ligne.
    const partage = partSite(rec("fr", 10, 4, { sophia: 3, unswipe: 1 }), FLOTTE);
    expect(partage.parApp.sophia).toBeCloseTo(0.75);
    expect(partage.parApp.unswipe).toBeCloseTo(0.25);
  });

  it("la répartition de la flotte additionne tous les marchés", () => {
    const p = partSite(undefined, [
      rec("fr", 10, 4, { sophia: 4 }),
      rec("de", 10, 4, { unswipe: 4 }),
    ]);
    expect(p.parApp.sophia).toBeCloseTo(0.5);
    expect(p.parApp.unswipe).toBeCloseTo(0.5);
  });

  it("une répartition vide annule la part : on n'invente pas de destination", () => {
    const p = partSite(rec("fr", 10, 4, {}), FLOTTE);
    expect(p.parApp).toEqual({});
    expect(cibleHorsSite(lireCibleApplications(null, SLUGS), p.part, p.parApp).partHorsMoteur).toBe(0);
  });
});

describe("cible corrigée des recrues du site", () => {
  const cible = lireCibleApplications({ sophia: 60, unswipe: 25, micabo: 15 }, SLUGS);
  const toutSophia = { sophia: 1 };

  it("sans recrue hors moteur, la cible passe telle quelle", () => {
    const c = cibleHorsSite(cible, 0, toutSophia);
    expect(c.parts).toEqual(cible.parts);
    expect(c.atteignable).toBe(true);
    expect(c.partHorsMoteur).toBe(0);
  });

  it("les chiffres du français : 45 % hors moteur, Sophia ne vise plus que 27 %", () => {
    const c = cibleHorsSite(cible, 5 / 11, toutSophia);
    expect(c.atteignable).toBe(true);
    expect(c.parts.sophia).toBeCloseTo(26.67, 1);
    expect(c.parts.unswipe).toBeCloseTo(45.83, 1);
    expect(c.parts.micabo).toBeCloseTo(27.5, 1);
    expect(c.planchers.sophia).toBeCloseTo(45.45, 1);
    expect(c.planchers.unswipe).toBe(0);
  });

  it("la cible corrigée somme toujours à 100", () => {
    for (const p of [0, 0.1, 5 / 11, 0.6, 0.9, 0.999]) {
      const somme = Object.values(cibleHorsSite(cible, p, toutSophia).parts).reduce(
        (a, b) => a + b,
        0,
      );
      expect(somme, `part ${p}`).toBeCloseTo(100);
    }
  });

  it("LE test : recombinée avec le site, elle retombe sur la cible de l'admin", () => {
    // C'est toute la raison d'être du module. Si cette propriété tombe, le
    // reste n'est que de la décoration.
    for (const p of [0, 0.05, 5 / 11, 0.5]) {
      for (const q of [{ sophia: 1 }, { sophia: 0.7, unswipe: 0.3 }]) {
        const c = cibleHorsSite(cible, p, q);
        if (!c.atteignable) continue;
        for (const slug of SLUGS) {
          const obtenu = 100 * p * (q[slug as keyof typeof q] ?? 0) + (1 - p) * c.parts[slug];
          expect(obtenu, `${slug} à ${p}`).toBeCloseTo(cible.parts[slug]);
        }
      }
    }
  });

  it("viser moins que ce que le site envoie déjà est impossible, et c'est dit", () => {
    const modeste = lireCibleApplications({ sophia: 30, unswipe: 40, micabo: 30 }, SLUGS);
    const c = cibleHorsSite(modeste, 5 / 11, toutSophia);
    expect(c.atteignable).toBe(false);
    expect(c.planchers.sophia).toBeCloseTo(45.45, 1);
    // Sophia tombe à zéro pour les recrues du moteur : elle est déjà
    // sur-servie, les recrues doivent aller ailleurs.
    expect(c.parts.sophia).toBe(0);
    expect(c.parts.unswipe).toBeCloseTo(57.14, 1);
    expect(c.parts.micabo).toBeCloseTo(42.86, 1);
  });

  it("c'est l'APPLICATION qui coince, pas Sophia par principe", () => {
    // Le site envoie tout sur Unswipe et l'admin n'en veut que 10 % : c'est
    // Unswipe qui bloque, et le modèle doit le voir sans rien d'écrit en dur.
    const versUnswipe = { unswipe: 1 };
    const c = cibleHorsSite(
      lireCibleApplications({ sophia: 90, unswipe: 10 }, SLUGS),
      0.5,
      versUnswipe,
    );
    expect(c.atteignable).toBe(false);
    expect(c.planchers.unswipe).toBeCloseTo(50);
    expect(c.planchers.sophia).toBe(0);
    expect(c.parts.unswipe).toBe(0);
    expect(c.parts.sophia).toBeCloseTo(100);
  });

  it("inatteignable, la somme fait encore 100", () => {
    const modeste = lireCibleApplications({ sophia: 10, unswipe: 90 }, SLUGS);
    const c = cibleHorsSite(modeste, 0.5, toutSophia);
    expect(Object.values(c.parts).reduce((a, b) => a + b, 0)).toBeCloseTo(100);
  });

  it("tout décidé par le site : seules ses parts restent vraies", () => {
    expect(cibleHorsSite(lireCibleApplications({ sophia: 100 }, SLUGS), 1, toutSophia).atteignable)
      .toBe(true);
    const c = cibleHorsSite(cible, 1, toutSophia);
    expect(c.atteignable).toBe(false);
    expect(c.parts.sophia).toBeCloseTo(100);
  });

  it("une cible pile égale au plancher reste atteignable", () => {
    const pile = lireCibleApplications({ sophia: 50, unswipe: 50 }, SLUGS);
    const c = cibleHorsSite(pile, 0.5, toutSophia);
    expect(c.atteignable).toBe(true);
    expect(c.parts.sophia).toBeCloseTo(0);
    expect(c.parts.unswipe).toBeCloseTo(100);
  });

  it("une part aberrante est bornée au lieu de propager un NaN", () => {
    for (const p of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const c = cibleHorsSite(cible, p, toutSophia);
      for (const v of Object.values(c.parts)) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("sur un marché où Sophia est seule, la correction ne change rien", () => {
    // La cible renormalisée vaut déjà 100 % Sophia : quelle que soit la part
    // hors moteur, il n'y a pas d'autre application où envoyer qui que ce soit.
    const seule = lireCibleApplications({ sophia: 100 }, ["sophia"]);
    const c = cibleHorsSite(seule, 0.45, toutSophia);
    expect(c.atteignable).toBe(true);
    expect(c.parts.sophia).toBeCloseTo(100);
  });
});

describe("répartition des tirages du site", () => {
  it("part nulle : aucun tirage n'est du site", () => {
    expect([...Array(20).keys()].some((i) => estTirageSite(i, 0))).toBe(false);
  });

  it("part pleine : tous le sont", () => {
    expect([...Array(20).keys()].every((i) => estTirageSite(i, 1))).toBe(true);
  });

  it("le compte tombe juste sur vingt tirages", () => {
    const n = 20;
    for (const p of [0.1, 0.25, 5 / 11, 0.5, 0.75]) {
      const combien = [...Array(n).keys()].filter((i) => estTirageSite(i, p)).length;
      expect(combien, `part ${p}`).toBe(Math.floor(n * p));
    }
  });

  it("ils sont étalés, pas tous au début", () => {
    // Si les neuf recrues sortaient d'affilée, la projection ferait croire
    // que le site rafle les premiers labels puis disparaît.
    const rangs = [...Array(20).keys()].filter((i) => estTirageSite(i, 5 / 11));
    expect(rangs.length).toBe(9);
    const ecarts = rangs.slice(1).map((r, i) => r - rangs[i]);
    expect(Math.max(...ecarts)).toBeLessThanOrEqual(3);
  });

  it("deux appels donnent la même suite : la page ne bouge pas d'une ouverture à l'autre", () => {
    const a = [...Array(30).keys()].map((i) => estTirageSite(i, 0.37));
    const b = [...Array(30).keys()].map((i) => estTirageSite(i, 0.37));
    expect(a).toEqual(b);
  });
});

describe("où va la prochaine recrue du site", () => {
  it("une seule destination : toujours la même", () => {
    expect(prochaineAppSite({}, { sophia: 1 })).toBe("sophia");
    expect(prochaineAppSite({ sophia: 12 }, { sophia: 1 })).toBe("sophia");
  });

  it("aucune destination : rien, plutôt qu'un tirage au hasard", () => {
    expect(prochaineAppSite({}, {})).toBeNull();
  });

  it("trois quarts un quart : la suite suit la mesure, sans paquet", () => {
    const deja: Record<string, number> = {};
    const suite: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const app = prochaineAppSite(deja, { sophia: 3, unswipe: 1 })!;
      deja[app] = (deja[app] ?? 0) + 1;
      suite.push(app);
    }
    expect(deja).toEqual({ sophia: 6, unswipe: 2 });
    // Et jamais deux unswipe d'affilée sur une proportion de un quart.
    expect(suite.join(",")).not.toMatch(/unswipe,unswipe/);
  });

  it("moitié moitié : alternance stricte", () => {
    const deja: Record<string, number> = {};
    const suite: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const app = prochaineAppSite(deja, { sophia: 1, unswipe: 1 })!;
      deja[app] = (deja[app] ?? 0) + 1;
      suite.push(app);
    }
    expect(suite).toEqual(["sophia", "unswipe", "sophia", "unswipe", "sophia", "unswipe"]);
  });

  it("une destination à zéro n'est jamais choisie", () => {
    const deja: Record<string, number> = {};
    for (let i = 0; i < 5; i += 1) {
      const app = prochaineAppSite(deja, { sophia: 1, unswipe: 0 })!;
      deja[app] = (deja[app] ?? 0) + 1;
    }
    expect(deja).toEqual({ sophia: 5 });
  });
});
