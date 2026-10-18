import { describe, expect, it } from "vitest";

import { cibleHorsCohorte } from "./provenance";
import { lireCibleApplications, type MarcheApplications } from "./scoreApplication";
import { REGLAGES_CHOIX_LABEL_DEFAUT, type StatLabel } from "./scoreLabel";
import { simulerTirages } from "./tirages";

const SOPHIA = { id: "id-sophia", slug: "sophia", langues: null };
const UNSWIPE = { id: "id-unswipe", slug: "unswipe", langues: ["fr", "de"] };
const APPS = [SOPHIA, UNSWIPE];
const R = REGLAGES_CHOIX_LABEL_DEFAUT;

function stat(label_id: string, over: Partial<StatLabel> = {}): StatLabel {
  return {
    label_id,
    label_nom: label_id,
    comptes_langue: 0,
    comptes_pays: 0,
    comptes_total: 0,
    passages_restants: 2000,
    demande_jour: 10,
    passages: 500,
    perf_label: 1,
    perf_flotte: 1,
    recents_langue: 0,
    recence_langue: 0,
    recents_pays: 0,
    recence_pays: 0,
    ...over,
  };
}

function marche(langue: string, parts: Record<string, number> = {}): MarcheApplications {
  return {
    langue,
    pays: langue === "fr" ? "FR" : "PL",
    parts: Object.entries(parts).map(([slug, comptes]) => ({
      application_id: APPS.find((a) => a.slug === slug)!.id,
      slug,
      comptes,
    })),
  };
}

describe("projection des prochains tirages", () => {
  const cible = lireCibleApplications({ sophia: 60, unswipe: 40 }, ["sophia", "unswipe"]);
  const stats = {
    "id-sophia": [stat("a"), stat("b")],
    "id-unswipe": [stat("c")],
  };

  it("les parts somment à 100", () => {
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20);
    expect(Math.round(t.reduce((a, x) => a + x.part, 0))).toBe(100);
  });

  it("la projection couvre bien n comptes", () => {
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20);
    expect(t.reduce((a, x) => a + x.comptes, 0)).toBe(20);
  });

  it("en polonais, Unswipe ne sert pas : tout va à Sophia", () => {
    const t = simulerTirages(marche("pl"), stats, cible, APPS, R, 10);
    expect(t.every((x) => x.app === "sophia")).toBe(true);
    expect(t.reduce((a, x) => a + x.comptes, 0)).toBe(10);
  });

  it("en français, les deux applications servent, dans l'ordre de la cible", () => {
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 10);
    const parApp = new Map<string, number>();
    for (const x of t) parApp.set(x.app, (parApp.get(x.app) ?? 0) + x.comptes);
    expect(parApp.get("sophia")).toBe(6);
    expect(parApp.get("unswipe")).toBe(4);
  });

  it("les deux labels d'une application se partagent ses tirages", () => {
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 10);
    const sophia = t.filter((x) => x.app === "sophia");
    expect(sophia).toHaveLength(2);
    expect(sophia[0].comptes).toBe(3);
    expect(sophia[1].comptes).toBe(3);
  });

  it("un label déjà installé passe derrière celui qui est libre", () => {
    const charge = {
      "id-sophia": [stat("a", { comptes_pays: 10, comptes_langue: 10 }), stat("b")],
    };
    const seule = lireCibleApplications(null, ["sophia"]);
    // Sur 6 tirages, « a » (20 de présence) ne repasse jamais devant « b »,
    // qui part de 0 et plafonne à 12 de présence au dernier tour.
    const six = simulerTirages(marche("pl"), charge, seule, [SOPHIA], R, 6);
    expect(six.map((x) => x.label_nom)).toEqual(["b"]);

    // Il revient quand « b » s'est assez rempli pour le rattraper.
    const trente = simulerTirages(marche("pl"), charge, seule, [SOPHIA], R, 30);
    const a = trente.find((x) => x.label_nom === "a");
    const b = trente.find((x) => x.label_nom === "b")!;
    expect(a, "« a » finit par revenir").toBeDefined();
    expect(b.comptes).toBeGreaterThan(a!.comptes);
  });

  it("une application sans label utilisable est sautée, pas de compte perdu", () => {
    const sansLabels = { "id-sophia": [stat("a")], "id-unswipe": [] };
    const t = simulerTirages(marche("fr"), sansLabels, cible, APPS, R, 8);
    expect(t.reduce((a, x) => a + x.comptes, 0)).toBe(8);
    expect(t.every((x) => x.app === "sophia")).toBe(true);
  });

  it("aucune donnée du tout : projection vide, pas de boucle infinie", () => {
    expect(simulerTirages(marche("fr"), {}, cible, APPS, R, 20)).toEqual([]);
  });

  it("un label fermé n'apparaît jamais dans la projection", () => {
    const ferme = { ...R, fermes: ["a"] };
    const t = simulerTirages(marche("pl"), { "id-sophia": [stat("a"), stat("b")] },
      lireCibleApplications(null, ["sophia"]), [SOPHIA], ferme, 6);
    expect(t.map((x) => x.label_nom)).toEqual(["b"]);
  });

  it("n = 0 ne rend rien", () => {
    expect(simulerTirages(marche("fr"), stats, cible, APPS, R, 0)).toEqual([]);
  });

  it("la projection est stable : deux appels donnent le même résultat", () => {
    const a = simulerTirages(marche("fr"), stats, cible, APPS, R, 15);
    const b = simulerTirages(marche("fr"), stats, cible, APPS, R, 15);
    expect(a).toEqual(b);
  });

  it("elle ne modifie pas les statistiques qu'on lui passe", () => {
    const copie = JSON.parse(JSON.stringify(stats));
    simulerTirages(marche("fr"), stats, cible, APPS, R, 20);
    expect(stats).toEqual(copie);
  });
});

