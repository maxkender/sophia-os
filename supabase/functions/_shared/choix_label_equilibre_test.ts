/**
 * Choix du label à la création : équilibre par langue, pondéré par le stock et
 * la performance, sans hasard ni rafale.
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";

import {
  choisirLabelEquilibre,
  classerLabels,
  facteurPerformance,
  normaliserStatLabel,
  PART_MAX,
  partsPlafonnees,
  PERF_FACTEUR_MAX,
  PERF_FACTEUR_MIN,
  poidsLabel,
  type StatLabelCreation,
} from "./choix_label_equilibre.ts";

const FENETRE = 3;

function stat(over: Partial<StatLabelCreation> & { label_id: string }): StatLabelCreation {
  return {
    comptes_langue: 0,
    comptes_total: 0,
    stock: 400,
    passages: 0,
    perf_label: null,
    perf_flotte: 1,
    recents_nb: 0,
    recence: 0,
    ...over,
  };
}

/** Fenêtre comme la RPC : présence et récence parmi les `FENETRE` derniers comptes. */
function fenetre(historique: readonly string[], label: string): { recents_nb: number; recence: number } {
  const derniers = historique.slice(-FENETRE).reverse(); // rang 1 = le plus récent
  const rang = derniers.indexOf(label);
  return {
    recents_nb: derniers.filter((x) => x === label).length,
    recence: rang < 0 ? 0 : FENETRE - rang,
  };
}

/**
 * Rejoue N créations dans une langue, en ajoutant chaque choix aux compteurs et
 * en tenant la fenêtre des derniers comptes (comme la RPC).
 */
function simuler(depart: StatLabelCreation[], n: number, historique: string[] = []): string[] {
  const etat = depart.map((s) => ({ ...s }));
  const passe = [...historique];
  const choix: string[] = [];
  for (let i = 0; i < n; i++) {
    for (const s of etat) Object.assign(s, fenetre(passe, s.label_id));
    const id = choisirLabelEquilibre(etat);
    if (!id) break;
    choix.push(id);
    passe.push(id);
    const s = etat.find((x) => x.label_id === id)!;
    s.comptes_langue += 1;
    s.comptes_total += 1;
  }
  return choix;
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

/** Pour chaque choix : combien de fois son label sur les 4 comptes qui finissent par lui. */
function pireRafaleDesChoix(historique: readonly string[], choix: readonly string[]): number {
  const tout = [...historique, ...choix];
  let pire = 0;
  for (let i = historique.length; i < tout.length; i++) {
    const quatre = tout.slice(Math.max(0, i - 3), i + 1);
    pire = Math.max(pire, quatre.filter((x) => x === tout[i]).length);
  }
  return pire;
}

/** Générateur pseudo-aléatoire déterministe (tests reproductibles). */
function lcg(graine: number): () => number {
  let x = graine >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

/** Le pool Sophia de prod (11/10/2026) : stock, posts 28 j, performance rapportée à la langue. */
function poolProd(stockWeird = 501): StatLabelCreation[] {
  return [
    stat({ label_id: "weird_alpha", stock: stockWeird, passages: 981, perf_label: 1.34 }),
    stat({ label_id: "alpha_male", stock: 1194, passages: 792, perf_label: 0.91 }),
    stat({ label_id: "smart_girl", stock: 874, passages: 2121, perf_label: 1.03 }),
    stat({ label_id: "alpha_male_yellow", stock: 343, passages: 906, perf_label: 0.84 }),
    stat({ label_id: "beau_smart_girl", stock: 230, passages: 442, perf_label: 1.0 }),
    stat({ label_id: "RH", stock: 126, passages: 72, perf_label: 1.46 }),
    stat({ label_id: "alpha_male_film", stock: 50, passages: 263, perf_label: 0.51 }),
    stat({ label_id: "white_bg", stock: 16, passages: 6, perf_label: 4.25 }),
  ];
}

Deno.test("performance : lissée vers la flotte quand le label a peu de posts, bornée", () => {
  assertEquals(facteurPerformance(stat({ label_id: "a" })), 1);
  // 6 posts à ×3,7 : le lissage le ramène près de la flotte.
  const peu = facteurPerformance(stat({ label_id: "a", passages: 6, perf_label: 3.7 }));
  assert(peu > 1 && peu < 1.3, `facteur ${peu}`);
  // Beaucoup de posts très au-dessus : plafonné ; très en dessous : plancher.
  assertEquals(facteurPerformance(stat({ label_id: "a", passages: 5000, perf_label: 99 })), PERF_FACTEUR_MAX);
  assertEquals(facteurPerformance(stat({ label_id: "a", passages: 5000, perf_label: 0.001 })), PERF_FACTEUR_MIN);
  // Pas de référence de flotte : neutre.
  assertEquals(facteurPerformance(stat({ label_id: "a", perf_flotte: null, passages: 50, perf_label: 6 })), 1);
});

Deno.test("poids : √stock × performance ; un label sans stock pèse √1, jamais écarté", () => {
  assertAlmostEquals(poidsLabel(stat({ label_id: "a", stock: 400 })), 20);
  assertAlmostEquals(poidsLabel(stat({ label_id: "a", stock: 0 })), 1);
  const ids = classerLabels([stat({ label_id: "vide", stock: 0 }), stat({ label_id: "plein" })]).map((c) => c.label_id);
  assertEquals(ids.sort(), ["plein", "vide"]);
});

Deno.test("parts : proportionnelles aux poids, aucune au-dessus de 1/2, l'excédent redistribué", () => {
  const somme = (p: number[]) => p.reduce((a, b) => a + b, 0);
  const deux = partsPlafonnees([75, 25]);
  assertAlmostEquals(deux[0], 0.5);
  assertAlmostEquals(deux[1], 0.5);
  const quatre = partsPlafonnees([60, 20, 10, 10]);
  assertAlmostEquals(quatre[0], PART_MAX);
  assertAlmostEquals(quatre[1], 0.25);
  assertAlmostEquals(quatre[2], 0.125);
  assertAlmostEquals(somme(quatre), 1);
  // Sous le plafond : inchangées.
  assertAlmostEquals(partsPlafonnees([30, 30, 40])[2], 0.4);
  assertEquals(partsPlafonnees([5]), [1]);
  assertEquals(partsPlafonnees([0, 0]), [0.5, 0.5]);
  assertEquals(partsPlafonnees([]), []);
});

Deno.test("4 comptes dans une langue neuve : 4 labels différents", () => {
  const labels = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) =>
    stat({ label_id: id, stock: 1600 - i * 200, passages: 500, perf_label: i === 2 ? 2 : 1 })
  );
  assertEquals(new Set(simuler(labels, 4)).size, 4);
  // Le pool de prod : pareil.
  assertEquals(new Set(simuler(poolProd(), 4)).size, 4);
});

