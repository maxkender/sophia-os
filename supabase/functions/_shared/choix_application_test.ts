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
  candidatsAllumes,
  choisirApplication,
  classerApplications,
  type EtatApplication,
  gelOuvert,
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

// ---------------------------------------------------------------------------
// 26/11 (Max) : une application gelée ou coupée est sautée (même définition que le contrôle du lundi, 0859).
// ---------------------------------------------------------------------------

/** Ce que rend `stats_choix_application` en France le 26/11 : Atala (gelée) et Artura y sont candidates. */
const STATS_26_11 = [
  { application_id: "id-artura", slug: "artura", comptes: 40 },
  { application_id: "id-atala", slug: "atala", comptes: 30 },
  { application_id: "id-sophia", slug: "sophia", comptes: 120 },
];
/** Le réglage `repartition_applications` du 26/11, jamais touché. */
const REGLAGE_26_11 = { sophia: 60, atala: 20, artura: 20 };
const APPS_26_11: ApplicationCandidate[] = STATS_26_11.map((c) => ({ id: c.application_id, slug: c.slug, langues: null }));

/** La chaîne de `choisirApplicationPourCompte` (sans la File) : filtre, cible, classement. */
function choixDu(etats: EtatApplication[], stats = STATS_26_11) {
  const candidats = candidatsAllumes(stats, etats);
  if (candidats.length === 0) return { gagnant: null, parts: {} as Record<string, number> };
  const cible = lireCibleApplications(REGLAGE_26_11, candidats.map((c) => c.slug));
  const classement = classerApplications(
    { langue: "fr", pays: "FR", parts: candidats.map((c) => ({ ...c })) },
    cible,
    APPS_26_11.filter((a) => candidats.some((c) => c.application_id === a.id)),
  );
  return { gagnant: classement[0]?.slug ?? null, parts: Object.fromEntries(classement.map((c) => [c.slug, Math.round(c.partVisee)])) };
}

const ALLUMEES: EtatApplication[] = [
  { id: "id-sophia", actif: true, gelee: false },
  { id: "id-atala", actif: true, gelee: false },
  { id: "id-artura", actif: true, gelee: false },
];

Deno.test("candidatsAllumes : une application gelée (Atala) est sautée, ses parts vont aux autres", () => {
  const etats: EtatApplication[] = [
    { id: "id-sophia", actif: true, gelee: false },
    { id: "id-atala", actif: false, gelee: true },
    { id: "id-artura", actif: true, gelee: false },
  ];
  assertEquals(candidatsAllumes(STATS_26_11, etats).map((c) => c.slug), ["artura", "sophia"]);
  // 60/20 renormalisés sur Sophia et Artura : 75/25, jamais Atala.
  assertEquals(choixDu(etats).parts, { sophia: 75, artura: 25 });
  assertEquals(choixDu(etats).gagnant === "atala", false);
});

Deno.test("candidatsAllumes : une application coupée sans gel (actif = false) est sautée aussi", () => {
  const etats: EtatApplication[] = [
    { id: "id-sophia", actif: true, gelee: false },
    { id: "id-atala", actif: false, gelee: true },
    { id: "id-artura", actif: false, gelee: false },
  ];
  assertEquals(candidatsAllumes(STATS_26_11, etats).map((c) => c.slug), ["sophia"]);
  assertEquals(choixDu(etats), { gagnant: "sophia", parts: { sophia: 100 } });
});

Deno.test("candidatsAllumes : un gel ouvert saute l'application même si elle est restée allumée", () => {
  const etats: EtatApplication[] = [
    { id: "id-sophia", actif: true, gelee: false },
    { id: "id-atala", actif: true, gelee: true },
    { id: "id-artura", actif: true, gelee: false },
  ];
  assertEquals(candidatsAllumes(STATS_26_11, etats).map((c) => c.slug), ["artura", "sophia"]);
});

Deno.test("candidatsAllumes : rallumée, l'application reprend sa part sans toucher au réglage", () => {
  assertEquals(choixDu(ALLUMEES).parts, { sophia: 60, atala: 20, artura: 20 });
  // Atala, très en retard sur ses 20 % (30 comptes contre 120 Sophia), reprend la recrue suivante.
  assertEquals(choixDu(ALLUMEES, [
    { application_id: "id-artura", slug: "artura", comptes: 60 },
    { application_id: "id-atala", slug: "atala", comptes: 5 },
    { application_id: "id-sophia", slug: "sophia", comptes: 120 },
  ]).gagnant, "atala");
});

Deno.test("candidatsAllumes : une application inconnue ou illisible n'est jamais choisie", () => {
  assertEquals(candidatsAllumes(STATS_26_11, [{ id: "id-sophia", actif: true, gelee: false }]).map((c) => c.slug), ["sophia"]);
  assertEquals(candidatsAllumes(STATS_26_11, []), []);
  assertEquals(choixDu([]).gagnant, null); // l'appelant rend alors Sophia (application par défaut)
});

Deno.test("gelOuvert : commencé, sans fin ou fin à venir", () => {
  const maintenant = new Date("2026-11-26T12:00:00Z");
  // Le gel d'Atala : ouvert le 20/11, sans fin.
  assertEquals(gelOuvert({ debut: "2026-11-20T15:26:01Z", fin: null }, maintenant), true);
  assertEquals(gelOuvert({ debut: "2026-11-20T15:26:01Z", fin: "2026-11-30T00:00:00Z" }, maintenant), true);
  // Fermé (le « go ») ou pas encore commencé : l'application n'est pas gelée.
  assertEquals(gelOuvert({ debut: "2026-11-20T15:26:01Z", fin: "2026-11-25T09:00:00Z" }, maintenant), false);
  assertEquals(gelOuvert({ debut: "2026-11-27T00:00:00Z", fin: null }, maintenant), false);
  assertEquals(gelOuvert({ debut: null, fin: null }, maintenant), false);
});
