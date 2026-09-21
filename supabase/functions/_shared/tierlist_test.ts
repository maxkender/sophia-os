import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";

import { PLAFOND_LIGNES } from "./lots.ts";
import {
  blocRunTierlist,
  deciderRequalif,
  reporterBlocTierlist,
  verifierCoherenceLecture,
  type DecisionRequalifEntree,
  type RequalificationResultat,
} from "./tierlist.ts";

const JOUR_MS = 86_400_000;
const MAINTENANT = Date.parse("2026-09-21T00:00:00Z");

/** Cycle terminé, mesuré, assez vieux pour être jugé — le cas nominal. */
function entree(p: Partial<DecisionRequalifEntree> = {}): DecisionRequalifEntree {
  return {
    publies: 4,
    passagesPrevus: 4,
    mesures: 4,
    introuvables: 0,
    enAttenteMesure: 0,
    moyenne: 12_000,
    dernierPublieMs: MAINTENANT - 5 * JOUR_MS,
    maintenantMs: MAINTENANT,
    reculJours: 1,
    requalifMaxJours: 3,
    ...p,
  };
}

/* -------------------------------------------------------------------------
 * Le filtre de la vue `contenu_a_requalifier` (migration 0253).
 *
 * La vue écarte des lignes AVANT que le TypeScript ne les voie. La seule chose
 * qu'on lui demande est donc de ne jamais écarter un contenu que
 * `deciderRequalif` aurait requalifié. C'est une propriété de la fonction pure,
 * donc vérifiable ici — et c'est la seule preuve qui vaille : le jour où
 * quelqu'un ajoutera une porte de sortie au-dessus des deux gardes, ce test
 * tombera, et pas la prod trois semaines plus tard.
 * ---------------------------------------------------------------------- */

Deno.test("vue 0253 — tout ce que deciderRequalif requalifie passe le filtre de la vue", () => {
  let requalifies = 0;
  for (const passagesPrevus of [0, 1, 2, 4, 8, 16]) {
    for (const publies of [0, 1, 2, 3, 4, 8, 16, 20]) {
      for (const moyenne of [null, 0, 12_000, 200_000]) {
        for (const introuvables of [0, 1, 4]) {
          for (const enAttenteMesure of [0, 1]) {
            for (const age of [0, 2 * JOUR_MS, 10 * JOUR_MS]) {
              for (const dernierPublieMs of [MAINTENANT - age, Number.NaN]) {
                const e = entree({
                  passagesPrevus,
                  publies,
                  moyenne,
                  introuvables,
                  enAttenteMesure,
                  mesures: moyenne === null ? 0 : publies,
                  dernierPublieMs,
                });
                if (!deciderRequalif(e).requalifier) continue;
                requalifies += 1;
                // Le filtre de la vue, mot pour mot.
                assertEquals(
                  e.passagesPrevus > 0 && e.publies >= e.passagesPrevus,
                  true,
                  `requalifié hors du filtre de la vue : prevus=${e.passagesPrevus} publies=${e.publies}`,
                );
              }
            }
          }
        }
      }
    }
  }
  // Sans ça, un filtre vide passerait le test par vacuité.
  assertNotEquals(requalifies, 0);
});

Deno.test("vue 0253 — le contenu limite (publies = passages_prevus) est dedans, pas un de moins", () => {
  // La frontière du filtre. `>=` et non `>` : un cycle qui vient de finir son
  // dernier passage est requalifiable au prochain minuit, pas au suivant.
  assertEquals(deciderRequalif(entree({ publies: 4, passagesPrevus: 4 })).requalifier, true);
  const avant = deciderRequalif(entree({ publies: 3, passagesPrevus: 4 }));
  assertEquals(avant.requalifier, false);
  assertEquals(avant.requalifier === false && avant.motif, "passages");
});

Deno.test("vue 0253 — un contenu en D (0 passage prévu) est exclu des deux côtés", () => {
  // 2319 des 2521 lignes lues pour rien : des cycles non terminés et des D
  // dormants, relus à chaque minuit pour être aussitôt écartés en TS.
  const d = deciderRequalif(entree({ passagesPrevus: 0, publies: 0 }));
  assertEquals(d.requalifier, false);
  assertEquals(d.requalifier === false && d.motif, "passages");
});

Deno.test("vue 0253 — les gardes recul et délai restent en TS, elles ne sont pas dans le filtre", () => {
  // Ces deux-là dépendent de `now()` ET des réglages Pilotage. Elles écartent
  // donc des lignes que la vue laisse passer : c'est voulu, et c'est la raison
  // pour laquelle elles ne descendent pas en SQL. Une vue qui trancherait à
  // leur place ferait diverger minuit de ce que la page Slideshows affiche.
  const recul = deciderRequalif(entree({ dernierPublieMs: MAINTENANT - 3600_000 }));
  assertEquals(recul.requalifier, false);
  assertEquals(recul.requalifier === false && recul.motif, "recul");

  const mesure = deciderRequalif(
    entree({ moyenne: null, mesures: 0, enAttenteMesure: 2, dernierPublieMs: MAINTENANT - 2 * JOUR_MS }),
  );
  assertEquals(mesure.requalifier, false);
  assertEquals(mesure.requalifier === false && mesure.motif, "mesure");

  // Les deux portes sans mesure, elles, sont bien dans le périmètre de la vue.
  const introuvable = deciderRequalif(entree({ moyenne: null, mesures: 0, introuvables: 4 }));
  assertEquals(introuvable.requalifier, true);
  assertEquals(introuvable.requalifier === true && introuvable.surMesure, false);
});

/* -------------------------------------------------------------------------
 * Contrôle de complétude.
 * ---------------------------------------------------------------------- */

