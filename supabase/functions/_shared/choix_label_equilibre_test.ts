/**
 * Choix du label : fermeture des labels faibles, performance au carré, réserve
 * restante, équilibre par langue ET par pays, sans hasard ni rafale.
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";

import {
  CAPACITE_MIN,
  capacite,
  choisirLabel,
  classerLabels,
  cleFermeture,
  doitFermer,
  estFerme,
  estSuspendu,
  facteurPerformance,
  joursApresCompte,
  labelsFermesConnus,
  lireReglagesChoixLabel,
  normaliserStatLabel,
  partsPlafonnees,
  poidsLabel,
  REGLAGES_CHOIX_LABEL_DEFAUT,
  type ReglagesChoixLabel,
  type StatLabelCreation,
} from "./choix_label_equilibre.ts";

const R = REGLAGES_CHOIX_LABEL_DEFAUT;
const FENETRE = 3;
const APP = "00000000-0000-4000-8000-000000000001";

/** Un label « plein » par défaut : stock illimité, performance de la flotte. */
function stat(over: Partial<StatLabelCreation> & { label_id: string }): StatLabelCreation {
  return {
    comptes_langue: 0,
    comptes_pays: 0,
    comptes_total: 0,
    passages_restants: 100_000,
    demande_jour: 0,
    passages: 0,
    perf_label: null,
    perf_flotte: 1,
    recents_langue: 0,
    recence_langue: 0,
    recents_pays: 0,
    recence_pays: 0,
    ...over,
  };
}

function reglages(over: Partial<ReglagesChoixLabel> = {}): ReglagesChoixLabel {
  return { ...R, ...over };
}

interface Compte {
  label: string;
  langue: string;
  pays: string | null;
}

/** Fenêtre comme la RPC : présence et récence parmi les `FENETRE` derniers comptes. */
function fenetre(historique: readonly string[], label: string): { nb: number; recence: number } {
  const derniers = historique.slice(-FENETRE).reverse(); // rang 1 = le plus récent
  const rang = derniers.indexOf(label);
  return { nb: derniers.filter((x) => x === label).length, recence: rang < 0 ? 0 : FENETRE - rang };
}

/** Les chiffres que la RPC rendrait pour un compte (langue, pays), vu la flotte. */
function chiffres(base: readonly StatLabelCreation[], flotte: readonly Compte[], langue: string, pays: string | null) {
  const dansLangue = flotte.filter((c) => c.langue === langue).map((c) => c.label);
  const dansPays = pays ? flotte.filter((c) => c.pays === pays).map((c) => c.label) : [];
  return base.map((s) => {
    const fl = fenetre(dansLangue, s.label_id);
    const fp = fenetre(dansPays, s.label_id);
    return {
      ...s,
      comptes_langue: dansLangue.filter((x) => x === s.label_id).length,
      comptes_pays: dansPays.filter((x) => x === s.label_id).length,
      comptes_total: flotte.filter((c) => c.label === s.label_id).length,
      recents_langue: fl.nb,
      recence_langue: fl.recence,
      recents_pays: fp.nb,
      recence_pays: fp.recence,
    };
  });
}

/** Rejoue des créations ; chaque compte demandé est (langue, pays). */
function simuler(
  base: readonly StatLabelCreation[],
  demandes: ReadonlyArray<{ langue: string; pays: string | null }>,
  r: ReglagesChoixLabel = R,
  depart: Compte[] = [],
): Compte[] {
  const flotte = [...depart];
  const crees: Compte[] = [];
  for (const d of demandes) {
    const id = choisirLabel(chiffres(base, flotte, d.langue, d.pays), r, { applicationId: APP });
    if (!id) break;
    const c = { label: id, langue: d.langue, pays: d.pays };
    flotte.push(c);
    crees.push(c);
  }
  return crees;
}

function enLangue(n: number, langue = "de", pays: string | null = "DE") {
  return Array.from({ length: n }, () => ({ langue, pays }));
}