Deno.test("le meilleur label en tête, puis une répartition qui suit les poids", () => {
  const labels = [
    stat({ label_id: "star", stock: 700, passages: 1000, perf_label: 2.2 }),
    stat({ label_id: "gros", stock: 1600, passages: 1000, perf_label: 0.95 }),
    stat({ label_id: "moyen", stock: 400, passages: 1000, perf_label: 0.95 }),
    stat({ label_id: "maigre", stock: 50, passages: 300, perf_label: 0.6 }),
  ];
  const choix = simuler(labels, 20);
  assertEquals(choix[0], "star");
  const n = compter(choix);
  assert((n.get("star") ?? 0) > (n.get("moyen") ?? 0));
  assert((n.get("gros") ?? 0) > (n.get("maigre") ?? 0));
  assert((n.get("maigre") ?? 0) >= 1, "un label maigre garde sa petite part");
});

Deno.test("pas de rafale : une langue en rattrapage n'enchaîne pas le même label", () => {
  // Comme le roumain : weird_alpha très en retard, les autres déjà servis.
  const labels = [
    stat({ label_id: "weird_alpha", comptes_langue: 0, stock: 1600, passages: 800, perf_label: 1.3 }),
    stat({ label_id: "alpha_male", comptes_langue: 2, stock: 1200 }),
    stat({ label_id: "smart_girl", comptes_langue: 2, stock: 900 }),
    stat({ label_id: "yellow", comptes_langue: 1, stock: 300 }),
    stat({ label_id: "film", comptes_langue: 1, stock: 30 }),
  ];
  const choix = simuler(labels, 6);
  assertEquals(choix[0], "weird_alpha");
  assert(maxParFenetre(choix, 3) <= 1, `choix ${choix}`);
  // Le retard se rattrape quand même, juste pas d'affilée.
  assert((compter(choix).get("weird_alpha") ?? 0) >= 2, `choix ${choix}`);
});