Deno.test("cohérence — lecture complète : aucune alerte", () => {
  const c = verifierCoherenceLecture(202, 202);
  assertEquals(c.ok, true);
  assertEquals(c.alerte, null);
  assertEquals(c.lues, 202);
  assertEquals(c.attendues, 202);
});

Deno.test("cohérence — la panne du jour : 1000 lues sur 2521, et le message nomme max-rows", () => {
  const c = verifierCoherenceLecture(PLAFOND_LIGNES, 2521);
  assertEquals(c.ok, false);
  assertEquals(c.alerte?.includes("INCOMPLÈTE"), true);
  // Le diagnostic, pas seulement le constat : un nombre pile au plafond n'est
  // pas une volumétrie, c'est une coupure.
  assertEquals(c.alerte?.includes("max-rows"), true);
  assertEquals(c.alerte?.includes("1521"), true);
});

Deno.test("cohérence — un manque qui n'est pas un multiple du plafond ne s'invente pas de cause", () => {
  const c = verifierCoherenceLecture(198, 202);
  assertEquals(c.ok, false);
  assertEquals(c.alerte?.includes("max-rows"), false);
  assertEquals(c.alerte?.includes("4 cycle(s)"), true);
});

Deno.test("cohérence — plus de lignes que comptées : signalé, mais sans dramatiser", () => {
  // Un passage publié entre le comptage et la fin de la pagination fait entrer
  // un cycle de plus. Écart réel, gravité nulle.
  const c = verifierCoherenceLecture(205, 202);
  assertEquals(c.ok, false);
  assertEquals(c.alerte?.includes("Sans gravité"), true);
  assertEquals(c.alerte?.includes("INCOMPLÈTE"), false);
});

Deno.test("cohérence — comptage indisponible : on ne fait pas passer l'ignorance pour une garantie", () => {
  const c = verifierCoherenceLecture(202, null, "lecture ciblée d'un seul contenu, sans objet");
  // `ok` reste vrai : aucun écart n'est CONSTATÉ. Mais l'alerte dit qu'on n'a
  // rien vérifié — c'est exactement la nuance que la panne a exploitée.
  assertEquals(c.ok, true);
  assertNotEquals(c.alerte, null);
  assertEquals(c.alerte?.includes("non vérifiée"), true);
  assertEquals(c.attendues, null);
});

/* -------------------------------------------------------------------------
 * Forme du JSON de run, et sa survie au drain.
 * ---------------------------------------------------------------------- */

function resultat(p: Partial<RequalificationResultat> = {}): RequalificationResultat {
  return {
    examines: 202,
    requalifies: 143,
    enAttente: 59,
    sansMesure: 12,
    remixDebloques: 3,
    details: [],
    attentesMesure: [],
    coherence: verifierCoherenceLecture(202, 202),
    ...p,
  };
}

Deno.test("run tierlist — le bloc JSON porte les quatre compteurs et le témoin de complétude", () => {
  const bloc = blocRunTierlist(resultat(), new Date(MAINTENANT));
  assertEquals(bloc.examines, 202);
  assertEquals(bloc.requalifies, 143);
  assertEquals(bloc.enAttente, 59);
  assertEquals(bloc.sansMesure, 12);
  assertEquals(bloc.attendues, 202);
  assertEquals(bloc.complet, true);
  assertEquals(bloc.alerte, null);
  assertEquals(bloc.at, new Date(MAINTENANT).toISOString());
});

Deno.test("run tierlist — une lecture tronquée est écrite dans le JSON, pas avalée", () => {
  const bloc = blocRunTierlist(
    resultat({ examines: PLAFOND_LIGNES, coherence: verifierCoherenceLecture(PLAFOND_LIGNES, 2521) }),
    new Date(MAINTENANT),
  );
  assertEquals(bloc.complet, false);
  assertEquals(bloc.attendues, 2521);
  assertEquals(bloc.alerte?.includes("max-rows"), true);
});

Deno.test("run tierlist — le bloc survit au merge cumulatif du drain d'assignation", () => {
  // Reproduction du littéral de `fusionnerDernierRun` : il reconstruit la
  // valeur de zéro à CHAQUE lot. Sans le report, le premier lot déclenché par
  // le kick de minuit effacerait le bloc quelques secondes après son écriture.
  const ancien = {
    jour: "2026-09-21",
    crees: 12,
    quotasBaisses: [],
    tierlist: blocRunTierlist(resultat(), new Date(MAINTENANT)),
  };
  const memeJour = ancien.jour === "2026-09-21";
  const valeur = {
    jour: "2026-09-21",
    at: new Date(MAINTENANT).toISOString(),
    avertissement: null,
    quotasBaisses: [],
    crees: 20,
    ...reporterBlocTierlist(ancien, memeJour),
  };
  assertEquals((valeur as { tierlist?: { requalifies: number } }).tierlist?.requalifies, 143);
});

Deno.test("run tierlist — le bloc de la veille n'est pas reporté sur le run du jour", () => {
  const veille = {
    jour: "2026-09-20",
    tierlist: blocRunTierlist(resultat(), new Date(MAINTENANT)),
  };
  // Un compteur de la veille affiché comme celui du jour mentirait plus qu'il
  // n'informerait — c'est la classe de panne qu'on répare, pas un remède.
  assertEquals(reporterBlocTierlist(veille, veille.jour === "2026-09-21"), {});
});

Deno.test("run tierlist — un ancien JSON sans bloc tierlist ne casse pas le report", () => {
  assertEquals(reporterBlocTierlist({ jour: "2026-09-21", crees: 3 }, true), {});
  assertEquals(reporterBlocTierlist(null, true), {});
  assertEquals(reporterBlocTierlist("pas un objet", true), {});
});
