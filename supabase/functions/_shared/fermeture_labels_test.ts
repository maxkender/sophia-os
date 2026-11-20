/**
 * Fermeture des labels à l'assignation : qui perd quoi, qui reçoit un nouveau
 * label, ce que dit le run.
 */
import { assertEquals } from "jsr:@std/assert@1";

import { REGLAGES_CHOIX_LABEL_DEFAUT, type StatLabelCreation } from "./choix_label_equilibre.ts";
import {
  applicationsDuCompte,
  choisirDansLeTheme,
  type CompteLabels,
  type LabelTheme,
  ligneFermetureLabels,
  paliersTheme,
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

Deno.test("pool : les labels qui servent toutes les applications du compte (sans application cochée = personne)", () => {
  const liens = [
    { label_id: "bsg", application_id: ID_SOPHIA },
    { label_id: "bsg", application_id: UNSWIPE },
    { label_id: "med", application_id: MICABO },
  ];
  assertEquals(poolPourApplications(["bsg", "med", "weird"], liens, [ID_SOPHIA]), ["bsg"]);
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

// ── Réaffectation dans le même thème (0794) ──

const L = (id: string, genre: string | null = null): LabelTheme => ({ id, nom: id, genre });
const POOL = [L("clean_study", "femme"), L("smart_girl", "femme"), L("alpha_male", "homme"), L("Fathomly"), L("male_study", "homme")];

function st(over: Partial<StatLabelCreation> & { label_id: string }): StatLabelCreation {
  return {
    comptes_langue: 0, comptes_pays: 0, comptes_total: 0, passages_restants: 100_000, demande_jour: 0, passages: 0,
    perf_label: null, perf_flotte: 1, recents_langue: 0, recence_langue: 0, recents_pays: 0, recence_pays: 0, ...over,
  };
}

Deno.test("paliers : même thème et genre compatible, puis genre compatible, puis tous", () => {
  // classic_study (études, sans genre) : tous les labels d'études, quel que soit leur genre.
  assertEquals(paliersTheme(L("classic_study"), POOL), [
    ["clean_study", "male_study"],
    ["clean_study", "smart_girl", "alpha_male", "Fathomly", "male_study"],
  ]);
  // that_girl_study (études, femme) : les études femme, puis les labels femme ou sans genre, puis tous.
  assertEquals(paliersTheme(L("that_girl_study", "femme"), POOL), [
    ["clean_study"],
    ["clean_study", "smart_girl", "Fathomly"],
    ["clean_study", "smart_girl", "alpha_male", "Fathomly", "male_study"],
  ]);
  // Aucun label du thème : on commence au genre.
  assertEquals(paliersTheme(L("RH", "femme"), POOL)[0], ["clean_study", "smart_girl", "Fathomly"]);
  // Sans label de départ, ou sans pool.
  assertEquals(paliersTheme(null, POOL), [POOL.map((l) => l.id)]);
  assertEquals(paliersTheme(L("classic_study"), []), []);
});

Deno.test("choix dans le thème : le thème d'abord, sauf s'il est à sec ; sinon le palier suivant", () => {
  const R = REGLAGES_CHOIX_LABEL_DEFAUT;
  const stats = [st({ label_id: "clean_study", perf_label: 0.8, passages: 100 }), st({ label_id: "smart_girl", perf_label: 2, passages: 100 }), st({ label_id: "alpha_male" })];
  const paliers = paliersTheme(L("that_girl_study", "femme"), POOL.filter((l) => stats.some((s) => s.label_id === l.id)));
  // clean_study fait moins bien que smart_girl, mais c'est le même thème.
  assertEquals(choisirDansLeTheme(stats, paliers, R, "app"), { vers: "clean_study", meme: true });
  // Le thème à sec (moins d'un jour de contenu) : on sort du thème, vers le genre compatible.
  const aSec = stats.map((s) => (s.label_id === "clean_study" ? { ...s, passages_restants: 0 } : s));
  assertEquals(choisirDansLeTheme(aSec, paliers, R, "app"), { vers: "smart_girl", meme: false });
  // Tout à sec : le premier du dernier palier, plutôt qu'un compte sans label.
  const tout = stats.map((s) => ({ ...s, passages_restants: 0 }));
  assertEquals(choisirDansLeTheme(tout, paliers, R, "app").meme, false);
  assertEquals(typeof choisirDansLeTheme(tout, paliers, R, "app").vers, "string");
  // Aucun label ouvert.
  assertEquals(choisirDansLeTheme([], paliers, R, "app"), { vers: null, meme: false });
});