Deno.test("jamais 3 fois le même label sur 4 comptes, même seul en retard", () => {
  // Une langue à l'équilibre + un label qui n'y a jamais servi : lui seul est
  // en retard, il ne passe pas pour autant 3 fois sur 4.
  const labels = [
    stat({ label_id: "X" }),
    stat({ label_id: "A", comptes_langue: 3 }),
    stat({ label_id: "B", comptes_langue: 3 }),
    stat({ label_id: "C", comptes_langue: 3 }),
  ];
  const historique = ["A", "B", "C"];
  const choix = simuler(labels, 12, historique);
  assert(maxParFenetre([...historique, ...choix], 4) <= 2, `choix ${choix}`);
  // Les 2 derniers comptes de la langue portent « a » (posés par la File) : il attend.
  const apresFile = [
    stat({ label_id: "a", comptes_langue: 0, recents_nb: 2, recence: 3 }),
    stat({ label_id: "b", comptes_langue: 5 }),
  ];
  assertEquals(choisirLabelEquilibre(apresFile), "b");
});

Deno.test("400 créations, label dominant (stock qui grossit) : jamais 3 sur 4, parts tenues", () => {
  for (const stockWeird of [501, 900, 1600, 2500, 6000]) {
    const pool = poolProd(stockWeird);
    const choix = simuler(pool, 400);
    assert(maxParFenetre(choix, 4) <= 2, `stock ${stockWeird} : ${choix.join(",")}`);
    // Chaque label reste près de sa part (plafonnée), à 200 comme à 400
    // créations : l'écart ne grandit pas. Le label dominant garde un retard de
    // quelques comptes, prix de la diversité.
    for (const fin of [200, 400]) {
      const n = compter(choix.slice(0, fin));
      for (const c of classerLabels(pool)) {
        const ecart = Math.abs((n.get(c.label_id) ?? 0) - c.part * fin);
        assert(ecart < 7, `stock ${stockWeird}, ${fin} : ${c.label_id} écart ${ecart.toFixed(2)}`);
      }
    }
  }
});

Deno.test("pools au hasard (reproductibles) : un choix ne fait jamais 3 sur 4 comptes", () => {
  const alea = lcg(42);
  for (let essai = 0; essai < 300; essai++) {
    const taille = 2 + Math.floor(alea() * 7);
    const ids = Array.from({ length: taille }, (_, i) => `l${i}`);
    const pool = ids.map((id) =>
      stat({
        label_id: id,
        stock: Math.floor(alea() ** 2 * 3000),
        passages: Math.floor(alea() * 1500),
        perf_label: 0.3 + alea() * 3,
        comptes_langue: Math.floor(alea() * 6),
      })
    );
    // Historique quelconque (comptes posés par la File compris).
    const historique = Array.from({ length: 3 }, () => ids[Math.floor(alea() * taille)]);
    const choix = simuler(pool, 60, historique);
    assert(pireRafaleDesChoix(historique, choix) <= 2, `essai ${essai} : ${historique} | ${choix}`);
  }
});

Deno.test("le label du dernier compte de la langue attend s'il en reste un autre en retard", () => {
  const labels = [
    stat({ label_id: "a", stock: 900 }),
    stat({ label_id: "b", stock: 800 }),
    stat({ label_id: "c", stock: 700 }),
  ];
  // Sans historique : « a » (le plus lourd). Si le dernier compte créé porte « a » : un autre.
  assertEquals(choisirLabelEquilibre(labels), "a");
  const apres = labels.map((s) => (s.label_id === "a" ? { ...s, recents_nb: 1, recence: 3 } : s));
  assertEquals(choisirLabelEquilibre(apres), "b");
});

Deno.test("tous les labels en retard ont servi récemment : le moins récent passe, jamais le dernier", () => {
  // Comme l'allemand : 3 labels en retard, chacun sur l'un des 3 derniers comptes.
  const labels = [
    stat({ label_id: "gros", comptes_langue: 1, stock: 3600, recents_nb: 1, recence: 3 }),
    stat({ label_id: "moyen", comptes_langue: 1, stock: 2500, recents_nb: 1, recence: 2 }),
    stat({ label_id: "petit", comptes_langue: 0, stock: 400, recents_nb: 1, recence: 1 }),
    stat({ label_id: "servi", comptes_langue: 9, stock: 900 }),
  ];
  assertEquals(choisirLabelEquilibre(labels), "petit");
  // Un label à jour (pas en retard) ne passe pas devant un label en retard,
  // même absent des derniers comptes.
  assertEquals(classerLabels(labels).findIndex((c) => c.label_id === "servi"), 3);
});

