import { describe, expect, it } from "vitest";

import { lireCibleApplications, type MarcheApplications } from "./scoreApplication";
import type { ReglagesFileLabels } from "../types";
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

  it("chaque compte projeté consomme : un label court en stock s'arrête au seuil de réserve (0354)", () => {
    // « court » : 66 passages pour 9 posts/jour -> 6 jours avec un compte de
    // plus, puis 5,1, puis 4,4 : sous les 5 jours au 3e, il passe derrière.
    // « long » a de quoi tenir des mois. Avant, la réserve de « court » ne
    // bougeait pas et il pouvait rafler toute la projection.
    // Deux « longs » déjà présents à parts égales : aucun ne sature le pays.
    const stats = {
      "id-sophia": [
        stat("court", { passages_restants: 66, demande_jour: 9, perf_label: 2 }),
        stat("long1", { passages_restants: 100_000, demande_jour: 10, comptes_langue: 5, comptes_pays: 5, comptes_total: 5 }),
        stat("long2", { passages_restants: 100_000, demande_jour: 10, comptes_langue: 5, comptes_pays: 5, comptes_total: 5 }),
      ],
    };
    const seule = lireCibleApplications(null, ["sophia"]);
    const tirages = simulerTirages(marche("pl"), stats, seule, [SOPHIA], R, 10);
    const court = tirages.find((x) => x.label_nom === "court")?.comptes ?? 0;
    expect(court).toBeGreaterThan(0);
    expect(court).toBeLessThanOrEqual(2);
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

describe("une application en préparation dans la projection", () => {
  // Atala au 19/11 : inactive, des labels, aucun stock. La page la passe comme
  // n'importe quelle candidate (`candidates.ts`).
  const ATALA = { id: "id-atala", slug: "atala", langues: null };
  const sansStock = (id: string) =>
    stat(id, { comptes_langue: 0, comptes_pays: 0, comptes_total: 0, passages_restants: 0, demande_jour: 0, passages: 0, perf_label: null });
  const stats = {
    "id-sophia": [stat("a")],
    "id-atala": [sansStock("classic_girl_run"), sansStock("male_run")],
  };

  it("avec toute la cible, elle prend les vingt comptes, sur ses labels sans stock", () => {
    const cible = lireCibleApplications({ atala: 100 }, ["sophia", "atala"]);
    const t = simulerTirages(marche("fr"), stats, cible, [SOPHIA, ATALA], R, 20);
    expect(t.every((x) => x.app === "atala")).toBe(true);
    expect(t.reduce((a, x) => a + x.comptes, 0)).toBe(20);
    // Aucun stock nulle part : les labels pèsent pareil et se partagent les comptes.
    expect(t.map((x) => x.comptes).sort()).toEqual([10, 10]);
  });

  it("sans part dans la cible, elle ne reçoit rien", () => {
    const cible = lireCibleApplications({ sophia: 100 }, ["sophia", "atala"]);
    const t = simulerTirages(marche("fr"), stats, cible, [SOPHIA, ATALA], R, 20);
    expect(t.every((x) => x.app === "sophia")).toBe(true);
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
