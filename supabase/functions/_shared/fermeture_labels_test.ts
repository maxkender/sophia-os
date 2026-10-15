/**
 * Fermeture des labels à l'assignation : qui perd quoi, qui reçoit un nouveau
 * label, ce que dit le run.
 */
import { assertEquals } from "jsr:@std/assert@1";

import {
  applicationsDuCompte,
  type CompteLabels,
  ligneFermetureLabels,
  planifierReaffectations,
  poolPourApplications,
  type ResultatFermeture,
} from "./fermeture_labels.ts";
import { ID_SOPHIA } from "./multi_app.ts";

const UNSWIPE = "app-unswipe";
const MICABO = "app-micabo";
const APPS = [
  { id: ID_SOPHIA, slug: "sophia" },
  { id: UNSWIPE, slug: "unswipe" },
  { id: MICABO, slug: "micabo" },
];

function compte(over: Partial<CompteLabels> & { id: string; labels: string[] }): CompteLabels {
  return { handle: over.id, langue: "en", pays: null, ugc: false, partsApplications: null, ...over };
}

Deno.test("applications du compte : la plus grosse part d'abord, Sophia par défaut", () => {
  assertEquals(applicationsDuCompte(null, APPS), { principale: ID_SOPHIA, requises: [ID_SOPHIA] });
  assertEquals(applicationsDuCompte({ unswipe: 100 }, APPS), { principale: UNSWIPE, requises: [UNSWIPE] });
  assertEquals(applicationsDuCompte({ sophia: 30, unswipe: 70 }, APPS), {
    principale: UNSWIPE,
    requises: [UNSWIPE, ID_SOPHIA],
  });
  // Égalité : le slug départage ; application inconnue ignorée ; rien de connu → Sophia.
  assertEquals(applicationsDuCompte({ unswipe: 50, micabo: 50 }, APPS).principale, MICABO);
  assertEquals(applicationsDuCompte({ fantome: 100 }, APPS), { principale: ID_SOPHIA, requises: [ID_SOPHIA] });
});

Deno.test("plan : le label fermé est retiré ; nouveau label seulement s'il ne reste rien", () => {
  const fermeSophia = (l: string, app: string) => l === "film" && app === ID_SOPHIA;
  const actions = planifierReaffectations(
    [
      compte({ id: "c3", labels: ["yellow"] }),
      compte({ id: "c2", labels: ["film", "yellow"] }),
      compte({ id: "c1", labels: ["film"] }),
      // Compte Unswipe : la fermeture se mesure sur Unswipe, pas sur Sophia.
      compte({ id: "c4", labels: ["film"], partsApplications: { unswipe: 100 } }),
    ],
    APPS,
    fermeSophia,
  );
  assertEquals(actions.map((a) => a.compteId), ["c1", "c2"]);
  assertEquals(actions[0], {
    compteId: "c1",
    principale: ID_SOPHIA,
    requises: [ID_SOPHIA],
    retirer: ["film"],
    garder: [],
    besoinNouveau: true,
  });
  assertEquals([actions[1].retirer, actions[1].garder, actions[1].besoinNouveau], [["film"], ["yellow"], false]);
});

Deno.test("plan : un compte UGC sans autre label est laissé à un humain", () => {
  const [a] = planifierReaffectations([compte({ id: "u", labels: ["film"], ugc: true })], APPS, (l) => l === "film");
  assertEquals(a.besoinNouveau, true);
  assertEquals(typeof a.manuel, "string");
  // Avec un autre label, le retrait suffit : rien à décider.
  const [b] = planifierReaffectations([compte({ id: "u", labels: ["film", "x"], ugc: true })], APPS, (l) => l === "film");
  assertEquals(b.manuel, undefined);
});

Deno.test("pool : les labels qui servent toutes les applications du compte (sans ligne = Sophia)", () => {
  const liens = [
    { label_id: "bsg", application_id: ID_SOPHIA },
    { label_id: "bsg", application_id: UNSWIPE },
    { label_id: "med", application_id: MICABO },
  ];
  assertEquals(poolPourApplications(["bsg", "med", "weird"], liens, [ID_SOPHIA]), ["bsg", "weird"]);
  assertEquals(poolPourApplications(["bsg", "med", "weird"], liens, [UNSWIPE, ID_SOPHIA]), ["bsg"]);
  assertEquals(poolPourApplications(["bsg", "med", "weird"], liens, [MICABO]), ["med"]);
});

Deno.test("ligne du run : rien à dire → vide ; sinon fermetures, déplacements, reports", () => {
  const vide: ResultatFermeture = { dryRun: false, fermes: [], deplaces: [], retires: [], manuels: [], reportes: 0, erreurs: [] };
  assertEquals(ligneFermetureLabels(vide), "");
  const ligne = ligneFermetureLabels({
    ...vide,
    dryRun: true,
    fermes: [{ label_id: "f", nom: "alpha_male_film", application_id: ID_SOPHIA, perf: 0.581, posts: 245 }],
    deplaces: [{ compte_id: "c", handle: "sam.focus429", de: ["alpha_male_film"], vers: "weird_alpha" }],
    reportes: 2,
  });
  assertEquals(
    ligne,
    "labels (à blanc) — fermé : alpha_male_film (0,58 de la flotte sur 245 posts) ; " +
      "1 compte(s) déplacé(s) : sam.focus429 alpha_male_film → weird_alpha ; 2 reporté(s) à la nuit suivante",
  );
});
