import { describe, expect, it } from "vitest";

import {
  APPLICATION_COHORTE_RUUL,
  cibleHorsCohorte,
  estTirageCohorte,
  partCohorte,
  RECRUES_MINIMUM_MARCHE,
  type ProvenanceMarche,
} from "./provenance";
import { lireCibleApplications } from "./scoreApplication";

const SLUGS = ["sophia", "unswipe", "micabo"];

function prov(
  langue: string,
  recrues: number,
  recruesRuul: number,
  recruesRuulHorsSophia = 0,
): ProvenanceMarche {
  return { langue, pays: langue.toUpperCase(), recrues, recruesRuul, recruesRuulHorsSophia };
}

// Les chiffres de la prod au 18/10, fenêtre de 30 jours : c'est le cas qui a
// motivé tout le module, il mérite d'être figé dans un test.
const FLOTTE: ProvenanceMarche[] = [
  prov("fr", 11, 5),
  prov("it", 9, 1),
  prov("es", 7, 1),
  prov("de", 15, 0),
  prov("tr", 9, 0),
];

describe("part promise à la cohorte", () => {
  it("un marché assez fourni parle pour lui-même", () => {
    const p = partCohorte(prov("fr", 11, 5), FLOTTE);
    expect(p.base).toBe("marche");
    expect(p.part).toBeCloseTo(5 / 11);
    expect(p.recrues).toBe(11);
    expect(p.recruesRuul).toBe(5);
  });

  it("un marché trop mince retombe sur la flotte, et le dit", () => {
    const p = partCohorte(prov("pl", 1, 1), FLOTTE);
    // Sans ce garde-fou, une seule recrue ferait « 100 % de la cohorte » et
    // verrouillerait tout le marché polonais sur Sophia.
    expect(p.base).toBe("flotte");
    expect(p.part).toBeCloseTo(7 / 51);
    expect(p.recrues).toBe(51);
  });

  it("le seuil est celui annoncé, pas un de plus", () => {
    expect(partCohorte(prov("pl", RECRUES_MINIMUM_MARCHE, 1), FLOTTE).base).toBe("marche");
    expect(partCohorte(prov("pl", RECRUES_MINIMUM_MARCHE - 1, 1), FLOTTE).base).toBe("flotte");
  });

  it("un marché inconnu retombe aussi sur la flotte", () => {
    expect(partCohorte(undefined, FLOTTE).base).toBe("flotte");
  });

  it("sans aucune recrue nulle part, la part est zéro et c'est annoncé", () => {
    const p = partCohorte(undefined, []);
    expect(p).toEqual({
      part: 0,
      base: "aucune",
      recrues: 0,
      recruesRuul: 0,
      recruesRuulHorsSophia: 0,
    });
  });

  it("une flotte sans cohorte donne zéro, pas une division ratée", () => {
    const p = partCohorte(undefined, [prov("de", 15, 0)]);
    expect(p.part).toBe(0);
    expect(p.base).toBe("flotte");
  });
});