Deno.test("petit pool : parts plafonnées à 1/2, pas de rafale", () => {
  // 2 labels à 75 / 25 % (répartition sophia + unswipe) : ils alternent.
  const deux = [
    stat({ label_id: "weird_alpha", comptes_langue: 5, stock: 501, passages: 981, perf_label: 1.34 }),
    stat({ label_id: "beau_smart_girl", comptes_langue: 5, stock: 230, passages: 442, perf_label: 0.5 }),
  ];
  const alterne = simuler(deux, 12);
  assert(maxParFenetre(alterne, 4) <= 2, `choix ${alterne}`);
  assertEquals(compter(alterne).get("weird_alpha"), 6);
  // 4 labels aux poids 60 / 20 / 10 / 10 : parts 50 / 25 / 12,5 / 12,5.
  const labels = [
    stat({ label_id: "a", stock: 3600 }),
    stat({ label_id: "b", stock: 400 }),
    stat({ label_id: "c", stock: 100 }),
    stat({ label_id: "d", stock: 100 }),
  ];
  const choix = simuler(labels, 40);
  const n = compter(choix);
  assert((n.get("a") ?? 0) >= 18 && (n.get("a") ?? 0) <= 20, `a ${n.get("a")}`);
  assert((n.get("b") ?? 0) >= 9 && (n.get("b") ?? 0) <= 11, `b ${n.get("b")}`);
  assert(maxParFenetre(choix, 4) <= 2, `choix ${choix}`);
});

Deno.test("une langue déséquilibrée se rattrape : le label déjà sur-représenté attend", () => {
  // Comme le portugais : smart_girl 6 sur 12.
  const labels = [
    stat({ label_id: "smart_girl", comptes_langue: 6, stock: 874 }),
    stat({ label_id: "weird_alpha", comptes_langue: 3, stock: 501 }),
    stat({ label_id: "amy", comptes_langue: 2, stock: 343 }),
    stat({ label_id: "alpha_male", comptes_langue: 1, stock: 1194 }),
  ];
  const choix = simuler(labels, 4);
  assert(!choix.includes("smart_girl"), `choix ${choix}`);
  assertEquals(choix[0], "alpha_male");
});

Deno.test("égalité dans la langue : la flotte départage, puis le poids, puis l'id (stable, sans hasard)", () => {
  const flotte = [
    stat({ label_id: "a", comptes_total: 30 }),
    stat({ label_id: "b", comptes_total: 5 }),
  ];
  assertEquals(choisirLabelEquilibre(flotte), "b");
  const poids = [stat({ label_id: "a", stock: 100 }), stat({ label_id: "b", stock: 900 })];
  // Même retard dans la langue et la flotte à 0 compte : le plus lourd (retard ∝ part).
  assertEquals(choisirLabelEquilibre(poids), "b");
  const identiques = [stat({ label_id: "z" }), stat({ label_id: "m" })];
  for (let i = 0; i < 5; i++) assertEquals(choisirLabelEquilibre(identiques), "m");
});

Deno.test("rien à choisir : null ; doublons ignorés ; lignes RPC normalisées", () => {
  assertEquals(choisirLabelEquilibre([]), null);
  assertEquals(classerLabels([stat({ label_id: "a" }), stat({ label_id: "a", comptes_langue: 9 })]).length, 1);
  assertEquals(
    normaliserStatLabel({
      label_id: "x",
      comptes_langue: "2",
      comptes_total: null,
      stock: "874",
      passages: 10,
      perf_label: "1.034",
      perf_flotte: null,
      recents_nb: "2",
      recence: 3,
    }),
    {
      label_id: "x",
      comptes_langue: 2,
      comptes_total: 0,
      stock: 874,
      passages: 10,
      perf_label: 1.034,
      perf_flotte: null,
      recents_nb: 2,
      recence: 3,
    },
  );
  // Colonnes absentes : neutres.
  const vide = normaliserStatLabel({ label_id: "x" });
  assertEquals([vide.recents_nb, vide.recence, vide.perf_label], [0, 0, null]);
});