function compter(ids: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

/** Le plus grand nombre d'un même label dans une fenêtre glissante. */
function maxParFenetre(ids: readonly string[], taille: number): number {
  let max = 0;
  for (let i = 0; i + taille <= ids.length; i++) {
    for (const v of compter(ids.slice(i, i + taille)).values()) max = Math.max(max, v);
  }
  return max;
}

/** Générateur pseudo-aléatoire déterministe (tests reproductibles). */
function lcg(graine: number): () => number {
  let x = graine >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

/** Le pool Sophia de prod au 15/10/2026 : réserve, demande, posts 28 j, performance. */
function poolProd(): StatLabelCreation[] {
  return [
    stat({ label_id: "weird_alpha", passages_restants: 582, demande_jour: 49, passages: 1091, perf_label: 1.27 }),
    stat({ label_id: "RH", passages_restants: 157, demande_jour: 18, passages: 131, perf_label: 1.45 }),
    stat({ label_id: "alpha_male", passages_restants: 1669, demande_jour: 34, passages: 793, perf_label: 0.9 }),
    stat({ label_id: "smart_girl", passages_restants: 919, demande_jour: 93, passages: 2149, perf_label: 1.02 }),
    stat({ label_id: "alpha_male_yellow", passages_restants: 321, demande_jour: 71, passages: 996, perf_label: 0.84 }),
    stat({ label_id: "beau_smart_girl", passages_restants: 239, demande_jour: 45, passages: 491, perf_label: 0.96 }),
    stat({ label_id: "alpha_male_film", passages_restants: 0, demande_jour: 2, passages: 245, perf_label: 0.58 }),
    stat({ label_id: "white_bg", passages_restants: 24, demande_jour: 10, passages: 14, perf_label: 2.74 }),
  ];
}

Deno.test("réglages : défauts, clés snake_case, valeurs invalides ignorées, fermetures mémorisées", () => {
  assertEquals(lireReglagesChoixLabel(null), { ...R, ouverts: [], fermes: [], fermesAuto: {} });
  const r = lireReglagesChoixLabel({
    perf_exposant: 3,
    fermeture_perf: "0.7",
    reserve_min_jours: -2,
    part_max: 9,
    relabels_max_par_nuit: 0,
    labels_ouverts: ["a", "a", "", null],
    labels_fermes: "pas une liste",
    fermes_auto: { [`${APP}:film`]: { depuis: "2026-10-16", perf: "0.58", posts: 245, nom: "alpha_male_film" }, sansDeuxPoints: {} },
  });
  assertEquals(r.perfExposant, 3);
  assertEquals(r.fermeturePerf, 0.7);
  assertEquals(r.reserveMinJours, 0);
  assertEquals(r.partMax, 1);
  assertEquals(r.relabelsMaxParNuit, 0);
  assertEquals(r.ouverts, ["a"]);
  assertEquals(r.fermes, []);
  assertEquals(Object.keys(r.fermesAuto), [`${APP}:film`]);
  assertEquals(r.fermesAuto[`${APP}:film`].perf, 0.58);
});

Deno.test("performance : lissée vers la flotte quand le label a peu de posts, bornée à [×0,25 ; ×4]", () => {
  assertEquals(facteurPerformance(stat({ label_id: "a" })), 1);
  const peu = facteurPerformance(stat({ label_id: "a", passages: 6, perf_label: 3.7 }));
  assert(peu > 1 && peu < 1.6, `facteur ${peu}`);
  assertEquals(facteurPerformance(stat({ label_id: "a", passages: 5000, perf_label: 99 })), R.perfMax);
  assertEquals(facteurPerformance(stat({ label_id: "a", passages: 5000, perf_label: 0.001 })), R.perfMin);
  assertEquals(facteurPerformance(stat({ label_id: "a", perf_flotte: null, passages: 50, perf_label: 6 })), 1);
});

Deno.test("réserve : jours restants avec un compte de plus, capacité plafonnée à 14 jours, suspension sous 7", () => {
  const rh = stat({ label_id: "RH", passages_restants: 157, demande_jour: 18 });
  assertAlmostEquals(joursApresCompte(rh), 157 / 20);
  assertAlmostEquals(capacite(rh), 157 / 20 / 14);
  assert(!estSuspendu(rh));
  // Au-delà de 14 jours, le stock ne compte plus.
  assertEquals(capacite(stat({ label_id: "gros", passages_restants: 1669, demande_jour: 34 })), 1);
  // Sans réserve : suspendu, capacité au plancher (jamais nulle).
  const vide = stat({ label_id: "vide", passages_restants: 0, demande_jour: 5 });
  assert(estSuspendu(vide));
  assertEquals(capacite(vide), CAPACITE_MIN);
});

Deno.test("poids : la performance pèse plus que le stock", () => {
  // RH (1,45, 8 jours) contre alpha_male (0,90, 46 jours) : RH plus lourd.
  const [rh, am] = [poolProd()[1], poolProd()[2]];
  assert(poidsLabel(rh) > poidsLabel(am), `RH ${poidsLabel(rh)} / alpha_male ${poidsLabel(am)}`);
  // À stock égal et confortable, le poids suit le carré de la performance.
  const a = stat({ label_id: "a", passages: 100_000, perf_label: 1.2 });
  const b = stat({ label_id: "b", passages: 100_000, perf_label: 0.6 });
  assertAlmostEquals(poidsLabel(a) / poidsLabel(b), 4, 0.01);
});

Deno.test("fermeture : sous 0,75 de la flotte sur 150 posts au moins, jamais sur peu de posts", () => {
  const film = stat({ label_id: "film", passages: 245, perf_label: 0.58 });
  assert(doitFermer(film, R));
  assert(!doitFermer({ ...film, passages: 149 }, R), "pas assez de posts");
  assert(!doitFermer({ ...film, perf_label: 0.76 }, R), "au-dessus du seuil");
  assert(!doitFermer({ ...film, perf_flotte: null }, R), "sans référence");
  // Priorités : ouverture forcée > fermeture forcée > mémorisée > chiffres.
  const memo = reglages({ fermesAuto: { [cleFermeture(APP, "x")]: { depuis: "j", perf: 0.5, posts: 200 } } });
  assert(estFerme("x", APP, memo));
  assert(!estFerme("x", "autre-app", memo), "la fermeture est par application");
  assert(estFerme("y", APP, reglages({ fermes: ["y"] })));
  assert(!estFerme("film", APP, reglages({ ouverts: ["film"] }), film));
  assert(!estFerme("x", APP, { ...memo, ouverts: ["x"] }));
  assert(estFerme("film", APP, R, film));
  assertEquals([...labelsFermesConnus({ ...memo, fermes: ["y", "z"], ouverts: ["z"] }, APP)].sort(), ["x", "y"]);
});

Deno.test("fermeture manuelle PAR APPLICATION : fermer sur Unswipe sans fermer sur Sophia", () => {
  const AUTRE = "autre-app";
  const k = (app: string, lab: string) => cleFermeture(app, lab);

  // Le cas qui motive la fonctionnalité : white_bg marche sur Sophia et pas
  // sur Unswipe. `fermes` est global, il l'aurait fermé des deux côtés.
  const parApp = reglages({ fermesApp: [k(AUTRE, "white_bg")] });
  assert(estFerme("white_bg", AUTRE, parApp), "fermé sur l'application visée");
  assert(!estFerme("white_bg", APP, parApp), "toujours ouvert ailleurs");

  // Le plus précis gagne : rouvrir pour une application bat une fermeture
  // globale, et fermer pour une application bat une réouverture globale.
  assert(!estFerme("y", APP, reglages({ fermes: ["y"], ouvertsApp: [k(APP, "y")] })));
  assert(estFerme("y", APP, reglages({ ouverts: ["y"], fermesApp: [k(APP, "y")] })));

  // Et une réouverture par application rouvre aussi un label fermé par la nuit.
  const auto = reglages({
    fermesAuto: { [k(APP, "film")]: { depuis: "2026-10-16", perf: 0.58, posts: 234 } },
    ouvertsApp: [k(APP, "film")],
  });
  assert(!estFerme("film", APP, auto));

  // La liste « sans chiffres » suit la même échelle.
  assertEquals(
    [...labelsFermesConnus(reglages({ fermesApp: [k(APP, "a"), k(AUTRE, "b")] }), APP)].sort(),
    ["a"],
  );
  assertEquals(
    [...labelsFermesConnus(reglages({ fermes: ["a"], ouvertsApp: [k(APP, "a")] }), APP)],
    [],
  );
});

Deno.test("les listes par application se lisent dans le réglage", () => {
  const r = lireReglagesChoixLabel({
    labels_fermes_app: ["app1:lab1", "app1:lab1", " app2:lab2 "],
    labels_ouverts_app: ["app3:lab3"],
  });
  assertEquals(r.fermesApp, ["app1:lab1", "app2:lab2"], "dédoublonné et détrimé");
  assertEquals(r.ouvertsApp, ["app3:lab3"]);
  assertEquals(lireReglagesChoixLabel({}).fermesApp, []);
});

Deno.test("un label fermé ne reçoit plus personne, même vidé de ses comptes (sam.focus429)", () => {
  // Le 15/10 : film sorti de ses 10 comptes, donc « en retard » partout, et
  // pourtant choisi pour un nouveau compte anglais. Plus maintenant.
  const pool = poolProd();
  const crees = simuler(pool, enLangue(30, "en", null));
  assert(!crees.some((c) => c.label === "alpha_male_film"), crees.map((c) => c.label).join(","));
  assertEquals(classerLabels(pool, R).some((c) => c.label_id === "alpha_male_film"), false);
});

Deno.test("aucun label ouvert : null pour la nuit, mais une création n'est jamais bloquée", () => {
  const tous = [stat({ label_id: "a" }), stat({ label_id: "b" })];
  const r = reglages({ fermes: ["a", "b"] });
  assertEquals(choisirLabel(tous, r), null);
  assertEquals(choisirLabel(tous, r, { jamaisSansLabel: true }), "a");
});

Deno.test("réserve trop basse : le label passe après les autres, sauf si tous en sont là", () => {
  const pool = [
    stat({ label_id: "maigre", passages_restants: 10, demande_jour: 4, passages: 1000, perf_label: 3 }),
    stat({ label_id: "plein", passages: 1000, perf_label: 1 }),
  ];
  assertEquals(choisirLabel(pool), "plein");
  const tousMaigres = pool.map((s) => ({ ...s, passages_restants: 10, demande_jour: 4 }));
  assertEquals(choisirLabel(tousMaigres), "maigre");
});

Deno.test("pool de prod du 15/10 : RH et weird_alpha devant, yellow, beau_smart_girl et white_bg en attente de stock", () => {
  const classes = classerLabels(poolProd(), R);
  const part = (id: string) => classes.find((c) => c.label_id === id)?.part ?? 0;
  assert(part("weird_alpha") > part("alpha_male"));
  assert(part("RH") > part("alpha_male"), `RH ${part("RH")} / alpha_male ${part("alpha_male")}`);
  for (const id of ["alpha_male_yellow", "beau_smart_girl", "white_bg"]) {
    assert(classes.find((c) => c.label_id === id)?.suspendu, `${id} devrait attendre du stock`);
  }
  // 20 comptes allemands : les labels suspendus n'en reçoivent aucun, RH plus qu'alpha_male.
  const n = compter(simuler(poolProd(), enLangue(20)).map((c) => c.label));
  assertEquals(n.get("alpha_male_yellow") ?? 0, 0);
  assertEquals(n.get("white_bg") ?? 0, 0);
  assert((n.get("RH") ?? 0) > (n.get("alpha_male") ?? 0), JSON.stringify([...n]));
});

Deno.test("parts : proportionnelles aux poids, aucune au-dessus de 1/2, l'excédent redistribué", () => {
  const somme = (p: number[]) => p.reduce((a, b) => a + b, 0);
  const deux = partsPlafonnees([75, 25]);
  assertAlmostEquals(deux[0], 0.5);
  assertAlmostEquals(deux[1], 0.5);
  const quatre = partsPlafonnees([60, 20, 10, 10]);
  assertAlmostEquals(quatre[0], 0.5);
  assertAlmostEquals(quatre[1], 0.25);
  assertAlmostEquals(somme(quatre), 1);
  assertAlmostEquals(partsPlafonnees([30, 30, 40])[2], 0.4);
  assertEquals(partsPlafonnees([5]), [1]);
  assertEquals(partsPlafonnees([0, 0]), [0.5, 0.5]);
  assertEquals(partsPlafonnees([]), []);
});

Deno.test("4 comptes dans une langue neuve : 4 labels différents", () => {
  const labels = ["a", "b", "c", "d", "e", "f"].map((id, i) =>
    stat({ label_id: id, passages: 500, perf_label: 1.4 - i * 0.1 })
  );
  assertEquals(new Set(simuler(labels, enLangue(4)).map((c) => c.label)).size, 4);
  assertEquals(new Set(simuler(poolProd(), enLangue(4, "sv", "SE")).map((c) => c.label)).size, 4);
});

Deno.test("pays : pas 5 fois le même label en Suisse, même quand chaque langue est en retard", () => {
  // Suisse : 4 comptes « star » déjà (2 de, 2 fr). Un compte italien suisse :
  // star est en retard dans l'italien (0 compte), mais saturé dans le pays.
  const pool = [
    stat({ label_id: "star", passages: 1000, perf_label: 1.6 }),
    stat({ label_id: "b", passages: 1000, perf_label: 1 }),
    stat({ label_id: "c", passages: 1000, perf_label: 1 }),
  ];
  const suisse: Compte[] = [
    { label: "star", langue: "de", pays: "CH" },
    { label: "star", langue: "fr", pays: "CH" },
    { label: "b", langue: "de", pays: "CH" },
    { label: "star", langue: "de", pays: "CH" },
    { label: "star", langue: "fr", pays: "CH" },
  ];
  const [premier] = simuler(pool, [{ langue: "it", pays: "CH" }], R, suisse);
  assert(premier.label !== "star", "star est déjà sur 4 des 5 comptes suisses");
  // Sans dimension pays (pays inconnu), l'italien prendrait star.
  const [sansPays] = simuler(pool, [{ langue: "it", pays: null }], R, suisse);
  assertEquals(sansPays.label, "star");
});

Deno.test("pays : une suite de comptes multilingues dans un pays reste diverse", () => {
  const pool = poolProd();
  const langues = ["de", "fr", "it"];
  const demandes = Array.from({ length: 24 }, (_, i) => ({ langue: langues[i % 3], pays: "CH" }));
  const labels = simuler(pool, demandes).map((c) => c.label);
  assert(maxParFenetre(labels, 4) <= 2, labels.join(","));
  const n = compter(labels);
  for (const [id, k] of n) assert(k <= 12, `${id} ${k} sur 24`);
});

Deno.test("rafale dans le pays : un label sur 2 des 3 derniers comptes du pays attend, langue différente ou non", () => {
  const pool = [stat({ label_id: "a", passages: 1000, perf_label: 2 }), stat({ label_id: "b" })];
  const pays: Compte[] = [
    { label: "a", langue: "de", pays: "CH" },
    { label: "b", langue: "de", pays: "CH" },
    { label: "a", langue: "fr", pays: "CH" },
  ];
  const [c] = simuler(pool, [{ langue: "it", pays: "CH" }], R, pays);
  assertEquals(c.label, "b");
});

Deno.test("pas de rafale : jamais 3 fois le même label sur 4 comptes d'une langue, même seul en retard", () => {
  const labels = [
    stat({ label_id: "X", passages: 1000, perf_label: 1.5 }),
    stat({ label_id: "A" }),
    stat({ label_id: "B" }),
    stat({ label_id: "C" }),
  ];
  const depart: Compte[] = ["A", "B", "C", "A", "B", "C", "A", "B", "C"].map((label) => ({ label, langue: "de", pays: "DE" }));
  const choix = simuler(labels, enLangue(12), R, depart).map((c) => c.label);
  assert(maxParFenetre(["A", "B", "C", ...choix], 4) <= 2, `choix ${choix}`);
});

Deno.test("une langue déséquilibrée se rattrape : le label sur-représenté attend", () => {
  const labels = ["smart_girl", "weird_alpha", "amy", "alpha_male"].map((id) => stat({ label_id: id }));
  // alpha_male en premier : il n'est pas parmi les derniers comptes, et c'est le plus en retard.
  const depart: Compte[] = [
    "alpha_male",
    ...Array(6).fill("smart_girl"),
    ...Array(3).fill("weird_alpha"),
    ...Array(2).fill("amy"),
  ].map((label) => ({ label, langue: "pt", pays: "PT" }));
  const choix = simuler(labels, enLangue(4, "pt", "PT"), R, depart).map((c) => c.label);
  assert(!choix.includes("smart_girl"), `choix ${choix}`);
  assertEquals(choix[0], "alpha_male");
});

Deno.test("pools au hasard (reproductibles) : jamais 3 sur 4 dans une langue ; dès 3 labels, le pays jamais 4 sur 4", () => {
  const alea = lcg(42);
  for (let essai = 0; essai < 200; essai++) {
    const taille = 2 + Math.floor(alea() * 7);
    const pool = Array.from({ length: taille }, (_, i) =>
      stat({
        label_id: `l${i}`,
        passages_restants: Math.floor(alea() * 3000),
        demande_jour: Math.floor(alea() * 60),
        passages: Math.floor(alea() * 1500),
        perf_label: 0.3 + alea() * 3,
      })
    );
    const langues = ["de", "fr", "it"];
    const demandes = Array.from({ length: 40 }, () => ({ langue: langues[Math.floor(alea() * 3)], pays: "CH" }));
    const crees = simuler(pool, demandes);
    // Au moins deux labels qui ne sont pas à sec : sinon la répétition est forcée.
    const nourriciers = classerLabels(pool, R).filter((c) => !c.aSec).length;
    if (nourriciers < 2) continue;
    for (const l of langues) {
      const suite = crees.filter((c) => c.langue === l).map((c) => c.label);
      assert(maxParFenetre(suite, 4) <= 2, `essai ${essai} ${l} : ${suite}`);
    }
    // La langue passe avant le pays. Avec deux labels seulement, chaque langue
    // doit alterner et le pays répète forcément ; dès trois, jamais 4 sur 4.
    if (nourriciers >= 3) {
      assert(maxParFenetre(crees.map((c) => c.label), 4) <= 3, `essai ${essai} pays`);
    }
  }
});

Deno.test("le choix ne dépend pas de l'ordre des lignes (même à 1e-9 près)", () => {
  const presque = [
    stat({ label_id: "a", passages: 1e9, perf_label: 1 }),
    stat({ label_id: "b", passages: 1e9, perf_label: 1 + 2e-9, comptes_total: 1 }),
    stat({ label_id: "c", passages: 1e9, perf_label: 1 + 4e-9, comptes_total: 2 }),
  ];
  const alea = lcg(7);
  for (const pool of [presque, poolProd()]) {
    const ordres = Array.from({ length: 20 }, () => [...pool].sort(() => alea() - 0.5));
    const choix = new Set(ordres.map((o) => choisirLabel(o)));
    assertEquals(choix.size, 1, `choix ${[...choix]}`);
  }
});

Deno.test("égalité : la flotte départage, puis le poids, puis l'id (stable, sans hasard)", () => {
  assertEquals(choisirLabel([stat({ label_id: "a", comptes_total: 30 }), stat({ label_id: "b", comptes_total: 5 })]), "b");
  assertEquals(
    choisirLabel([stat({ label_id: "a", passages: 1000, perf_label: 0.9 }), stat({ label_id: "b", passages: 1000, perf_label: 1.1 })]),
    "b",
  );
  for (let i = 0; i < 5; i++) assertEquals(choisirLabel([stat({ label_id: "z" }), stat({ label_id: "m" })]), "m");
});

Deno.test("rien à choisir : null ; doublons ignorés ; lignes RPC normalisées", () => {
  assertEquals(choisirLabel([]), null);
  assertEquals(classerLabels([stat({ label_id: "a" }), stat({ label_id: "a", comptes_langue: 9 })]).length, 1);
  assertEquals(
    normaliserStatLabel({
      label_id: "x",
      comptes_langue: "2",
      comptes_pays: "1",
      comptes_total: null,
      passages_restants: "157",
      demande_jour: "18.00",
      passages: 10,
      perf_label: "1.034",
      perf_flotte: null,
      recents_langue: "2",
      recence_langue: 3,
      recents_pays: 1,
      recence_pays: "2",
    }),
    {
      label_id: "x",
      comptes_langue: 2,
      comptes_pays: 1,
      comptes_total: 0,
      passages_restants: 157,
      demande_jour: 18,
      passages: 10,
      perf_label: 1.034,
      perf_flotte: null,
      recents_langue: 2,
      recence_langue: 3,
      recents_pays: 1,
      recence_pays: 2,
      pod_seul: false,
      livre_langue: true,
      niveau_pod: null,
    },
  );
  const vide = normaliserStatLabel({ label_id: "x" });
  assertEquals([vide.recents_pays, vide.passages_restants, vide.perf_label], [0, 0, null]);
});

// ── Label 100 % pod (0352) : remplissage langue par langue, sans réserve ──

/** Les chiffres FR du 24/10 (Sophia) : alpha_male gagnait parce que les autres manquaient de stock. */
const FR_24_10: StatLabelCreation[] = [
  stat({ label_id: "alpha_male", comptes_langue: 3, comptes_pays: 3, comptes_total: 42, passages_restants: 1535, demande_jour: 44, passages: 925, perf_label: 0.891, recents_langue: 1, recence_langue: 2, recents_pays: 1, recence_pays: 2 }),
  stat({ label_id: "beau_smart_girl", comptes_langue: 2, comptes_pays: 2, comptes_total: 45, passages_restants: 687, demande_jour: 31, passages: 625, perf_label: 0.884 }),
  stat({ label_id: "smart_girl", comptes_langue: 5, comptes_pays: 5, comptes_total: 69, passages_restants: 944, demande_jour: 102, passages: 2348, perf_label: 0.997 }),
  stat({ label_id: "rh", comptes_langue: 3, comptes_pays: 3, comptes_total: 19, passages_restants: 165, demande_jour: 32, passages: 321, perf_label: 1.405 }),
];
const FATHOMLY = { label_id: "fathomly", passages_restants: 8, pod_seul: true, livre_langue: true, niveau_pod: 0 };

Deno.test("100 % pod : la réserve ne le juge plus, il sort dans une langue où il n'a aucun compte", () => {
  const avant = stat({ ...FATHOMLY, pod_seul: false });
  assert(estSuspendu(avant, R));
  assert(choisirLabel([...FR_24_10, avant], R) !== "fathomly");

  const pod = stat(FATHOMLY);
  assertEquals(capacite(pod, R), 1);
  assertEquals(estSuspendu(pod, R), false);
  assertEquals(choisirLabel([...FR_24_10, pod], R), "fathomly");
});

Deno.test("100 % pod : en avance dans cette langue, il attend que les autres langues rattrapent", () => {
  // 1 compte en FR, 0 dans sa langue la moins remplie : il passe après les autres.
  const enAvance = stat({ ...FATHOMLY, comptes_langue: 1, comptes_pays: 1, comptes_total: 1 });
  assert(estSuspendu(enAvance, R));
  assert(choisirLabel([...FR_24_10, enAvance], R) !== "fathomly");
  // Toutes les langues à 1 : il repart pour le 2e tour.
  const auNiveau = stat({ ...FATHOMLY, comptes_langue: 1, comptes_pays: 1, comptes_total: 8, niveau_pod: 1 });
  assertEquals(estSuspendu(auNiveau, R), false);
  // Aucune autre langue qui recrute : rien ne le retient.
  assertEquals(estSuspendu(stat({ ...FATHOMLY, comptes_langue: 4, niveau_pod: null }), R), false);
});

Deno.test("100 % pod : jamais dans une langue que son pod ne sert pas, même sans autre choix réservé", () => {
  const muet = stat({ ...FATHOMLY, livre_langue: false });
  const classes = classerLabels([...FR_24_10, muet], R);
  assertEquals(classes.at(-1)?.label_id, "fathomly");
  assert(classes.at(-1)?.aSec);
});

Deno.test("100 % pod : les colonnes de la RPC sont lues", () => {
  const s = normaliserStatLabel({ label_id: "x", pod_seul: true, livre_langue: false, niveau_pod: "2" });
  assertEquals([s.pod_seul, s.livre_langue, s.niveau_pod], [true, false, 2]);
});