describe("cible corrigée de la cohorte", () => {
  const cible = lireCibleApplications({ sophia: 60, unswipe: 25, micabo: 15 }, SLUGS);

  it("sans recrue promise, la cible passe telle quelle", () => {
    const c = cibleHorsCohorte(cible, 0);
    expect(c.parts).toEqual(cible.parts);
    expect(c.atteignable).toBe(true);
    expect(c.partPromise).toBe(0);
  });

  it("les chiffres du français : 45 % promis, Sophia ne vise plus que 27 %", () => {
    const c = cibleHorsCohorte(cible, 5 / 11);
    expect(c.atteignable).toBe(true);
    expect(c.parts.sophia).toBeCloseTo(26.67, 1);
    expect(c.parts.unswipe).toBeCloseTo(45.83, 1);
    expect(c.parts.micabo).toBeCloseTo(27.5, 1);
  });

  it("la cible corrigée somme toujours à 100", () => {
    for (const p of [0, 0.1, 5 / 11, 0.6, 0.9, 0.999]) {
      const somme = Object.values(cibleHorsCohorte(cible, p).parts).reduce((a, b) => a + b, 0);
      expect(somme, `part ${p}`).toBeCloseTo(100);
    }
  });

  it("LE test : recombinée avec la cohorte, elle retombe sur la cible de l'admin", () => {
    // C'est toute la raison d'être du module. Si cette propriété tombe, le
    // reste n'est que de la décoration.
    for (const p of [0, 0.05, 5 / 11, 0.5]) {
      const c = cibleHorsCohorte(cible, p);
      for (const slug of SLUGS) {
        const promis = slug === APPLICATION_COHORTE_RUUL ? p : 0;
        const obtenu = 100 * promis + (1 - p) * c.parts[slug];
        expect(obtenu, `${slug} à ${p}`).toBeCloseTo(cible.parts[slug]);
      }
    }
  });

  it("viser moins de Sophia que la cohorte n'en fournit est impossible, et c'est dit", () => {
    const modeste = lireCibleApplications({ sophia: 30, unswipe: 40, micabo: 30 }, SLUGS);
    const c = cibleHorsCohorte(modeste, 5 / 11);
    expect(c.atteignable).toBe(false);
    expect(c.minimum).toBeCloseTo(45.45, 1);
    // Sophia tombe à zéro pour les recrues du moteur : elle est déjà
    // sur-servie, les recrues doivent aller ailleurs.
    expect(c.parts.sophia).toBe(0);
    expect(c.parts.unswipe).toBeCloseTo(57.14, 1);
    expect(c.parts.micabo).toBeCloseTo(42.86, 1);
  });

  it("inatteignable, la somme fait encore 100", () => {
    const modeste = lireCibleApplications({ sophia: 10, unswipe: 90 }, SLUGS);
    const c = cibleHorsCohorte(modeste, 0.5);
    expect(Object.values(c.parts).reduce((a, b) => a + b, 0)).toBeCloseTo(100);
  });

  it("tout promis : seule « 100 % Sophia » reste vraie", () => {
    const toutSophia = lireCibleApplications({ sophia: 100 }, SLUGS);
    expect(cibleHorsCohorte(toutSophia, 1).atteignable).toBe(true);
    expect(cibleHorsCohorte(cible, 1).atteignable).toBe(false);
    expect(cibleHorsCohorte(cible, 1).parts).toEqual({ sophia: 100 });
  });

  it("une cible pile égale à la part promise reste atteignable, Sophia à zéro", () => {
    const pile = lireCibleApplications({ sophia: 50, unswipe: 50 }, SLUGS);
    const c = cibleHorsCohorte(pile, 0.5);
    expect(c.atteignable).toBe(true);
    expect(c.parts.sophia).toBeCloseTo(0);
    expect(c.parts.unswipe).toBeCloseTo(100);
  });

  it("une part aberrante est bornée au lieu de propager un NaN", () => {
    for (const p of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const c = cibleHorsCohorte(cible, p);
      for (const v of Object.values(c.parts)) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("sur un marché où Sophia est seule, la correction ne change rien", () => {
    // En polonais, la cible renormalisée vaut déjà 100 % Sophia : quelle que
    // soit la part promise, il n'y a pas d'autre application où envoyer qui
    // que ce soit.
    const seule = lireCibleApplications({ sophia: 100 }, ["sophia"]);
    const c = cibleHorsCohorte(seule, 0.45);
    expect(c.atteignable).toBe(true);
    expect(c.parts.sophia).toBeCloseTo(100);
  });
});

describe("répartition des tirages de la cohorte", () => {
  it("part nulle : aucun tirage n'est de la cohorte", () => {
    expect([...Array(20).keys()].some((i) => estTirageCohorte(i, 0))).toBe(false);
  });

  it("part pleine : tous le sont", () => {
    expect([...Array(20).keys()].every((i) => estTirageCohorte(i, 1))).toBe(true);
  });

  it("le compte tombe juste sur vingt tirages", () => {
    const n = 20;
    for (const p of [0.1, 0.25, 5 / 11, 0.5, 0.75]) {
      const combien = [...Array(n).keys()].filter((i) => estTirageCohorte(i, p)).length;
      expect(combien, `part ${p}`).toBe(Math.floor(n * p));
    }
  });

  it("ils sont étalés, pas tous au début", () => {
    // Si les neuf recrues promises sortaient d'affilée, la projection ferait
    // croire que Sophia rafle les premiers labels puis disparaît.
    const rangs = [...Array(20).keys()].filter((i) => estTirageCohorte(i, 5 / 11));
    expect(rangs.length).toBe(9);
    const ecarts = rangs.slice(1).map((r, i) => r - rangs[i]);
    expect(Math.max(...ecarts)).toBeLessThanOrEqual(3);
  });

  it("deux appels donnent la même suite : la page ne bouge pas d'une ouverture à l'autre", () => {
    const a = [...Array(30).keys()].map((i) => estTirageCohorte(i, 0.37));
    const b = [...Array(30).keys()].map((i) => estTirageCohorte(i, 0.37));
    expect(a).toEqual(b);
  });
});
