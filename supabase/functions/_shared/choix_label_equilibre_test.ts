/**
 * Choix du label à la création : équilibre par langue, pondéré par le stock et
 * la performance, sans hasard.
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";

import {
  choisirLabelEquilibre,
  classerLabels,
  facteurPerformance,
  normaliserStatLabel,
  PERF_FACTEUR_MAX,
  PERF_FACTEUR_MIN,
  poidsLabel,
  type StatLabelCreation,
} from "./choix_label_equilibre.ts";

function stat(over: Partial<StatLabelCreation> & { label_id: string }): StatLabelCreation {
  return {
    comptes_langue: 0,
    comptes_total: 0,
    stock: 400,
    passages: 0,
    mediane_vues: null,
    mediane_flotte: 1500,
    recents_langue: 0,
    ...over,
  };
}

/** Récence comme la RPC : 0 = absent des `taille` derniers ; le dernier vaut `taille`. */
function recence(historique: readonly string[], label: string, taille: number): number {
  const fenetre = historique.slice(-taille).reverse(); // rang 1 = le plus récent
  const rang = fenetre.indexOf(label);
  return rang < 0 ? 0 : taille - rang;
}

/**
 * Rejoue N créations dans une langue, en ajoutant chaque choix aux compteurs et
 * en tenant la fenêtre des `recents` derniers comptes (comme la RPC).
 */
function simuler(depart: StatLabelCreation[], n: number, recents = 3, historique: string[] = []): string[] {
  const etat = depart.map((s) => ({ ...s }));
  const fenetre = [...historique];
  const choix: string[] = [];
  for (let i = 0; i < n; i++) {
    for (const s of etat) s.recents_langue = recence(fenetre, s.label_id, recents);
    const id = choisirLabelEquilibre(etat);
    if (!id) break;
    choix.push(id);
    fenetre.push(id);
    const s = etat.find((x) => x.label_id === id)!;
    s.comptes_langue += 1;
    s.comptes_total += 1;
  }
  return choix;
}

/** Le plus grand nombre d'un même label dans une fenêtre glissante. */
function maxParFenetre(ids: string[], taille: number): number {
  let max = 0;
  for (let i = 0; i + taille <= ids.length; i++) {
    for (const v of compter(ids.slice(i, i + taille)).values()) max = Math.max(max, v);
  }
  return max;
}

