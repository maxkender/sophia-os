import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  type AgregatCta,
  CODES_FORMES,
  ficheLabel,
  FORMES_CTA,
  lireClassement,
  poidsDesFormes,
  promptClassement,
} from "./formes_cta.ts";

const forme = (valeur: string, n: number, effet: number | null, percee = 0.1): AgregatCta => ({
  label: "smart_girl",
  application_id: "sophia",
  dimension: "forme",
  valeur,
  n,
  contenus: Math.ceil(n / 3),
  r_med: 1,
  effet,
  percee,
});

const somme = (xs: ReadonlyArray<{ poids: number }>) => Math.round(xs.reduce((s, x) => s + x.poids, 0) * 100) / 100;

Deno.test("7 formes, toutes distinctes, plus « autre »", () => {
  assertEquals(FORMES_CTA.length, 7);
  assertEquals(CODES_FORMES.size, 8);
});

Deno.test("le classement lit les formes valides et range l'inconnu dans « autre »", () => {
  const brut = 'voilà : {"formes":[{"id":0,"forme":"habitude_perso"},{"id":1,"forme":"inventée"},{"id":7,"forme":"point_liste"}]}';
  const lu = lireClassement(brut, 3);
  assertEquals(lu.get(0), "habitude_perso");
  assertEquals(lu.get(1), "autre");
  assertEquals(lu.has(2), false);
  assertEquals(lu.has(7), false);
  assertEquals(lireClassement("pas de json", 3).size, 0);
});

Deno.test("la consigne de classement liste les formes par priorité et numérote les CTA", () => {
  const p = promptClassement([
    { cta_hash: "a", cta_texte: "j'utilise l'appli Sophia", avant: "4. lis" },
    { cta_hash: "b", cta_texte: "an app like Sophia", avant: null },
  ]);
  assert(p.indexOf("format_du_post") < p.indexOf("point_liste"));
  assert(p.includes('{"id":0,"avant":"4. lis","cta":"j\'utilise l\'appli Sophia"}'));
  assert(p.includes('{"id":1,"avant":"","cta":"an app like Sophia"}'));
});

Deno.test("prouvées 80 % au prorata de leur effet, essais 20 % à parts égales, à éviter jamais", () => {
  const poids = poidsDesFormes([
    forme("point_liste", 120, 1.2),
    forme("habitude_perso", 40, 1.0),
    forme("avant_apres", 30, 0.7),
    forme("mention_breve", 10, 1.5), // trop peu de posts : essai
  ]);
  const de = (code: string) => poids.find((p) => p.forme === code)!;
  assertEquals(de("point_liste").statut, "prouvee");
  assertEquals(de("point_liste").poids, 0.436);
  assertEquals(de("habitude_perso").poids, 0.364);
  assertEquals(de("avant_apres").statut, "a_eviter");
  assertEquals(de("avant_apres").poids, 0);
  assertEquals(de("mention_breve").statut, "essai");
  // 4 essais (mention_breve, format_du_post, ce_quils_font, quand_tu) : 5 % chacun.
  assertEquals(de("mention_breve").poids, 0.05);
  assertEquals(somme(poids), 1);
});

Deno.test("sans preuve pour le label : les formes prouvées tous labels confondus ; sinon tirage égal", () => {
  const repli = [forme("habitude_perso", 300, 1.1), forme("quand_tu", 200, 0.8)];
  const poids = poidsDesFormes([forme("habitude_perso", 5, 0.9), forme("quand_tu", 25, 0.95)], repli);
  const habitude = poids.find((p) => p.forme === "habitude_perso")!;
  assertEquals(habitude.statut, "prouvee");
  assertEquals(habitude.repli, true);
  assertEquals(habitude.poids, 0.8);
  // Une forme à éviter pour l'appli reste un essai pour le label tant qu'il n'a pas ses 20 posts.
  assertEquals(poids.find((p) => p.forme === "quand_tu")!.statut, "essai");
  assertEquals(somme(poids), 1);

  const egal = poidsDesFormes([]);
  assert(egal.every((p) => p.statut === "essai" && p.poids === 0.143));
});

Deno.test("la fiche label donne le tirage, les formes, la slide du CTA et le journal", () => {
  const formes = poidsDesFormes([forme("point_liste", 120, 1.2, 0.2), forme("avant_apres", 30, 0.7)]);
  const slide = (valeur: string, n: number, r: number): AgregatCta => ({
    ...forme(valeur, n, r),
    dimension: "slide",
  });
  const fiche = ficheLabel("smart_girl", "02/11/2026", [
    {
      appli: "Sophia",
      posts: 150,
      formes,
      slides: [slide("8+", 10, 1.3), slide("4", 60, 1.1), slide("2", 5, 0.6)],
      places: [{ ...slide("derniere", 70, 1.2), dimension: "place" }],
      voies: [{ ...slide("aucune", 150, 1), dimension: "voie" }],
      avant: new Map([["point_liste", "essai"]]),
    },
  ]);
  assert(fiche.startsWith("# Fiche label : smart_girl\n"));
  assert(fiche.includes("## Sophia · 150 posts"));
  assert(fiche.includes("- **Prouvée** : Un point de la liste 80 %"));
  assert(fiche.includes("- **À éviter** (jamais tirée) : Avant / après"));
  assert(fiche.includes("| Un point de la liste | 120 | 1,20 | 20 % | forte | prouvée |"));
  // Slides dans l'ordre, « 8+ » en dernier ; la voie « aucune » n'est pas montrée.
  assert(fiche.indexOf("| 2 | 5 |") < fiche.indexOf("| 4 | 60 |"));
  assert(fiche.indexOf("| 4 | 60 |") < fiche.indexOf("| 8+ | 10 |"));
  assert(fiche.includes("dernière : 1,20 (70 posts)"));
  assert(!fiche.includes("### Les voies"));
  assert(fiche.includes("- Un point de la liste : essai → prouvée"));
});
