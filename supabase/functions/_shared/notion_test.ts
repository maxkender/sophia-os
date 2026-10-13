import { assertEquals } from "jsr:@std/assert@1";

import {
  APP_VERS_NOTION,
  PAYS_VERS_NOTION,
  type LigneNotion,
  type LigneOs,
  planifier,
} from "./notion.ts";

function notion(country: string, app: string, hired: number): LigneNotion {
  return { pageId: `page-${country}-${app}`, country, app, hired };
}
function os(pays: string, application: string | null, hired: number): LigneOs {
  return { pays, application, hired };
}

Deno.test("n'écrit que les lignes dont le chiffre change", () => {
  const plan = planifier(
    [os("FR", "sophia", 13), os("DE", "sophia", 16), os("TR", "sophia", 12)],
    [notion("France", "Sophia", 13), notion("Germany", "Sophia", 16), notion("Turkey", "Sophia", 14)],
  );
  assertEquals(plan.inchangees, 2);
  assertEquals(plan.ecritures.length, 1);
  assertEquals(plan.ecritures[0].country, "Turkey");
  assertEquals(plan.ecritures[0].avant, 14);
  assertEquals(plan.ecritures[0].apres, 12);
});

Deno.test("une ligne Notion que l'OS ne peuple plus retombe à zéro", () => {
  // Le dernier posteur d'un pays s'en va : le compteur doit descendre, pas
  // rester figé sur son ancienne valeur.
  const plan = planifier([], [notion("Denmark", "Sophia", 3)]);
  assertEquals(plan.ecritures.length, 1);
  assertEquals(plan.ecritures[0].apres, 0);
});

Deno.test("une ligne déjà à zéro et toujours vide ne déclenche aucune écriture", () => {
  const plan = planifier([], [notion("Israel", "Sophia", 0)]);
  assertEquals(plan.ecritures.length, 0);
  assertEquals(plan.inchangees, 1);
});

Deno.test("KZ, UA et BY alimentent la même ligne russophone, et s'additionnent", () => {
  // La ligne s'appelle « Russian-Speaking (not russia) » : ce n'est pas un
  // pays, et RU n'en fait justement pas partie.
  const plan = planifier(
    [os("KZ", "sophia", 2), os("UA", "sophia", 1), os("BY", "sophia", 1)],
    [notion("Russian-Speaking (not russia)", "Sophia", 0)],
  );
  assertEquals(plan.ecritures.length, 1);
  assertEquals(plan.ecritures[0].apres, 4);
});

Deno.test("RU n'est rattaché à aucune ligne et remonte dans les inconnus", () => {
  // La ligne russophone est à 2 ; les 3 comptes « RU » ne l'alimentent PAS,
  // donc elle retombe à 0 et les 3 comptes sont signalés comme invisibles.
  // C'est exactement pour éviter ce silence que `ru` n'a plus de pays par
  // défaut (migration 0281).
  const plan = planifier([os("RU", "sophia", 3)], [notion("Russian-Speaking (not russia)", "Sophia", 2)]);
  assertEquals(plan.inconnus.length, 1);
  assertEquals(plan.inconnus[0].pays, "RU");
  assertEquals(plan.inconnus[0].hired, 3);
  assertEquals(plan.inconnus[0].raison, "pays sans ligne Notion");
  assertEquals(plan.ecritures.length, 1);
  assertEquals(plan.ecritures[0].apres, 0);
});

Deno.test("un pays réel sans ligne Notion est signalé, jamais perdu en silence", () => {
  // Le scénario qui rendrait le tableau faux sans prévenir : des comptes qui
  // existent et que rien n'affiche.
  const plan = planifier([os("JP", "sophia", 4)], [notion("France", "Sophia", 0)]);
  assertEquals(plan.inconnus.length, 1);
  assertEquals(plan.inconnus[0].pays, "JP");
  assertEquals(plan.inconnus[0].raison, "pays sans ligne Notion");
});

Deno.test("un couple pays × app absent de la table est signalé", () => {
  const plan = planifier([os("FR", "micabo", 3)], [notion("France", "Sophia", 0)]);
  assertEquals(plan.inconnus.length, 1);
  assertEquals(plan.inconnus[0].pays, "France");
  assertEquals(plan.inconnus[0].application, "Micabo");
  assertEquals(plan.inconnus[0].hired, 3);
});

Deno.test("un compte partagé entre applications ne se range nulle part", () => {
  const plan = planifier([os("FR", null, 1)], [notion("France", "Sophia", 0)]);
  assertEquals(plan.inconnus.length, 1);
  assertEquals(plan.inconnus[0].raison, "compte partagé entre plusieurs applications");
});

Deno.test("deux lignes Notion sur le même couple : on n'écrit sur aucune des deux", () => {
  // Rien n'empêche un HM de dupliquer une ligne. Écrire sur les deux ferait
  // deux valeurs contradictoires selon l'ordre de lecture.
  const plan = planifier(
    [os("FR", "sophia", 13)],
    [notion("France", "Sophia", 1), { ...notion("France", "Sophia", 2), pageId: "page-bis" }],
  );
  assertEquals(plan.ecritures.length, 0);
  assertEquals(plan.doublons, ["France / Sophia"]);
});