describe("cohorte Ruul dans la projection", () => {
  const cible = lireCibleApplications({ sophia: 60, unswipe: 40 }, ["sophia", "unswipe"]);
  const stats = {
    "id-sophia": [stat("a"), stat("b")],
    "id-unswipe": [stat("c")],
  };

  function parApp(t: ReturnType<typeof simulerTirages>): Record<string, number> {
    const r: Record<string, number> = {};
    for (const x of t) r[x.app] = (r[x.app] ?? 0) + x.comptes;
    return r;
  }

  it("sans option, rien ne change : la projection est celle d'avant", () => {
    const avant = simulerTirages(marche("fr"), stats, cible, APPS, R, 20);
    const avecZero = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partCohorte: 0 });
    expect(avecZero).toEqual(avant);
    expect(avant.every((x) => x.comptesCohorte === 0)).toBe(true);
  });

  it("tant que la cohorte reste sous la cible, la répartition ne bouge pas", () => {
    // C'est la propriété qui justifie de passer la cible de l'admin TELLE
    // QUELLE à la projection. Les comptes de la cohorte comptent comme les
    // autres, donc Sainte-Laguë envoie d'autant moins de recrues placées par
    // le moteur vers Sophia, et le total retombe sur 60/40 tout seul.
    //
    // L'invariant n'est PAS universel, et le nom ne doit pas le laisser
    // croire : il vaut tant que la part promise reste sous la cible de
    // Sophia. Au-delà, voir le test suivant.
    for (const p of [0, 0.25, 5 / 11, 0.5]) {
      const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partCohorte: p });
      expect(parApp(t), `part ${p}`).toEqual({ sophia: 12, unswipe: 8 });
    }
  });

  it("au-dessus de la cible, Sophia la dépasse : c'est le cas inatteignable", () => {
    // 70 % de recrues promises contre une cible à 60 % : le moteur ne peut
    // plus rien y faire, et la projection doit le montrer au lieu de
    // prétendre tenir la cible.
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partCohorte: 0.7 });
    const obtenu = parApp(t);
    expect(obtenu.sophia).toBeGreaterThan(12);
    expect(obtenu.sophia).toBeGreaterThanOrEqual(14);
    // Et c'est exactement le plancher qu'annonce cibleHorsCohorte.
    expect(cibleHorsCohorte(cible, 0.7).atteignable).toBe(false);
    expect(cibleHorsCohorte(cible, 0.7).minimum).toBeCloseTo(70);
  });

  it("corriger la cible EN PLUS ferait chuter Sophia sous le demandé", () => {
    // Le piège que les deux modules documentent en majuscules, enfin mis en
    // évidence : on fait exprès la bêtise et on constate les dégâts.
    const p = 5 / 11;
    const brute = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partCohorte: p });
    const corrigee = cibleHorsCohorte(cible, p);
    const doublement = simulerTirages(
      marche("fr"),
      stats,
      { source: "reglage", parts: corrigee.parts },
      APPS,
      R,
      20,
      { partCohorte: p },
    );
    // La bonne façon tombe sur la cible de l'admin, 60 % de 20.
    expect(parApp(brute).sophia).toBe(12);
    // La double correction, elle, sous-sert Sophia.
    expect(parApp(doublement).sophia).toBeLessThan(12);
  });

  it("le nombre de recrues promises est celui annoncé, et toutes sont sur Sophia", () => {
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partCohorte: 0.5 });
    expect(t.reduce((a, x) => a + x.comptesCohorte, 0)).toBe(10);
    expect(t.filter((x) => x.comptesCohorte > 0).every((x) => x.app === "sophia")).toBe(true);
  });

  it("une recrue de la cohorte part sur Sophia même si l'admin y vise 0 %", () => {
    // La règle est une contrainte, pas une préférence : elle ne passe donc pas
    // par classerApplications, qui écarte une application à cible nulle.
    const sansSophia = lireCibleApplications({ unswipe: 100 }, ["sophia", "unswipe"]);
    const t = simulerTirages(
      marche("fr"),
      { "id-sophia": [stat("a")], "id-unswipe": [stat("c")] },
      sansSophia,
      APPS,
      R,
      10,
      { partCohorte: 0.3 },
    );
    expect(parApp(t)).toEqual({ sophia: 3, unswipe: 7 });
    expect(t.find((x) => x.app === "sophia")!.comptesCohorte).toBe(3);
  });

  it("Sophia sans label ouvert : la cohorte cale, le recrutement continue", () => {
    // Avant, un seul échec sortait de TOUTE la boucle et tronquait aussi les
    // tirages que le moteur pouvait encore placer.
    const t = simulerTirages(
      marche("fr"),
      { "id-sophia": [], "id-unswipe": [stat("c")] },
      lireCibleApplications({ sophia: 50, unswipe: 50 }, ["sophia", "unswipe"]),
      APPS,
      R,
      10,
      { partCohorte: 0.5 },
    );
    expect(parApp(t)).toEqual({ unswipe: 5 });
    expect(t.reduce((a, x) => a + x.comptesCohorte, 0)).toBe(0);
  });

  it("en polonais, où seule Sophia sert, tout est Sophia et la cohorte est comptée", () => {
    const t = simulerTirages(
      marche("pl"),
      { "id-sophia": [stat("a"), stat("b")] },
      lireCibleApplications(null, ["sophia"]),
      [SOPHIA],
      R,
      10,
      { partCohorte: 0.4 },
    );
    expect(t.every((x) => x.app === "sophia")).toBe(true);
    expect(t.reduce((a, x) => a + x.comptes, 0)).toBe(10);
    expect(t.reduce((a, x) => a + x.comptesCohorte, 0)).toBe(4);
  });

  it("comptesCohorte ne dépasse jamais comptes", () => {
    for (const p of [0.1, 0.5, 0.9, 1]) {
      const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partCohorte: p });
      for (const x of t) expect(x.comptesCohorte, `part ${p}`).toBeLessThanOrEqual(x.comptes);
    }
  });

  it("tout promis : les vingt comptes sont Sophia, et tous de la cohorte", () => {
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partCohorte: 1 });
    expect(parApp(t)).toEqual({ sophia: 20 });
    expect(t.reduce((a, x) => a + x.comptesCohorte, 0)).toBe(20);
  });

  it("la projection reste stable : deux appels donnent le même résultat", () => {
    const a = simulerTirages(marche("fr"), stats, cible, APPS, R, 15, { partCohorte: 5 / 11 });
    const b = simulerTirages(marche("fr"), stats, cible, APPS, R, 15, { partCohorte: 5 / 11 });
    expect(a).toEqual(b);
  });

  it("elle ne modifie toujours pas les statistiques qu'on lui passe", () => {
    const copie = JSON.parse(JSON.stringify(stats));
    simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partCohorte: 0.5 });
    expect(stats).toEqual(copie);
  });
});

describe("robustesse de l'option cohorte", () => {
  const cible = lireCibleApplications({ sophia: 60, unswipe: 40 }, ["sophia", "unswipe"]);
  const stats = { "id-sophia": [stat("a")], "id-unswipe": [stat("c")] };

  it("une part aberrante est bornée, pas propagée", () => {
    const attendu = simulerTirages(marche("fr"), stats, cible, APPS, R, 10);
    for (const p of [Number.NaN, -1, undefined]) {
      expect(
        simulerTirages(marche("fr"), stats, cible, APPS, R, 10, { partCohorte: p }),
        `part ${p}`,
      ).toEqual(attendu);
    }
    // Au-dessus de 1, on plafonne à « tout promis ».
    const trop = simulerTirages(marche("fr"), stats, cible, APPS, R, 10, { partCohorte: 4 });
    expect(trop.every((x) => x.app === "sophia")).toBe(true);
    expect(trop.reduce((a, x) => a + x.comptesCohorte, 0)).toBe(10);
  });

  it("sans donnée du tout, la boucle sort tout de suite même avec une cohorte", () => {
    expect(simulerTirages(marche("fr"), {}, cible, APPS, R, 20, { partCohorte: 0.5 })).toEqual([]);
  });
});
