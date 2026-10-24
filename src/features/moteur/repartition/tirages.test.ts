import { describe, expect, it } from "vitest";

import { cibleHorsSite } from "./provenance";
import { lireCibleApplications, type MarcheApplications } from "./scoreApplication";
import type { ReglagesFileLabels } from "../types";
import { REGLAGES_CHOIX_LABEL_DEFAUT, type StatLabel } from "./scoreLabel";
import { simulerTirages } from "./tirages";

const SOPHIA = { id: "id-sophia", slug: "sophia", langues: null };
const UNSWIPE = { id: "id-unswipe", slug: "unswipe", langues: ["fr", "de"] };
const APPS = [SOPHIA, UNSWIPE];
const R = REGLAGES_CHOIX_LABEL_DEFAUT;
/** Ce que le site envoie aujourd'hui : tout sur Sophia. MESURÉ, pas imposé. */
const SOPHIA_SEUL = { sophia: 1 };

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

  it("un label déjà installé passe derrière celui qui est libre, sans tout rafler", () => {
    const charge = {
      "id-sophia": [stat("a", { comptes_pays: 10, comptes_langue: 10 }), stat("b")],
    };
    const seule = lireCibleApplications(null, ["sophia"]);
    // « b » part de zéro et prend la main, mais il ne rafle pas les six : au
    // bout de deux tirages il remplit la fenêtre anti-rafale du moteur
    // (`rafaleRecents` = 2 sur les 3 derniers comptes de la langue) et passe
    // derrière « a » le temps d'un tour. C'est la barrière que la projection
    // ne jouait jamais, faute de remettre `recents_langue` à jour.
    const six = simulerTirages(marche("pl"), charge, seule, [SOPHIA], R, 6);
    expect(six.map((x) => `${x.label_nom}:${x.comptes}`)).toEqual(["b:4", "a:2"]);

    // Sur la durée, « b » garde l'avantage de son retard mais les deux
    // convergent : c'est le comportement du moteur, pas une alternance.
    const trente = simulerTirages(marche("pl"), charge, seule, [SOPHIA], R, 30);
    const a = trente.find((x) => x.label_nom === "a")!;
    const b = trente.find((x) => x.label_nom === "b")!;
    expect(b.comptes).toBeGreaterThan(a.comptes);
    expect(a.comptes + b.comptes).toBe(30);
  });

  it("deux labels à égalité alternent, au lieu d'en laisser un tout prendre", () => {
    // Sans fenêtre anti-rafale, le premier label gagnait les dix tirages : à
    // chaque tour son poids était recalculé mais rien ne disait au classement
    // qu'il venait de servir.
    const deux = { "id-sophia": [stat("x"), stat("y")] };
    const t = simulerTirages(
      marche("pl"),
      deux,
      lireCibleApplications(null, ["sophia"]),
      [SOPHIA],
      R,
      10,
    );
    expect(t.map((x) => `${x.label_nom}:${x.comptes}`).sort()).toEqual(["x:5", "y:5"]);
  });

  it("une application sans label ne passe pas la main : le tirage est perdu", () => {
    // Le moteur fige son gagnant (`choisirApplicationPourCompte`) : si elle
    // n'a aucun label, il répond NO_LABELS et la création échoue. La
    // projection descendait le classement, ce qui lui faisait afficher des
    // comptes sur une application qui n'en recevra jamais.
    const sansLabels = { "id-sophia": [stat("a")], "id-unswipe": [] };
    const t = simulerTirages(marche("fr"), sansLabels, cible, APPS, R, 8);
    expect(t.every((x) => x.app === "sophia")).toBe(true);
    // Le premier tirage va à Sophia, le deuxième vise Unswipe et se perd.
    expect(t.reduce((a, x) => a + x.comptes, 0)).toBe(1);
  });

  it("tous les labels d'une application fermés : elle reçoit quand même sa part", () => {
    // `choisirLabel` est appelé avec `jamaisSansLabel: true` : plutôt que de
    // refuser le compte, le moteur reclasse la MÊME application en ignorant
    // les fermetures et donne un label fermé. Sauter l'application faisait
    // disparaître de la projection une part qui sera bel et bien attribuée.
    const ferme = { ...R, fermes: ["a"] };
    const t = simulerTirages(
      marche("pl"),
      { "id-sophia": [stat("a")] },
      lireCibleApplications(null, ["sophia"]),
      [SOPHIA],
      ferme,
      4,
    );
    expect(t.map((x) => `${x.label_nom}:${x.comptes}`)).toEqual(["a:4"]);
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

  it("la projection déroule le classement DU MOTEUR, pas la règle proposée", () => {
    // La carte promet « exactement comme le fera le moteur ». Elle a longtemps
    // déroulé `classerPropose`, la règle d'une page Notion que personne n'a
    // branchée côté serveur. Les deux règles se séparent ici : le moteur a une
    // barrière anti-rafale — un label qui vient de prendre les derniers
    // comptes de la langue passe derrière tous les autres — que la règle
    // proposée n'a pas du tout, son score ne regarde que la présence.
    const rafale = {
      "id-sophia": [stat("a", { recents_langue: R.rafaleRecents }), stat("b")],
    };
    const seule = lireCibleApplications(null, ["sophia"]);
    const moteur = simulerTirages(marche("pl"), rafale, seule, [SOPHIA], R, 1);
    expect(moteur.map((x) => x.label_nom)).toEqual(["b"]);

    const propose = simulerTirages(marche("pl"), rafale, seule, [SOPHIA], R, 1, {
      regle: "propose",
    });
    expect(propose.map((x) => x.label_nom)).toEqual(["a"]);
  });

  it("la réserve basse relègue aussi, et seule la règle du moteur le voit", () => {
    // Deuxième barrière que la règle proposée ignore : sous la réserve
    // minimale, le label passe après les autres même s'il est moins présent.
    const maigre = {
      "id-sophia": [
        // Un compte chacun dans le pays (aucun n'y est saturé) ; b plus présent
        // dans la langue, donc la règle proposée, aveugle à la réserve, prend a.
        stat("a", { passages_restants: 30, comptes_langue: 1, comptes_pays: 1, comptes_total: 1 }),
        stat("b", { comptes_langue: 20, comptes_pays: 1, comptes_total: 20 }),
      ],
    };
    const seule = lireCibleApplications(null, ["sophia"]);
    expect(
      simulerTirages(marche("pl"), maigre, seule, [SOPHIA], R, 1).map((x) => x.label_nom),
    ).toEqual(["b"]);
    expect(
      simulerTirages(marche("pl"), maigre, seule, [SOPHIA], R, 1, { regle: "propose" }).map(
        (x) => x.label_nom,
      ),
    ).toEqual(["a"]);
  });

  it("un pays saturé passe avant la réserve basse : 8 comptes sur 8, le suivant change (0354)", () => {
    const sature = {
      "id-sophia": [
        stat("a", { passages_restants: 30 }),
        stat("b", { comptes_langue: 8, comptes_pays: 8, comptes_total: 8 }),
      ],
    };
    const seule = lireCibleApplications(null, ["sophia"]);
    expect(
      simulerTirages(marche("pl"), sature, seule, [SOPHIA], R, 1).map((x) => x.label_nom),
    ).toEqual(["a"]);
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

describe("recrues du site dans la projection", () => {
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
    const avecZero = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partSite: 0, siteParApp: SOPHIA_SEUL });
    expect(avecZero).toEqual(avant);
    expect(avant.every((x) => x.comptesSite === 0)).toBe(true);
  });

  it("tant que le site reste sous la cible, la répartition ne bouge pas", () => {
    // C'est la propriété qui justifie de passer la cible de l'admin TELLE
    // QUELLE à la projection. Les comptes du site comptent comme les
    // autres, donc Sainte-Laguë envoie d'autant moins de recrues placées par
    // le moteur vers Sophia, et le total retombe sur 60/40 tout seul.
    //
    // L'invariant n'est PAS universel, et le nom ne doit pas le laisser
    // croire : il vaut tant que la part promise reste sous la cible de
    // Sophia. Au-delà, voir le test suivant.
    for (const p of [0, 0.25, 5 / 11, 0.5]) {
      const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partSite: p, siteParApp: SOPHIA_SEUL });
      expect(parApp(t), `part ${p}`).toEqual({ sophia: 12, unswipe: 8 });
    }
  });

  it("au-dessus de la cible, Sophia la dépasse : c'est le cas inatteignable", () => {
    // 70 % de recrues du site contre une cible à 60 % : le moteur ne peut
    // plus rien y faire, et la projection doit le montrer au lieu de
    // prétendre tenir la cible.
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partSite: 0.7, siteParApp: SOPHIA_SEUL });
    const obtenu = parApp(t);
    expect(obtenu.sophia).toBeGreaterThan(12);
    expect(obtenu.sophia).toBeGreaterThanOrEqual(14);
    // Et c'est exactement le plancher qu'annonce cibleHorsSite.
    expect(cibleHorsSite(cible, 0.7, SOPHIA_SEUL).atteignable).toBe(false);
    expect(cibleHorsSite(cible, 0.7, SOPHIA_SEUL).planchers.sophia).toBeCloseTo(70);
  });

  it("corriger la cible EN PLUS ferait chuter Sophia sous le demandé", () => {
    // Le piège que les deux modules documentent en majuscules, enfin mis en
    // évidence : on fait exprès la bêtise et on constate les dégâts.
    const p = 5 / 11;
    const brute = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partSite: p, siteParApp: SOPHIA_SEUL });
    const corrigee = cibleHorsSite(cible, p, SOPHIA_SEUL);
    const doublement = simulerTirages(
      marche("fr"),
      stats,
      { source: "reglage", parts: corrigee.parts },
      APPS,
      R,
      20,
      { partSite: p, siteParApp: SOPHIA_SEUL },
    );
    // La bonne façon tombe sur la cible de l'admin, 60 % de 20.
    expect(parApp(brute).sophia).toBe(12);
    // La double correction, elle, sous-sert Sophia.
    expect(parApp(doublement).sophia).toBeLessThan(12);
  });

  it("le nombre de recrues du site est celui annoncé, et toutes sont sur Sophia", () => {
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partSite: 0.5, siteParApp: SOPHIA_SEUL });
    expect(t.reduce((a, x) => a + x.comptesSite, 0)).toBe(10);
    expect(t.filter((x) => x.comptesSite > 0).every((x) => x.app === "sophia")).toBe(true);
  });

  it("une recrue du site part sur Sophia même si l'admin y vise 0 %", () => {
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
      { partSite: 0.3, siteParApp: SOPHIA_SEUL },
    );
    expect(parApp(t)).toEqual({ sophia: 3, unswipe: 7 });
    expect(t.find((x) => x.app === "sophia")!.comptesSite).toBe(3);
  });

  it("Sophia sans label ouvert : le site cale, le recrutement continue", () => {
    // Un seul échec ne doit pas sortir de TOUTE la boucle : l'autre genre de
    // recrue peut très bien continuer. La cible envoie ici le moteur sur
    // Unswipe, pendant que le site s'obstine sur Sophia, qui n'a rien.
    const t = simulerTirages(
      marche("fr"),
      { "id-sophia": [], "id-unswipe": [stat("c")] },
      lireCibleApplications({ sophia: 10, unswipe: 90 }, ["sophia", "unswipe"]),
      APPS,
      R,
      10,
      { partSite: 0.5, siteParApp: SOPHIA_SEUL },
    );
    expect(parApp(t)).toEqual({ unswipe: 4 });
    expect(t.reduce((a, x) => a + x.comptesSite, 0)).toBe(0);
  });

  it("en polonais, où seule Sophia sert, tout est Sophia et le site est compté", () => {
    const t = simulerTirages(
      marche("pl"),
      { "id-sophia": [stat("a"), stat("b")] },
      lireCibleApplications(null, ["sophia"]),
      [SOPHIA],
      R,
      10,
      { partSite: 0.4, siteParApp: SOPHIA_SEUL },
    );
    expect(t.every((x) => x.app === "sophia")).toBe(true);
    expect(t.reduce((a, x) => a + x.comptes, 0)).toBe(10);
    expect(t.reduce((a, x) => a + x.comptesSite, 0)).toBe(4);
  });

  it("comptesSite ne dépasse jamais comptes", () => {
    for (const p of [0.1, 0.5, 0.9, 1]) {
      const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partSite: p, siteParApp: SOPHIA_SEUL });
      for (const x of t) expect(x.comptesSite, `part ${p}`).toBeLessThanOrEqual(x.comptes);
    }
  });

  it("tout promis : les vingt comptes sont Sophia, et tous du site", () => {
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partSite: 1, siteParApp: SOPHIA_SEUL });
    expect(parApp(t)).toEqual({ sophia: 20 });
    expect(t.reduce((a, x) => a + x.comptesSite, 0)).toBe(20);
  });

  it("le site envoie sur Unswipe : la projection suit, rien n'est écrit en dur", () => {
    // Le cœur de la décision du 18/10. Aucun slug n'est codé dans le moteur :
    // on lui passe ce qui a été MESURÉ, et il place là où le site place.
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 10, {
      partSite: 0.5,
      siteParApp: { unswipe: 1 },
    });
    const unswipe = t.filter((x) => x.app === "unswipe");
    expect(unswipe.reduce((a, x) => a + x.comptesSite, 0)).toBe(5);
    expect(t.filter((x) => x.app === "sophia").every((x) => x.comptesSite === 0)).toBe(true);
  });

  it("le site partage : la suite respecte la proportion mesurée", () => {
    const t = simulerTirages(marche("fr"), stats, cible, APPS, R, 20, {
      partSite: 0.5,
      siteParApp: { sophia: 3, unswipe: 1 },
    });
    const parApp: Record<string, number> = {};
    for (const x of t) parApp[x.app] = (parApp[x.app] ?? 0) + x.comptesSite;
    // Dix recrues du site, réparties trois quarts un quart.
    expect(parApp.sophia).toBe(8);
    expect(parApp.unswipe).toBe(2);
  });

  it("sans répartition mesurée, aucun tirage n'est réservé au site", () => {
    // On n'invente pas une destination : une part sans destination ne veut
    // rien dire, et la projection redevient celle du moteur seul.
    const attendu = simulerTirages(marche("fr"), stats, cible, APPS, R, 20);
    expect(
      simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partSite: 0.5, siteParApp: {} }),
    ).toEqual(attendu);
  });

  it("la projection reste stable : deux appels donnent le même résultat", () => {
    const a = simulerTirages(marche("fr"), stats, cible, APPS, R, 15, { partSite: 5 / 11, siteParApp: SOPHIA_SEUL });
    const b = simulerTirages(marche("fr"), stats, cible, APPS, R, 15, { partSite: 5 / 11, siteParApp: SOPHIA_SEUL });
    expect(a).toEqual(b);
  });

  it("elle ne modifie toujours pas les statistiques qu'on lui passe", () => {
    const copie = JSON.parse(JSON.stringify(stats));
    simulerTirages(marche("fr"), stats, cible, APPS, R, 20, { partSite: 0.5, siteParApp: SOPHIA_SEUL });
    expect(stats).toEqual(copie);
  });
});