Deno.test("les trois libellés qui ne tombent pas tout seuls sont bien câblés", () => {
  // Intl.DisplayNames rendrait « United Arab Emirates » et « Türkiye » : les
  // deux casseraient la correspondance. Vérifié ici plutôt qu'en production.
  assertEquals(PAYS_VERS_NOTION["AE"], "UAE");
  assertEquals(PAYS_VERS_NOTION["TR"], "Turkey");
  assertEquals(PAYS_VERS_NOTION["KZ"], "Russian-Speaking (not russia)");
  assertEquals(PAYS_VERS_NOTION["RU"], undefined);
});

Deno.test("les trois applications sont capitalisées comme les options du select", () => {
  assertEquals(APP_VERS_NOTION["sophia"], "Sophia");
  assertEquals(APP_VERS_NOTION["unswipe"], "Unswipe");
  assertEquals(APP_VERS_NOTION["micabo"], "Micabo");
});

Deno.test("le cas réel du 13/10/2026 : 53 lignes sur 56 ne bougent pas", () => {
  // Blanc calculé sur les vrais chiffres, gardé comme filet : si une
  // refactorisation change le comportement, ce test le dit avec les vrais
  // ordres de grandeur plutôt qu'avec des cas jouets.
  const lignesOs: LigneOs[] = [
    os("DE", "micabo", 4), os("ES", "micabo", 2), os("FR", "micabo", 3), os("TR", "micabo", 8),
    os("AU", "sophia", 1), os("BG", "sophia", 4), os("CZ", "sophia", 5), os("DE", "sophia", 16),
    os("EE", "sophia", 2), os("ES", "sophia", 9), os("FI", "sophia", 1), os("FR", "sophia", 13),
    os("GB", "sophia", 2), os("GR", "sophia", 8), os("HR", "sophia", 5), os("HU", "sophia", 10),
    os("IT", "sophia", 10), os("KZ", "sophia", 2), os("NL", "sophia", 5), os("NO", "sophia", 2),
    os("PL", "sophia", 9), os("PT", "sophia", 12), os("RO", "sophia", 10), os("RS", "sophia", 4),
    os("SE", "sophia", 5), os("SI", "sophia", 5), os("SK", "sophia", 3), os("TR", "sophia", 12),
    os("US", "sophia", 3), os("DE", "unswipe", 7), os("ES", "unswipe", 4), os("FR", "unswipe", 3),
    os("IT", "unswipe", 1), os("TR", "unswipe", 3),
  ];
  const avant: Array<[string, string, number]> = [
    ["France", "Micabo", 3], ["Germany", "Micabo", 4], ["Spain", "Micabo", 2], ["Turkey", "Micabo", 8],
    ["Argentina", "Sophia", 0], ["Australia", "Sophia", 0], ["Austria", "Sophia", 0],
    ["Brazil", "Sophia", 0], ["Bulgaria", "Sophia", 4], ["Canada", "Sophia", 0],
    ["Chile", "Sophia", 0], ["Colombia", "Sophia", 0], ["Croatia", "Sophia", 5],
    ["Czechia", "Sophia", 5], ["Denmark", "Sophia", 0], ["Estonia", "Sophia", 2],
    ["Finland", "Sophia", 1], ["France", "Sophia", 13], ["Germany", "Sophia", 16],
    ["Greece", "Sophia", 8], ["Hungary", "Sophia", 10], ["Ireland", "Sophia", 0],
    ["Israel", "Sophia", 0], ["Italy", "Sophia", 10], ["Netherlands", "Sophia", 5],
    ["New Zealand", "Sophia", 0], ["Norway", "Sophia", 2], ["Poland", "Sophia", 9],
    ["Portugal", "Sophia", 12], ["Romania", "Sophia", 10],
    ["Russian-Speaking (not russia)", "Sophia", 2], ["Serbia", "Sophia", 4],
    ["Slovakia", "Sophia", 3], ["Slovenia", "Sophia", 5], ["Spain", "Sophia", 9],
    ["Sweden", "Sophia", 4], ["Switzerland", "Sophia", 0], ["Turkey", "Sophia", 14],
    ["UAE", "Sophia", 0], ["United Kingdom", "Sophia", 2], ["United States", "Sophia", 3],
    ["Uruguay", "Sophia", 0], ["Argentina", "Unswipe", 0], ["Austria", "Unswipe", 0],
    ["Canada", "Unswipe", 0], ["Chile", "Unswipe", 0], ["Colombia", "Unswipe", 0],
    ["France", "Unswipe", 3], ["Germany", "Unswipe", 7], ["Italy", "Unswipe", 1],
    ["Spain", "Unswipe", 4], ["Switzerland", "Unswipe", 0], ["Turkey", "Unswipe", 3],
    ["United Kingdom", "Unswipe", 0], ["United States", "Unswipe", 0], ["Uruguay", "Unswipe", 0],
  ];
  const lignesNotion = avant.map(([c, a, h]) => notion(c, a, h));
  assertEquals(lignesNotion.length, 56);

  const plan = planifier(lignesOs, lignesNotion);
  assertEquals(plan.inchangees, 53);
  assertEquals(plan.inconnus, []);
  assertEquals(plan.doublons, []);
  assertEquals(
    plan.ecritures.map((e) => `${e.country}/${e.app} ${e.avant}->${e.apres}`).sort(),
    ["Australia/Sophia 0->1", "Sweden/Sophia 4->5", "Turkey/Sophia 14->12"],
  );
});
