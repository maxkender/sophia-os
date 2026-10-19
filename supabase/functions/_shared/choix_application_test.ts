/**
 * Choix de l'application d'un nouveau compte, côté moteur.
 *
 * Les trois fonctions miroir (`applicationsEligibles`, `lireCibleApplications`,
 * `classerApplications`) sont déjà couvertes par le front, et un test interdit
 * aux deux copies de diverger (`scoreApplication.test.ts`, bloc « copie
 * Deno »). On les retouche ici quand même sur les cas qui comptent EN
 * PRODUCTION, parce que c'est cette copie-ci qui crée les comptes.
 *
 * `choisirApplication` et `partsPourApplication`, elles, n'existent que de ce
 * côté : ce sont exactement les deux que `manage-users` appelle.
 */
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  type ApplicationCandidate,
  applicationsEligibles,
  choisirApplication,
  classerApplications,
  lireCibleApplications,
  type MarcheApplications,
  partsPourApplication,
} from "./choix_application.ts";

const SLUG_SOPHIA = "sophia";

/** Les trois applications de la prod au 19/10. */
const APPS: ApplicationCandidate[] = [
  { id: "id-sophia", slug: "sophia", langues: null },
  { id: "id-unswipe", slug: "unswipe", langues: ["fr", "en", "de", "it", "es", "tr"] },
  { id: "id-micabo", slug: "micabo", langues: ["fr", "tr", "de", "es"] },
];

function marche(
  parts: Record<string, number>,
  langue = "fr",
  pays: string | null = "FR",
): MarcheApplications {
  return {
    langue,
    pays,
    parts: Object.entries(parts).map(([slug, comptes]) => ({
      application_id: `id-${slug}`,
      slug,
      comptes,
    })),
  };
}

/** La cible réellement posée par les admins au 19/10. */
const CIBLE = lireCibleApplications({ sophia: 70, unswipe: 20, micabo: 10 }, [
  "sophia",
  "unswipe",
  "micabo",
]);

Deno.test("partsPourApplication : Sophia reste nulle, le reste est explicite", () => {
  // `null` n'est pas un oubli : c'est le chemin historique, et la colonne
  // nulle vaut 100 % Sophia (0256). Écrire {sophia:100} à la place rendrait
  // les comptes créés après la bascule différents de ceux d'avant, et
  // `partsEffectives` ne traite pas les deux de la même façon.
  assertStrictEquals(partsPourApplication("sophia", SLUG_SOPHIA), null);
  assertEquals(partsPourApplication("unswipe", SLUG_SOPHIA), { unswipe: 100 });
  assertEquals(partsPourApplication("micabo", SLUG_SOPHIA), { micabo: 100 });
});

Deno.test("choisirApplication : le marché français d'aujourd'hui donne Unswipe", () => {
  // Chiffres réels au 19/10 : Sophia 16, Unswipe 3, Micabo 2. Sophia est très
  // au-dessus de ses 70 %, donc la recrue suivante va ailleurs.
  const choix = choisirApplication(marche({ sophia: 16, unswipe: 3, micabo: 2 }), CIBLE, APPS);
  assertEquals(choix?.slug, "unswipe");
});

Deno.test("choisirApplication : un marché vide va à la plus grosse cible", () => {
  assertEquals(choisirApplication(marche({}), CIBLE, APPS)?.slug, "sophia");
});

Deno.test("choisirApplication : en polonais, seule Sophia sert", () => {
  const choix = choisirApplication(marche({ sophia: 8 }, "pl", "PL"), CIBLE, APPS);
  assertEquals(choix?.slug, "sophia");
});

Deno.test("choisirApplication : null quand la cible n'accorde rien au marché", () => {
  // Une cible qui ne couvre aucune application servant la langue est une
  // erreur de réglage. L'appelant doit retomber sur Sophia, pas deviner.
  const sansSophia = lireCibleApplications({ unswipe: 100 }, ["sophia", "unswipe", "micabo"]);
  assertStrictEquals(choisirApplication(marche({}, "pl", "PL"), sansSophia, APPS), null);
});

Deno.test("choisirApplication : une application à cible zéro n'est jamais choisie", () => {
  const sansMicabo = lireCibleApplications({ sophia: 50, unswipe: 50 }, [
    "sophia",
    "unswipe",
    "micabo",
  ]);
  for (let i = 0; i < 6; i += 1) {
    const choix = choisirApplication(marche({ sophia: i, unswipe: i, micabo: 0 }), sansMicabo, APPS);
    assertEquals(choix?.slug === "micabo", false);
  }
});

Deno.test("la suite des choix converge vers la cible", () => {
  // Ce que fera vraiment le moteur sur dix créations dans un marché neuf.
  const comptes: Record<string, number> = { sophia: 0, unswipe: 0, micabo: 0 };
  for (let i = 0; i < 10; i += 1) {
    const slug = choisirApplication(marche(comptes), CIBLE, APPS)!.slug;
    comptes[slug] += 1;
  }
  assertEquals(comptes, { sophia: 7, unswipe: 2, micabo: 1 });
});

Deno.test("cible absente : source defaut, que l'appelant doit refuser d'appliquer", () => {
  // Le repli « parts égales » est un choix de PLAYGROUND, pour montrer à
  // l'écran que personne n'a décidé. Appliqué à la création, il enverrait un
  // compte sur trois vers Micabo. `manage-users` s'abstient sur ce marqueur.
  for (const vide of [null, undefined, {}, { sophia: 0 }, "n'importe quoi"]) {
    assertEquals(lireCibleApplications(vide, ["sophia", "unswipe", "micabo"]).source, "defaut");
  }
  assertEquals(lireCibleApplications({ sophia: 70 }, ["sophia"]).source, "reglage");
});

Deno.test("l'éligibilité par langue écarte ce qui ne publie pas", () => {
  assertEquals(applicationsEligibles("pl", APPS).map((a) => a.slug), ["sophia"]);
  assertEquals(applicationsEligibles("it", APPS).map((a) => a.slug), ["sophia", "unswipe"]);
  assertEquals(applicationsEligibles("FR", APPS).length, 3);
});

Deno.test("la cible est renormalisée sur les seules applications servies", () => {
  // En italien, Micabo ne sert pas : ses 10 % doivent revenir aux deux
  // autres, sinon la somme ne fait plus 100 et le classement est faussé.
  const it = classerApplications(marche({}, "it", "IT"), CIBLE, APPS);
  assertEquals(it.length, 2);
  assertEquals(Math.round(it.reduce((a, x) => a + x.partVisee, 0)), 100);
  assertEquals(Math.round(it.find((x) => x.slug === "sophia")!.partVisee), 78);
});

Deno.test("le classement est stable : deux appels donnent le même gagnant", () => {
  const m = marche({ sophia: 16, unswipe: 3, micabo: 2 });
  assertEquals(choisirApplication(m, CIBLE, APPS)?.slug, choisirApplication(m, CIBLE, APPS)?.slug);
});