function compter(ids: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

Deno.test("performance : lissée vers la flotte quand le label a peu de posts, bornée", () => {
  assertEquals(facteurPerformance(stat({ label_id: "a" })), 1);
  // 6 posts à 5 560 : le lissage le ramène près de la flotte.
  const peu = facteurPerformance(stat({ label_id: "a", passages: 6, mediane_vues: 5560 }));
  assert(peu > 1 && peu < 1.3, `facteur ${peu}`);
  // Beaucoup de posts très au-dessus : plafonné ; très en dessous : plancher.
  assertEquals(facteurPerformance(stat({ label_id: "a", passages: 5000, mediane_vues: 99999 })), PERF_FACTEUR_MAX);
  assertEquals(facteurPerformance(stat({ label_id: "a", passages: 5000, mediane_vues: 1 })), PERF_FACTEUR_MIN);
  // Pas de référence de flotte : neutre.
  assertEquals(facteurPerformance(stat({ label_id: "a", mediane_flotte: null, passages: 50, mediane_vues: 9000 })), 1);
});

Deno.test("poids : √stock × performance ; un label sans stock pèse √1, jamais écarté", () => {
  assertAlmostEquals(poidsLabel(stat({ label_id: "a", stock: 400 })), 20);
  assertAlmostEquals(poidsLabel(stat({ label_id: "a", stock: 0 })), 1);
  const ids = classerLabels([stat({ label_id: "vide", stock: 0 }), stat({ label_id: "plein" })]).map((c) => c.label_id);
  assertEquals(ids.sort(), ["plein", "vide"]);
});

Deno.test("4 comptes dans une langue neuve : 4 labels différents, jamais 3 identiques", () => {
  const labels = ["a", "b", "c", "d", "e", "f", "g"].map((id, i) =>
    stat({ label_id: id, stock: 1600 - i * 200, passages: 500, mediane_vues: 1500 + (i === 2 ? 1500 : 0) })
  );
  const choix = simuler(labels, 4);
  assertEquals(new Set(choix).size, 4);
});

Deno.test("le meilleur label en tête, puis une répartition qui suit les poids", () => {
  const labels = [
    stat({ label_id: "star", stock: 700, passages: 1000, mediane_vues: 3300 }),
    stat({ label_id: "gros", stock: 1600, passages: 1000, mediane_vues: 1400 }),
    stat({ label_id: "moyen", stock: 400, passages: 1000, mediane_vues: 1400 }),
    stat({ label_id: "maigre", stock: 50, passages: 300, mediane_vues: 900 }),
  ];
  const choix = simuler(labels, 20);
  assertEquals(choix[0], "star");
  const n = compter(choix);
  assert((n.get("star") ?? 0) > (n.get("moyen") ?? 0));
  assert((n.get("gros") ?? 0) > (n.get("maigre") ?? 0));
  assert((n.get("maigre") ?? 0) >= 1, "un label maigre garde sa petite part");
});

Deno.test("pas de rafale : une langue en rattrapage n'enchaîne pas 3 fois le même label", () => {
  // Comme le roumain : weird_alpha très en retard, les autres déjà servis.
  const labels = [
    stat({ label_id: "weird_alpha", comptes_langue: 0, stock: 1600, passages: 800, mediane_vues: 1900 }),
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

Deno.test("les derniers comptes de la langue comptent : le label du dernier compte attend", () => {
  const labels = [
    stat({ label_id: "a", stock: 900 }),
    stat({ label_id: "b", stock: 800 }),
    stat({ label_id: "c", stock: 700 }),
  ];
  // Sans historique : « a » (le plus lourd). Si le dernier compte créé porte « a » : un autre.
  assertEquals(choisirLabelEquilibre(labels), "a");
  const apres = labels.map((s) => (s.label_id === "a" ? { ...s, recents_langue: 3 } : s));
  assertEquals(choisirLabelEquilibre(apres), "b");
});

Deno.test("tous les labels en retard ont servi récemment : le moins récent passe, jamais le dernier", () => {
  // Comme l'allemand : 3 labels en retard, tous parmi les 3 derniers comptes.
  const labels = [
    stat({ label_id: "gros", comptes_langue: 1, stock: 3600, recents_langue: 3 }),
    stat({ label_id: "moyen", comptes_langue: 1, stock: 2500, recents_langue: 2 }),
    stat({ label_id: "petit", comptes_langue: 0, stock: 400, recents_langue: 1 }),
    stat({ label_id: "servi", comptes_langue: 9, stock: 900 }),
  ];
  assertEquals(choisirLabelEquilibre(labels), "petit");
  // Un label à jour (pas en retard) ne passe jamais devant un label en retard,
  // même absent des derniers comptes.
  assert(classerLabels(labels).findIndex((c) => c.label_id === "servi") === 3);
});

Deno.test("petit pool : les parts tiennent quand même (pas de tourniquet)", () => {
  // 2 labels : impossible d'éviter les 3 derniers, on alterne au mieux.
  assertEquals(compter(simuler([stat({ label_id: "a" }), stat({ label_id: "b" })], 6)).get("a"), 3);
  // 4 labels aux parts 60 / 20 / 10 / 10 % : 40 créations suivent les parts.
  const labels = [
    stat({ label_id: "a", stock: 3600 }),
    stat({ label_id: "b", stock: 400 }),
    stat({ label_id: "c", stock: 100 }),
    stat({ label_id: "d", stock: 100 }),
  ];
  const n = compter(simuler(labels, 40));
  assert((n.get("a") ?? 0) >= 22 && (n.get("a") ?? 0) <= 26, `a ${n.get("a")}`);
  assert((n.get("b") ?? 0) >= 6 && (n.get("b") ?? 0) <= 10, `b ${n.get("b")}`);
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
      mediane_vues: "1554.5",
      mediane_flotte: null,
      recents_langue: "2",
    }),
    {
      label_id: "x",
      comptes_langue: 2,
      comptes_total: 0,
      stock: 874,
      passages: 10,
      mediane_vues: 1554.5,
      mediane_flotte: null,
      recents_langue: 2,
    },
  );
  // Ancienne RPC sans la colonne : aucun récent.
  assertEquals(normaliserStatLabel({ label_id: "x" }).recents_langue, 0);
});