describe("robustesse de l'option site", () => {
  const cible = lireCibleApplications({ sophia: 60, unswipe: 40 }, ["sophia", "unswipe"]);
  const stats = { "id-sophia": [stat("a")], "id-unswipe": [stat("c")] };

  it("une part aberrante est bornée, pas propagée", () => {
    const attendu = simulerTirages(marche("fr"), stats, cible, APPS, R, 10);
    for (const p of [Number.NaN, -1, undefined]) {
      expect(
        simulerTirages(marche("fr"), stats, cible, APPS, R, 10, { partSite: p, siteParApp: SOPHIA_SEUL }),
        `part ${p}`,
      ).toEqual(attendu);
    }
    // Au-dessus de 1, on plafonne à « tout promis ».
    const trop = simulerTirages(marche("fr"), stats, cible, APPS, R, 10, { partSite: 4, siteParApp: SOPHIA_SEUL });
    expect(trop.every((x) => x.app === "sophia")).toBe(true);
    expect(trop.reduce((a, x) => a + x.comptesSite, 0)).toBe(10);
  });

  it("sans donnée du tout, la boucle sort tout de suite même avec des recrues du site", () => {
    expect(simulerTirages(marche("fr"), {}, cible, APPS, R, 20, { partSite: 0.5, siteParApp: SOPHIA_SEUL })).toEqual([]);
  });
});

