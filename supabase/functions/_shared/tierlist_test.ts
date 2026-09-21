import { assert, assertEquals, assertNotEquals, assertRejects } from "jsr:@std/assert@1";

import { IN_MAX_VALEURS, PLAFOND_LIGNES, TAILLE_PAGE } from "./lots.ts";
import { surveillerBuilder } from "./supabase.ts";
import {
  blocRunTierlist,
  deciderRequalif,
  estCycleTermine,
  jourSuivant,
  programmerRappels,
  reporterBlocTierlist,
  requalifierContenus,
  verifierCoherenceLecture,
  type DecisionRequalifEntree,
  type RequalificationResultat,
  type Supabase,
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
    // Ajouté avec le repli sur `contenu_tier_etat` : un run nominal tourne avec
    // la vue 0253, donc `false`. Le champ est obligatoire pour que personne ne
    // puisse construire un résultat qui tait son mode de lecture.
    repli: false,
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
  // Le JSON de run dit aussi AVEC QUELLE SOURCE il a été écrit : un repli qui
  // ne se voit pas dans la trace persistée s'installe pour de bon.
  assertEquals(bloc.repli, false);
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

/* =========================================================================
 * CÂBLAGE — les fonctions qui parlent à la base.
 *
 * Les tests ci-dessus portent sur des fonctions pures : ils prouvent la
 * DÉCISION, jamais la LECTURE. Une revue a montré ce que ça laisse passer —
 * changer la table lue, supprimer le comptage de cohérence ou inverser un
 * filtre gardait tout au vert. C'est précisément la classe de panne qu'on
 * répare : une lecture fausse qui n'a aucune signature.
 *
 * Le faux client ci-dessous n'est donc pas un bouchon poli. Il reproduit les
 * deux comportements qui ont coûté cher :
 *   - `max-rows` s'applique PAR-DESSUS le `limit` demandé, et la réponse reste
 *     un 200 sans `error` ;
 *   - une relation absente répond 42P01, comme Postgres, sans cas particulier.
 * Et il est enveloppé dans `surveillerBuilder`, le garde-fou de production :
 * un `in(...)` trop long ou une réponse pile au plafond lèvent ici exactement
 * comme en prod.
 * ====================================================================== */

type Ligne = Record<string, unknown>;

interface Filtre {
  op: "eq" | "gt" | "gte" | "lt" | "in";
  colonne: string;
  valeur: unknown;
}

/** Ce qu'une requête a demandé — pour prouver la forme de la lecture, pas seulement son résultat. */
interface Requete {
  table: string;
  colonnes: string;
  head: boolean;
  single: boolean;
  limite: number | null;
  ordre: string | null;
  filtres: Filtre[];
}

interface ErreurSimulee {
  code?: string;
  message: string;
}

/** Comparaison unique pour nombres et textes : le cast ne sert qu'au compilateur. */
function cmp(a: unknown, b: unknown): number {
  const x = a as string;
  const y = b as string;
  return x < y ? -1 : x > y ? 1 : 0;
}

function applique(f: Filtre, ligne: Ligne): boolean {
  // `posts.est_test` vise une table EMBARQUÉE : PostgREST l'évalue dans un autre
  // plan, il ne filtre pas la ligne du haut. Le faux serveur fait pareil.
  if (f.colonne.includes(".")) return true;
  const v = ligne[f.colonne];
  switch (f.op) {
    case "eq":
      return v === f.valeur;
    case "gt":
      return cmp(v, f.valeur) > 0;
    case "gte":
      return cmp(v, f.valeur) >= 0;
    case "lt":
      return cmp(v, f.valeur) < 0;
    case "in":
      return Array.isArray(f.valeur) && f.valeur.includes(v);
  }
}

/**
 * Faux PostgREST, enveloppé des garde-fous de production.
 *
 * `panne` permet de casser une lecture précise (la vue absente, le réseau, la
 * table des titres) sans toucher au reste : c'est ce qui rend testable la
 * différence entre « je me replie » et « je lève ».
 */
function fauxClient(
  base: Record<string, Ligne[]>,
  traces: Requete[],
  panne?: (r: Requete) => ErreurSimulee | null,
): Supabase {
  const from = (table: string) => {
    const r: Requete = {
      table,
      colonnes: "",
      head: false,
      single: false,
      limite: null,
      ordre: null,
      filtres: [],
    };

    const maillon = {
      select(colonnes: string, opts?: { count?: string; head?: boolean }) {
        r.colonnes = colonnes;
        r.head = Boolean(opts?.head);
        return maillon;
      },
      eq(colonne: string, valeur: unknown) {
        r.filtres.push({ op: "eq", colonne, valeur });
        return maillon;
      },
      gt(colonne: string, valeur: unknown) {
        r.filtres.push({ op: "gt", colonne, valeur });
        return maillon;
      },
      gte(colonne: string, valeur: unknown) {
        r.filtres.push({ op: "gte", colonne, valeur });
        return maillon;
      },
      lt(colonne: string, valeur: unknown) {
        r.filtres.push({ op: "lt", colonne, valeur });
        return maillon;
      },
      in(colonne: string, valeurs: unknown[]) {
        r.filtres.push({ op: "in", colonne, valeur: valeurs });
        return maillon;
      },
      order(colonne: string, _opts?: unknown) {
        r.ordre = colonne;
        return maillon;
      },
      limit(n: number) {
        r.limite = n;
        return maillon;
      },
      maybeSingle() {
        r.single = true;
        return maillon;
      },
      then(
        onfulfilled?: (v: unknown) => unknown,
        onrejected?: (e: unknown) => unknown,
      ) {
        traces.push({ ...r, filtres: [...r.filtres] });
        void onrejected;

        const simulee = panne?.(r) ?? null;
        if (simulee) {
          return Promise.resolve(onfulfilled?.({ data: null, count: null, error: simulee }));
        }

        const lignes = base[r.table];
        if (!lignes) {
          // Une relation absente, dite comme Postgres la dit.
          return Promise.resolve(
            onfulfilled?.({
              data: null,
              count: null,
              error: {
                code: "42P01",
                message: `relation "public.${r.table}" does not exist`,
              },
            }),
          );
        }

        let out = lignes.filter((l) => r.filtres.every((f) => applique(f, l)));
        if (r.ordre) out = [...out].sort((a, b) => cmp(a[r.ordre!], b[r.ordre!]));
        if (r.head) return Promise.resolve(onfulfilled?.({ data: null, count: out.length, error: null }));
        if (r.single) {
          return Promise.resolve(onfulfilled?.({ data: out[0] ?? null, count: null, error: null }));
        }
        // `max-rows` PAR-DESSUS le `limit` demandé : toute la panne tient là.
        const coupe = Math.min(r.limite ?? PLAFOND_LIGNES, PLAFOND_LIGNES);
        return Promise.resolve(
          onfulfilled?.({ data: out.slice(0, coupe), count: null, error: null }),
        );
      },
    };

    // Les garde-fous réels : taille des `in(...)` à l'aller, complétude au retour.
    return surveillerBuilder(maillon, { table });
  };

  return { from } as unknown as Supabase;
}

/** Ids triables dans l'ordre de leur numéro (le faux serveur trie en texte). */
function idContenu(n: number): string {
  return `c${String(n).padStart(5, "0")}`;
}

function idPassage(n: number): string {
  return `p${String(n).padStart(5, "0")}`;
}

const IL_Y_A_5_JOURS = new Date(MAINTENANT - 5 * JOUR_MS).toISOString();

/** Cycle terminé, mesuré, requalifiable — le cas nominal, en ligne de base. */
function ligneEtat(n: number, p: Partial<Ligne> = {}): Ligne {
  return {
    contenu_id: idContenu(n),
    tier: "A",
    passages_prevus: 4,
    tier_cycle: 1,
    publies: 4,
    en_vol: 0,
    restants: 0,
    moyenne_vues: 12_000,
    max_vues: 20_000,
    nb_150k: 0,
    mesures: 4,
    introuvables: 0,
    en_attente_mesure: 0,
    dernier_publie_at: new Date(Date.now() - 5 * JOUR_MS).toISOString(),
    ...p,
  };
}

/**
 * La base du faux serveur, vue 0253 COMPRISE.
 *
 * La vue est dérivée de `contenu_tier_etat` par le filtre de la migration,
 * écrit ici mot pour mot : si quelqu'un fait lire la table brute au lieu de la
 * vue, les compteurs changent, et les tests le voient.
 */
function baseAvecVue(etats: Ligne[], reste: Record<string, Ligne[]> = {}) {
  return {
    reglages: [{ cle: "tierlist", valeur: {} }],
    contenus: [],
    contenu_tier_etat: etats,
    contenu_a_requalifier: etats.filter((e) =>
      (e.passages_prevus as number) > 0 && (e.publies as number) >= (e.passages_prevus as number)
    ),
    ...reste,
  };
}

/** La même base AVANT la migration 0253 : la vue n'existe pas, PostgREST répond 42P01. */
function baseSansVue(etats: Ligne[], reste: Record<string, Ligne[]> = {}) {
  const base = baseAvecVue(etats, reste) as Record<string, Ligne[]>;
  delete base.contenu_a_requalifier;
  return base;
}

/** Trois cycles terminés, deux cycles en cours, un contenu en D : 6 lignes, 3 à examiner. */
function sixEtatsDontTroisTermines(): Ligne[] {
  return [
    ligneEtat(1),
    ligneEtat(2),
    ligneEtat(3),
    ligneEtat(4, { publies: 2 }), // cycle en cours
    ligneEtat(5, { publies: 0 }), // cycle en cours
    ligneEtat(6, { passages_prevus: 0, publies: 0 }), // D dormant
  ];
}

const lectures = (traces: Requete[], table: string) =>
  traces.filter((t) => t.table === table && !t.head);

Deno.test("câblage — le filtre du repli est celui de la vue, mot pour mot", () => {
  // `estCycleTermine` refait en TS ce que la vue fait en SQL quand elle manque.
  // Les deux écritures doivent rester la même : c'est ce test qui l'impose.
  for (const passages_prevus of [0, 1, 4, 8]) {
    for (const publies of [0, 1, 3, 4, 9]) {
      assertEquals(
        estCycleTermine({ passages_prevus, publies }),
        passages_prevus > 0 && publies >= passages_prevus,
        `prevus=${passages_prevus} publies=${publies}`,
      );
    }
  }
});

Deno.test("câblage — requalifierContenus lit la vue 0253, et pas la table brute", async () => {
  const traces: Requete[] = [];
  const supabase = fauxClient(baseAvecVue(sixEtatsDontTroisTermines()), traces);

  const res = await requalifierContenus(supabase, { dryRun: true });

  // 3 cycles terminés sur 6 lignes : lire `contenu_tier_etat` en rendrait 6 (ou
  // 5 avec le `.gt("passages_prevus", 0)` d'avant) et ce chiffre bougerait.
  assertEquals(res.examines, 3);
  assertEquals(res.requalifies, 3);
  assertEquals(res.repli, false);
  assert(lectures(traces, "contenu_a_requalifier").length > 0, "la vue n'a pas été lue");
  assertEquals(lectures(traces, "contenu_tier_etat").length, 0);
});

Deno.test("câblage — le comptage de cohérence est pris, et AVANT la lecture", async () => {
  const traces: Requete[] = [];
  const supabase = fauxClient(baseAvecVue(sixEtatsDontTroisTermines()), traces);

  const res = await requalifierContenus(supabase, { dryRun: true });

  // Supprimer le comptage rendrait `attendues` nul : le run continuerait, mais
  // sans témoin — exactement l'angle mort qui a laissé tourner la troncature.
  assertEquals(res.coherence.attendues, 3);
  assertEquals(res.coherence.ok, true);
  assertEquals(res.coherence.alerte, null);

  const comptage = traces.findIndex((t) => t.table === "contenu_a_requalifier" && t.head);
  const premierePage = traces.findIndex((t) => t.table === "contenu_a_requalifier" && !t.head);
  assert(comptage >= 0, "aucun count(*) sur la vue");
  // Après la lecture, les requalifications auraient fait SORTIR de la vue les
  // contenus relancés : le comptage mesurerait un autre ensemble.
  assert(comptage < premierePage, "le comptage doit précéder la lecture");
});

Deno.test("câblage — 1500 cycles terminés sont TOUS examinés (l'ancienne lecture s'arrêtait à 1000)", async () => {
  const etats = Array.from({ length: 1500 }, (_, i) => ligneEtat(i + 1));
  const traces: Requete[] = [];
  const supabase = fauxClient(baseAvecVue(etats), traces);

  const res = await requalifierContenus(supabase, { dryRun: true });

  assertEquals(res.examines, 1500);
  assertEquals(res.requalifies, 1500);
  assertEquals(res.coherence.ok, true);
  // Deux pages : 999 puis 501. La garantie a changé de nature, pas d'exigence —
  // la page est demandée STRICTEMENT sous `max-rows`, donc le serveur n'a rien à
  // rogner, donc une page courte ne peut venir que d'une table épuisée. Tant que
  // la taille de page valait le plafond, une page courte restait ambiguë et il
  // fallait une page vide pour conclure : c'est ce troisième aller-retour, payé
  // sur chaque lecture, que la sortie sur page courte supprime.
  const pages = lectures(traces, "contenu_a_requalifier");
  assertEquals(pages.length, 2);
  assertEquals(pages[0].limite, TAILLE_PAGE);
  assert(pages[1].filtres.some((f) => f.op === "gt" && f.colonne === "contenu_id"));
  // 1500 titres à lire : sans découpage, `verifierTailleIn` lèverait à 400.
  const titres = lectures(traces, "contenus");
  assertEquals(titres.length, 15);
  for (const t of titres) {
    const ids = t.filtres.find((f) => f.op === "in")?.valeur as string[];
    assert(ids.length <= IN_MAX_VALEURS, `lot de ${ids.length} ids`);
  }
});

Deno.test("câblage — vue 0253 absente (42P01) : repli tracé sur contenu_tier_etat, le run continue", async () => {
  const traces: Requete[] = [];
  // La migration s'applique À LA MAIN et le workflow d'Edge Functions ne touche
  // pas à la base : le code peut donc tourner avant la vue. Sans repli, la
  // requalification lève, minuit répond 500, et l'assignation — qui vient
  // après — n'est jamais lancée : 131 comptes à 0 post le lendemain.
  const supabase = fauxClient(baseSansVue(sixEtatsDontTroisTermines()), traces);

  const res = await requalifierContenus(supabase, { dryRun: true });

  assertEquals(res.repli, true);
  // Même population qu'en mode nominal : le filtre de la vue est refait en TS.
  assertEquals(res.examines, 3);
  assertEquals(res.requalifies, 3);
  // Mode dégradé DIT : ni comptage possible, ni silence.
  assertEquals(res.coherence.attendues, null);
  assertEquals(res.coherence.alerte?.includes("repli"), true);
  assertEquals(blocRunTierlist(res).repli, true);

  const repli = lectures(traces, "contenu_tier_etat");
  assert(repli.length > 0, "le repli n'a pas lu contenu_tier_etat");
  // Le repli est la lecture d'avant, PAGINÉE : c'est elle qui butait sur max-rows.
  assertEquals(repli[0].limite, TAILLE_PAGE);
  assert(repli[0].filtres.some((f) =>
    f.op === "gt" && f.colonne === "passages_prevus" && f.valeur === 0
  ));
});

Deno.test("câblage — une panne réseau ne déclenche PAS le repli : elle lève", async () => {
  const traces: Requete[] = [];
  const supabase = fauxClient(
    baseAvecVue(sixEtatsDontTroisTermines()),
    traces,
    (r) =>
      r.table === "contenu_a_requalifier" && !r.head
        ? { code: "08006", message: "error sending request: connection reset by peer" }
        : null,
  );

  // Se replier sur un incident réseau reviendrait à masquer une vraie panne
  // derrière un mode dégradé silencieux.
  await assertRejects(() => requalifierContenus(supabase, { dryRun: true }));
  assertEquals(lectures(traces, "contenu_tier_etat").length, 0);
});

Deno.test("câblage — le clic admin lit la source complète, pas la vue", async () => {
  const traces: Requete[] = [];
  // Un cycle NON terminé : absent de la vue par construction. Lu là, l'admin
  // lirait « 0 examiné » — un contenu devenu introuvable d'un clic.
  const supabase = fauxClient(baseAvecVue([ligneEtat(1, { publies: 2 })]), traces);

  const res = await requalifierContenus(supabase, {
    dryRun: true,
    contenuId: idContenu(1),
  });

  assertEquals(res.examines, 1);
  assertEquals(res.enAttente, 1);
  assertEquals(res.repli, false);
  assertEquals(lectures(traces, "contenu_a_requalifier").length, 0);
  assertEquals(lectures(traces, "contenu_tier_etat").length, 1);
});

Deno.test("câblage — des titres illisibles ne coûtent pas les 3 requalifications", async () => {
  const traces: Requete[] = [];
  const supabase = fauxClient(
    baseAvecVue(sixEtatsDontTroisTermines()),
    traces,
    (r) => r.table === "contenus" ? { message: "timeout" } : null,
  );

  // Seule lecture non fatale du fichier : elle n'alimente AUCUNE décision, elle
  // remplit une colonne d'affichage.
  const res = await requalifierContenus(supabase, { dryRun: true });
  assertEquals(res.requalifies, 3);
  assertEquals(res.details.length, 3);
  assertEquals(res.details[0].titre, "");
});

Deno.test("câblage — comptage indisponible : la lecture se fait quand même, l'ignorance est déclarée", async () => {
  const traces: Requete[] = [];
  const supabase = fauxClient(
    baseAvecVue(sixEtatsDontTroisTermines()),
    traces,
    (r) => r.head ? { message: "statement timeout" } : null,
  );

  const res = await requalifierContenus(supabase, { dryRun: true });
  assertEquals(res.examines, 3);
  assertEquals(res.coherence.attendues, null);
  assertEquals(res.coherence.ok, true);
  assertEquals(res.coherence.alerte?.includes("non vérifiée"), true);
});

/* -------------------------------------------------------------------------
 * Rappels J+7 — la fenêtre de 30 jours porte ~7650 passages.
 * ---------------------------------------------------------------------- */

function lignePassage(n: number, p: Partial<Ligne> = {}): Ligne {
  return {
    id: idPassage(n),
    contenu_id: idContenu(n),
    compte_id: `compte-${n}`,
    langue: "fr",
    vues: 80_000,
    statut: "publie",
    publie_at: IL_Y_A_5_JOURS,
    date_publication_prevue: IL_Y_A_5_JOURS.slice(0, 10),
    slides: [],
    musique_url: null,
    musique_titre: null,
    musique_plateforme: null,
    hashtags: null,
    rappel_rang: 0,
    rappel_source_id: null,
    tier_cycle: 1,
    ...p,
  };
}

const jamais = () => {
  throw new Error("aucun rappel ne doit être créé en dry run");
};

Deno.test("rappels J+7 — 1200 percées : toutes lues, et le in(...) découpé", async () => {
  const passages = Array.from({ length: 1200 }, (_, i) => lignePassage(i + 1));
  const comptes = passages.map((p) => ({ id: p.compte_id, posts_par_jour: 3 }));
  const traces: Requete[] = [];
  const supabase = fauxClient({ reglages: [{ cle: "tierlist", valeur: {} }], passages, comptes }, traces);

  const res = await programmerRappels(supabase, jamais, { dryRun: true });

  // Sans pagination la lecture rendrait 1000 lignes en 200 (garde-fou de
  // complétude : elle lève) ; sans découpage, les 1200 ids du `in(...)` des
  // sources déjà rappelées feraient lever `verifierTailleIn`. Les deux fautes
  // atterrissent dans `erreurs`, pas dans une exception : on les lit ici.
  assertEquals(res.erreurs, []);
  assertEquals(res.candidats, 1200);
  assertEquals(res.programmes, 1200);

  for (const t of traces) {
    for (const f of t.filtres) {
      if (f.op !== "in") continue;
      assert((f.valeur as unknown[]).length <= IN_MAX_VALEURS, `in de ${(f.valeur as unknown[]).length} valeurs`);
    }
  }
  const pages = traces.filter((t) =>
    t.table === "passages" && t.filtres.some((f) => f.colonne === "statut")
  );
  assert(pages.length >= 2, "la lecture des percées n'est pas paginée");
  assertEquals(pages[0].limite, TAILLE_PAGE);
});

Deno.test("rappels J+7 — le planning à venir est lu en entier : 1100 jours occupés, pas 1000", async () => {
  // Un seul compte, quota 1, et 1100 jours d'affilée déjà pris. Le rappel doit
  // atterrir au 1101e jour. Une lecture tronquée à `max-rows` en verrait 1000 et
  // poserait le rappel sur un jour PLEIN : c'est le dépassement de quota que
  // `etalerRappels` existe pour empêcher.
  const premierJour = new Date(Date.now() + JOUR_MS).toISOString().slice(0, 10);
  let jour = premierJour;
  const futurs: Ligne[] = [];
  for (let i = 0; i < 1100; i += 1) {
    futurs.push(lignePassage(10_000 + i, {
      compte_id: "compte-1",
      statut: "assigne",
      vues: 0,
      publie_at: null,
      date_publication_prevue: jour,
    }));
    jour = jourSuivant(jour);
  }
  const attendu = jour; // le 1101e jour, le premier libre

  const perce = lignePassage(1, { compte_id: "compte-1" });
  const traces: Requete[] = [];
  const supabase = fauxClient({
    reglages: [{ cle: "tierlist", valeur: {} }],
    passages: [perce, ...futurs],
    comptes: [{ id: "compte-1", posts_par_jour: 1 }],
  }, traces);

  const res = await programmerRappels(supabase, jamais, { dryRun: true });

  assertEquals(res.erreurs, []);
  assertEquals(res.programmes, 1);
  assertEquals(res.details[0].jour, attendu);
});

Deno.test("rappels J+7 — une lecture ratée arrête les rappels SANS faire tomber le run", async () => {
  const traces: Requete[] = [];
  const supabase = fauxClient(
    {
      reglages: [{ cle: "tierlist", valeur: {} }],
      passages: [lignePassage(1)],
      comptes: [{ id: "compte-1", posts_par_jour: 3 }],
    },
    traces,
    (r) => r.table === "comptes" ? { message: "statement timeout" } : null,
  );

  // Fail-closed : zéro rappel posé, l'échec écrit, et surtout AUCUNE exception —
  // l'étape assignation vient après la tierlist sous le même try/catch, un jet
  // ici priverait la flotte de ses posts pour un bonus J+7 non calculé.
  const res = await programmerRappels(supabase, jamais, { dryRun: true });
  assertEquals(res.programmes, 0);
  assertEquals(res.erreurs.length, 1);
  assertEquals(res.erreurs[0].includes("aucun rappel programmé"), true);
});
