/**
 * Le terme « piste du compte source » dans la note d'import (migration 0264).
 *
 * La propriété qui compte le plus ici n'est pas que le nouveau terme marche,
 * c'est qu'il soit NEUTRE tant qu'on ne l'active pas : un poids à 0, ou une
 * source dont on ne sait rien, doit rendre exactement la note d'avant. Sans
 * ça, déployer le code changerait silencieusement ce qui entre dans l'OS.
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";

import { decomposerElo, scoreDepuisVues } from "./import_contenu.ts";

const BASE = {
  pertinence: 80,
  vues: 20_000,
  langue: "en",
  langueSource: "en",
  prior: 50,
  k: 1,
  poidsVues: 0.7,
  vuesPlafond: 80_000,
  seuil: 54,
};

Deno.test("sans poids source, la note est celle d'avant 0264, au bit près", () => {
  const avant = decomposerElo(BASE);
  // Même appel, mais en passant une piste très haute ET un poids nul.
  const apres = decomposerElo({ ...BASE, pisteSource: 99, poidsSource: 0 });
  assertEquals(apres.elo, avant.elo);
  assertEquals(apres.base, avant.base);
  assertEquals(apres.poidsSource, 0);
});

Deno.test("source inconnue : le terme ne s'applique pas, même avec un poids", () => {
  const reference = decomposerElo(BASE);
  for (const piste of [null, undefined, Number.NaN]) {
    const r = decomposerElo({ ...BASE, pisteSource: piste, poidsSource: 0.45 });
    assertEquals(
      r.elo,
      reference.elo,
      `piste=${piste} aurait dû laisser la note intacte`,
    );
    assertEquals(r.pisteSource, null);
    assertEquals(r.poidsSource, 0, "pas de preuve => poids ramené à 0");
  }
});

Deno.test("une source neuve n'est ni avantagée ni pénalisée", () => {
  // Le piège qu'on évite : poser 50 par défaut. Ça tirerait vers le milieu
  // un contenu fort (le pénalisant) comme un contenu faible (le sauvant).
  const fort = { ...BASE, pertinence: 95, vues: 200_000 };
  const faible = { ...BASE, pertinence: 20, vues: 500 };
  for (const cas of [fort, faible]) {
    const inconnue = decomposerElo({ ...cas, pisteSource: null, poidsSource: 0.45 });
    const sansTerme = decomposerElo(cas);
    assertEquals(inconnue.elo, sansTerme.elo);
  }
  // Et pour bien montrer que « 50 » n'aurait PAS été neutre :
  const avec50 = decomposerElo({ ...fort, pisteSource: 50, poidsSource: 0.45 });
  assert(
    avec50.elo < decomposerElo(fort).elo,
    "une piste à 50 abaisse un contenu fort : ce n'est donc pas un défaut neutre",
  );
});

Deno.test("la piste déplace la note dans le bon sens, proportionnellement", () => {
  const basse = decomposerElo({ ...BASE, pisteSource: 10, poidsSource: 0.45 });
  const haute = decomposerElo({ ...BASE, pisteSource: 90, poidsSource: 0.45 });
  assert(haute.elo > basse.elo, "une meilleure source doit monter la note");

  // base = w×piste + (1−w)×baseTexte, vérifié à la main plutôt que recopié
  // depuis l'implémentation.
  const baseTexte = 0.3 * 80 + 0.7 * scoreDepuisVues(20_000, 80_000);
  assertAlmostEquals(haute.base, 0.45 * 90 + 0.55 * baseTexte, 1e-9);
  assertAlmostEquals(basse.base, 0.45 * 10 + 0.55 * baseTexte, 1e-9);
});

Deno.test("les bornes tiennent : piste et poids hors plage sont ramenés", () => {
  assertEquals(decomposerElo({ ...BASE, pisteSource: 150, poidsSource: 0.45 }).pisteSource, 100);
  assertEquals(decomposerElo({ ...BASE, pisteSource: -30, poidsSource: 0.45 }).pisteSource, 0);
  assertEquals(decomposerElo({ ...BASE, pisteSource: 50, poidsSource: 9 }).poidsSource, 1);
  assertEquals(decomposerElo({ ...BASE, pisteSource: 50, poidsSource: -2 }).poidsSource, 0);
});

Deno.test("à poids 1, la note ne dépend plus que de la piste", () => {
  const a = decomposerElo({ ...BASE, pertinence: 0, vues: 0, pisteSource: 70, poidsSource: 1 });
  const b = decomposerElo({
    ...BASE,
    pertinence: 100,
    vues: 500_000,
    pisteSource: 70,
    poidsSource: 1,
  });
  assertEquals(a.elo, b.elo);
  assertAlmostEquals(a.base, 70, 1e-9);
});

Deno.test("le seuil recalibré garde le même débit sur un cas témoin", () => {
  // Contenu moyen typique : pertinence 75, 20k vues source, source médiane.
  // Il passait à 55 avant ; il doit encore passer à 54 après, sinon le
  // recalibrage du seuil n'a pas fait son travail.
  const avant = decomposerElo({ ...BASE, pertinence: 75, seuil: 55 });
  assert(avant.retenue, "cas témoin : admis avant 0264");
  const apres = decomposerElo({
    ...BASE,
    pertinence: 75,
    pisteSource: 50,
    poidsSource: 0.45,
    seuil: 54,
  });
  assert(apres.retenue, "cas témoin : toujours admis après 0264");
});