describe("la File des créateurs dans la projection", () => {
  const seule = lireCibleApplications(null, ["sophia"]);
  const deuxApps = lireCibleApplications({ sophia: 70, unswipe: 30 }, ["sophia", "unswipe"]);

  /** Une File vide, à laquelle on ajoute une tranche. */
  function file(
    par_application: Record<string, { items?: string[]; par_langue?: Record<string, string[]> }>,
  ): ReglagesFileLabels {
    const item = (id: string) => ({ label_id: id, ugc: false });
    return {
      items: [],
      par_langue: {},
      par_application: Object.fromEntries(
        Object.entries(par_application).map(([slug, t]) => [
          slug,
          {
            items: (t.items ?? []).map(item),
            par_langue: Object.fromEntries(
              Object.entries(t.par_langue ?? {}).map(([lg, ids]) => [lg, ids.map(item)]),
            ),
          },
        ]),
      ),
    };
  }

  it("le label de la File passe avant le classement", () => {
    // `popLabelFile` tire la file de la langue, puis la file générale, et
    // n'appelle le classement que si les deux sont vides.
    // « boude » est écrasé de comptes : le classement ne le prendra jamais de
    // lui-même, ce qui est exactement la raison d'être de la File.
    const stats = {
      "id-sophia": [
        stat("choisi"),
        stat("boude", { comptes_langue: 500, comptes_pays: 500, comptes_total: 500 }),
      ],
    };
    const sansFile = simulerTirages(marche("pl"), stats, seule, [SOPHIA], R, 1);
    expect(sansFile[0].label_id).toBe("choisi");

    const avecFile = simulerTirages(marche("pl"), stats, seule, [SOPHIA], R, 1, {
      file: file({ sophia: { par_langue: { pl: ["boude"] } } }),
    });
    expect(avecFile[0].label_id).toBe("boude");
  });

  it("une entrée sert UN compte, pas les vingt", () => {
    // La File est un stock qui se vide : `popLabelFile` réécrit la tranche
    // sans l'entrée tirée. La garder entière la ferait resservir à chaque tour.
    const t = simulerTirages(
      marche("pl"),
      {
        "id-sophia": [
          stat("choisi"),
          stat("boude", { comptes_langue: 500, comptes_pays: 500, comptes_total: 500 }),
        ],
      },
      seule,
      [SOPHIA],
      R,
      2,
      { file: file({ sophia: { par_langue: { pl: ["boude"] } } }) },
    );
    // Le premier compte prend l'entrée, le second retombe sur le classement,
    // qui ne voulait pas de « boude ».
    expect(t.find((x) => x.label_id === "boude")!.comptes).toBe(1);
    expect(t.find((x) => x.label_id === "choisi")!.comptes).toBe(1);
  });

  it("la File détourne l'APPLICATION, pas seulement le label", () => {
    // Le cas qui a motivé la règle : amorcer un label sur une application que
    // le classement n'aurait jamais choisie. `choisirApplicationPourCompte`
    // descend son classement et prend le premier candidat qui a une entrée.
    const stats = {
      "id-sophia": [stat("s1")],
      "id-unswipe": [stat("u1")],
    };
    const sansFile = simulerTirages(marche("fr"), stats, deuxApps, APPS, R, 1);
    expect(sansFile[0].app).toBe("sophia");

    const avecFile = simulerTirages(marche("fr"), stats, deuxApps, APPS, R, 1, {
      file: file({ unswipe: { par_langue: { fr: ["u1"] } } }),
    });
    expect(avecFile[0].app).toBe("unswipe");
    expect(avecFile[0].label_id).toBe("u1");
  });

  it("une entrée qui vise un label fermé est jetée, pas servie", () => {
    // Même règle que `popLabelFile` : sinon la nuit reprendrait le label au
    // compte dès le lendemain.
    const t = simulerTirages(
      marche("pl"),
      { "id-sophia": [stat("ouvert"), stat("ferme")] },
      seule,
      [SOPHIA],
      { ...R, fermes: ["ferme"] },
      2,
      { file: file({ sophia: { par_langue: { pl: ["ferme"] } } }) },
    );
    expect(t.map((x) => x.label_nom)).toEqual(["ouvert"]);
    expect(t[0].comptes).toBe(2);
  });

  it("une recrue du site prend aussi son label dans la File", () => {
    // Le site choisit l'APPLICATION, jamais le label : `preparerFileEtPersona`
    // est appelé pour elle comme pour les autres.
    const t = simulerTirages(
      marche("pl"),
      {
        "id-sophia": [
          stat("choisi"),
          stat("boude", { comptes_langue: 500, comptes_pays: 500, comptes_total: 500 }),
        ],
      },
      seule,
      [SOPHIA],
      R,
      1,
      {
        partSite: 1,
        siteParApp: SOPHIA_SEUL,
        file: file({ sophia: { par_langue: { pl: ["boude"] } } }),
      },
    );
    expect(t[0].label_id).toBe("boude");
    expect(t[0].comptesSite).toBe(1);
  });

  it("la file générale sert quand celle de la langue est vide", () => {
    const t = simulerTirages(
      marche("pl"),
      {
        "id-sophia": [
          stat("choisi"),
          stat("boude", { comptes_langue: 500, comptes_pays: 500, comptes_total: 500 }),
        ],
      },
      seule,
      [SOPHIA],
      R,
      1,
      { file: file({ sophia: { items: ["boude"] } }) },
    );
    expect(t[0].label_id).toBe("boude");
  });
});
