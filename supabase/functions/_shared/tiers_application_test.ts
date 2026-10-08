/**
 * Tierlist PAR APPLICATION (0270) — sonde, requalification hors Sophia.
 *
 * Ce que ces tests épinglent :
 * - le tier d'entrée d'une application vient de SA note, aux seuils de
 *   `tierImport` (miroir de la fonction SQL `tier_initial_note`) ;
 * - la sonde ne prend JAMAIS une panne pour une absence, et sans 0270 rien
 *   d'autre n'est lu ;
 * - la requalification d'une application ne lit que SES vues (filtrées sur
 *   `application_id`), n'écrit que SA table, jamais `contenus` ni
 *   `remix_debloques` — le tier Sophia n'est pas touché ;
 * - mêmes règles que Sophia (barème, relance sans mesure, S+), plus les
 *   gardes de concurrence et l'échéance de la nuit.
 */

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";

import { oublierSondeMultiApp } from "./applications_moteur.ts";
import { PLAFOND_LIGNES } from "./lots.ts";
import { ID_SOPHIA } from "./multi_app.ts";
import { tierImport, tierInitialDepuisNote } from "./tierlist.ts";
import {
  blocRunTierlistApplications,
  oublierSondeTiersApplication,
  requalifierApplications,
  sonderSchemaTiersApplication,
  TABLE_TIERS_APPLICATION,
  VUE_REQUALIF_APPLICATION,
  VUE_TIER_APPLICATION,
} from "./tiers_application.ts";

const UNSWIPE = "00000000-0000-4000-8000-000000000003";
const FOO = "00000000-0000-4000-8000-000000000009";
const JOUR_MS = 86_400_000;

/** Ce que rend PostgREST quand la base ne répond plus (mesuré : 503). */
const PANNE_BASE = {
  code: "PGRST002",
  message: "Could not query the database for the schema cache. Retrying.",
};

interface Op {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  colonnes: string | null;
  head: boolean;
  filtres: Array<[string, string, unknown]>;
  ordres: Array<{ colonne: string; asc: boolean }>;
  limite: number | null;
  valeurs: unknown;
  ignoreDuplicates: boolean;
}

type Reponse = { error: { code?: string; message?: string } | null; status: number };
type Ligne = Record<string, unknown>;
type Client = Parameters<typeof sonderSchemaTiersApplication>[0];

/**
 * Faux PostgREST à état (même esprit que celui d'`assignation_contenu_test`) :
 * tables en mémoire, journal de toutes les requêtes, relations « absentes »
 * (réponse fixe) ou « en panne » (503 PGRST002), et `echecSi` pour faire
 * échouer des requêtes précises.
 */
function fauxPostgrest(
  tables: Record<string, Ligne[]>,
  opts: {
    absentes?: Record<string, Reponse>;
    pannes?: Record<string, number>;
    echecSi?: (o: Op) => string | null;
    /** `count` forcé d'une relation (pour fabriquer un écart de complétude). */
    comptes?: Record<string, number>;
  } = {},
) {
  const journal: Op[] = [];
  const pannes = { ...(opts.pannes ?? {}) };
  const from = (table: string) => {
    const op: Op = {
      table,
      op: "select",
      colonnes: null,
      head: false,
      filtres: [],
      ordres: [],
      limite: null,
      valeurs: null,
      ignoreDuplicates: false,
    };
    let mode: "liste" | "maybe" | "single" = "liste";
    let conflit: string[] = [];
    const lignes = (): Ligne[] => (tables[table] ??= []);
    const compare = (a: unknown, b: unknown) =>
      typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    const filtrer = () =>
      lignes().filter((l) =>
        op.filtres.every(([c, o, v]) => {
          const x = l[c];
          if (o === "eq") return x === v;
          if (o === "in") return (v as unknown[]).includes(x);
          if (o === "gt") return x !== undefined && x !== null && compare(x, v) > 0;
          return true;
        })
      );
    const executer = () => {
      journal.push({ ...op, filtres: [...op.filtres], ordres: [...op.ordres] });
      const absente = opts.absentes?.[table];
      if (absente) return { data: null, count: null, ...absente };
      if ((pannes[table] ?? 0) > 0) {
        pannes[table] -= 1;
        return { data: null, count: null, error: { ...PANNE_BASE }, status: 503 };
      }
      const echec = opts.echecSi?.(op) ?? null;
      if (echec) return { data: null, count: null, error: { message: echec }, status: 500 };
      let data: Ligne[] = [];
      if (op.op === "select") {
        data = filtrer();
        if (op.ordres.length > 0) {
          data = [...data].sort((a, b) => {
            for (const o of op.ordres) {
              const d = compare(a[o.colonne], b[o.colonne]);
              if (d !== 0) return o.asc ? d : -d;
            }
            return 0;
          });
        }
        if (op.head) {
          return { data: null, count: opts.comptes?.[table] ?? data.length, error: null, status: 200 };
        }
        data = data.slice(0, Math.min(op.limite ?? PLAFOND_LIGNES, PLAFOND_LIGNES));
      } else if (op.op === "update") {
        data = filtrer();
        for (const l of data) Object.assign(l, op.valeurs);
      } else if (op.op === "upsert") {
        const valeurs = (Array.isArray(op.valeurs) ? op.valeurs : [op.valeurs]) as Array<
          Record<string, unknown>
        >;
        for (const v of valeurs) {
          const i = lignes().findIndex((l) => conflit.every((c) => l[c] === v[c]));
          if (i >= 0) {
            if (!op.ignoreDuplicates) lignes()[i] = { ...lignes()[i], ...v };
          } else lignes().push({ ...v });
        }
        data = valeurs;
      } else if (op.op === "insert") {
        const valeurs = (Array.isArray(op.valeurs) ? op.valeurs : [op.valeurs]) as Ligne[];
        lignes().push(...valeurs);
        data = valeurs;
      } else if (op.op === "delete") {
        data = filtrer();
        tables[table] = lignes().filter((l) => !data.includes(l));
      }
      if (mode === "maybe") return { data: data[0] ?? null, error: null, status: 200 };
      if (mode === "single") {
        return data.length === 1
          ? { data: data[0], error: null, status: 200 }
          : { data: null, error: { message: `single : ${data.length}` }, status: 406 };
      }
      return { data, error: null, status: 200 };
    };
    const maillon = {
      select: (colonnes?: string, o?: { head?: boolean }) => {
        if (op.op === "select") {
          op.colonnes = colonnes ?? "*";
          op.head = Boolean(o?.head);
        }
        return maillon;
      },
      insert: (v: unknown) => ((op.op = "insert"), (op.valeurs = v), maillon),
      update: (v: unknown) => ((op.op = "update"), (op.valeurs = v), maillon),
      delete: () => ((op.op = "delete"), maillon),
      upsert: (v: unknown, o?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        op.op = "upsert";
        op.valeurs = v;
        conflit = (o?.onConflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
        op.ignoreDuplicates = Boolean(o?.ignoreDuplicates);
        return maillon;
      },
      eq: (c: string, v: unknown) => (op.filtres.push([c, "eq", v]), maillon),
      in: (c: string, v: unknown[]) => (op.filtres.push([c, "in", v]), maillon),
      gt: (c: string, v: unknown) => (op.filtres.push([c, "gt", v]), maillon),
      order: (colonne: string, o?: { ascending?: boolean }) => {
        op.ordres.push({ colonne, asc: o?.ascending !== false });
        return maillon;
      },
      limit: (n: number) => ((op.limite = n), maillon),
      maybeSingle: () => ((mode = "maybe"), maillon),
      single: () => ((mode = "single"), maillon),
      then: (ok?: (v: unknown) => unknown, ko?: (r: unknown) => unknown) =>
        Promise.resolve(executer()).then(ok, ko),
    };
    return maillon;
  };
  return { client: { from } as unknown as Client, journal, tables };
}

function oublierSondes() {
  oublierSondeMultiApp();
  oublierSondeTiersApplication();
}

/* -------------------------------------------------------------------------
 * Tier d'entrée depuis la note de l'application
 * ---------------------------------------------------------------------- */

Deno.test("tierInitialDepuisNote : mêmes paliers que tierImport (grille 0 → 100 au pas de 0,5)", () => {
  for (let n = 0; n <= 100; n += 0.5) {
    assertEquals(tierInitialDepuisNote(n), tierImport(n, 0), `note ${n}`);
  }
  assertEquals(tierInitialDepuisNote(70), "A");
  assertEquals(tierInitialDepuisNote(69.99), "B");
  assertEquals(tierInitialDepuisNote(60), "B");
  assertEquals(tierInitialDepuisNote(59.99), "C");
});

Deno.test("tierInitialDepuisNote : note absente (ligne forcée) ou non finie → C", () => {
  assertEquals(tierInitialDepuisNote(null), "C");
  assertEquals(tierInitialDepuisNote(undefined), "C");
  assertEquals(tierInitialDepuisNote(Number.NaN), "C");
  assertEquals(tierInitialDepuisNote(Number.POSITIVE_INFINITY), "C");
});

/* -------------------------------------------------------------------------
 * Sonde 0270
 * ---------------------------------------------------------------------- */

const ABSENT_42P01: Reponse = {
  error: { code: "42P01", message: 'relation "public.contenu_tiers_application" does not exist' },
  status: 404,
};
const ABSENT_PGRST205: Reponse = {
  error: {
    code: "PGRST205",
    message: "Could not find the table 'public.contenu_application_tier_etat' in the schema cache",
  },
  status: 404,
};

Deno.test("sonde 0270 — prête : table puis vue, en GET borné, et mémorisée", async () => {
  oublierSondes();
  const { client, journal } = fauxPostgrest({});
  assertEquals(await sonderSchemaTiersApplication(client), "pret");
  assertEquals(journal.map((o) => o.table), [TABLE_TIERS_APPLICATION, VUE_TIER_APPLICATION]);
  for (const o of journal) {
    assertEquals(o.head, false, "jamais HEAD");
    assertEquals(o.limite, 1);
  }
  assertEquals(await sonderSchemaTiersApplication(client), "pret");
  assertEquals(journal.length, 2, "« prête » n'est pas resondée");
  oublierSondes();
});

Deno.test("sonde 0270 — absente : 42P01, PGRST205, 404 nu, et table sans vue (A sans B)", async () => {
  const cas: Array<[string, Record<string, Reponse>]> = [
    ["42P01 sur la table", { [TABLE_TIERS_APPLICATION]: ABSENT_42P01 }],
    ["PGRST205 sur la table", { [TABLE_TIERS_APPLICATION]: ABSENT_PGRST205 }],
    ["404 sans corps", { [TABLE_TIERS_APPLICATION]: { error: null, status: 404 } }],
    ["partie A seule : la vue manque", { [VUE_TIER_APPLICATION]: ABSENT_PGRST205 }],
  ];
  for (const [nom, absentes] of cas) {
    oublierSondes();
    const { client } = fauxPostgrest({}, { absentes });
    assertEquals(await sonderSchemaTiersApplication(client), "absent", nom);
  }
  oublierSondes();
});

Deno.test("sonde 0270 — panne (503 PGRST002) : « illisible », jamais « absente », jamais mémorisée", async () => {
  oublierSondes();
  const { client, journal } = fauxPostgrest({}, { pannes: { [TABLE_TIERS_APPLICATION]: 2 } });
  assertEquals(await sonderSchemaTiersApplication(client), "illisible");
  assertEquals(journal.length, 2, "deux essais, chacun arrêté à la table");
  // La base revient : le run suivant resonde et voit « prête ».
  assertEquals(await sonderSchemaTiersApplication(client), "pret");
  oublierSondes();
});

/* -------------------------------------------------------------------------
 * Requalification par application
 * ---------------------------------------------------------------------- */

const APPS = [
  { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", langues: null, actif: true, created_at: "1" },
  { id: UNSWIPE, slug: "unswipe", nom: "Unswipe", langues: [], actif: false, created_at: "2" },
];

/** Ligne de la vue de requalification : cycle terminé, mesuré, assez vieux. */
function cycleTermine(contenuId: string, sur: Record<string, unknown> = {}) {
  return {
    contenu_id: contenuId,
    application_id: UNSWIPE,
    tier: "B",
    passages_prevus: 2,
    tier_cycle: 0,
    publies: 2,
    en_vol: 0,
    restants: 0,
    moyenne_vues: 12_000,
    max_vues: 15_000,
    nb_150k: 0,
    dernier_publie_at: new Date(Date.now() - 5 * JOUR_MS).toISOString(),
    mesures: 2,
    introuvables: 0,
    en_attente_mesure: 0,
    eligible: true,
    materialise: false,
    note: 65,
    ...sur,
  };
}

function baseRequalif(lignes: Array<Record<string, unknown>>, sur: Record<string, unknown[]> = {}) {
  return {
    applications: APPS.map((a) => ({ ...a })),
    reglages: [{ cle: "tierlist", valeur: {} }],
    [VUE_REQUALIF_APPLICATION]: lignes,
    [VUE_TIER_APPLICATION]: lignes.map((l) => ({ ...l })),
    contenus: lignes.map((l) => ({ id: l.contenu_id, titre: `titre ${l.contenu_id}`, tier: "C", tier_cycle: 7 })),
    ...sur,
  };
}

function ecritures(journal: Op[]) {
  return journal.filter((o) => o.op !== "select");
}

Deno.test("requalif application — ligne paresseuse : matérialisée (ignoreDuplicates), puis UPDATE gardé par tier_cycle = 0", async () => {
  oublierSondes();
  const base = baseRequalif([cycleTermine("c1")]);
  const { client, journal, tables } = fauxPostgrest(base);

  const res = await requalifierApplications(client);

  assertEquals(res.etat, "pret");
  const r = res.parApplication.unswipe;
  assertEquals([r.examines, r.requalifies, r.dejaRequalifies, r.remixDebloques], [1, 1, 0, 0]);
  assertEquals(r.details[0].avant, "B");
  assertEquals(r.details[0].apres, "A", "m = 12 000 : B → A, même barème que Sophia");

  const [upsert, update] = ecritures(journal);
  assertEquals(upsert.table, TABLE_TIERS_APPLICATION);
  assertEquals(upsert.op, "upsert");
  assert(upsert.ignoreDuplicates, "une ligne écrite entre-temps reste telle quelle");
  const v = upsert.valeurs as Record<string, unknown>;
  assertEquals([v.contenu_id, v.application_id, v.tier, v.passages_prevus, v.tier_cycle], ["c1", UNSWIPE, "B", 2, 0]);

  assertEquals(update.table, TABLE_TIERS_APPLICATION);
  assertEquals(update.op, "update");
  assert(update.filtres.some(([c, o, x]) => c === "tier_cycle" && o === "eq" && x === 0));
  assert(update.filtres.some(([c, , x]) => c === "application_id" && x === UNSWIPE));
  const ligne = tables[TABLE_TIERS_APPLICATION][0];
  assertEquals([ligne.tier, ligne.passages_prevus, ligne.tier_cycle], ["A", 4, 1]);
  assertEquals((ligne.tier_rapport as Record<string, unknown>).application, "unswipe");
  assertEquals((ligne.tier_rapport as Record<string, unknown>).m, 12_000);
  // Le tier Sophia (contenus) n'a pas bougé.
  assertEquals([tables.contenus[0].tier, tables.contenus[0].tier_cycle], ["C", 7]);
  oublierSondes();
});

Deno.test("requalif application — UPDATE qui ne touche rien : compté « déjà requalifié », pas requalifié", async () => {
  oublierSondes();
  // La vue a lu le cycle 2 ; entre-temps un autre run l'a passé au cycle 3.
  const base = baseRequalif([cycleTermine("c1", { materialise: true, tier_cycle: 2 })], {
    [TABLE_TIERS_APPLICATION]: [{ contenu_id: "c1", application_id: UNSWIPE, tier: "A", passages_prevus: 4, tier_cycle: 3 }],
  });
  const { client, journal, tables } = fauxPostgrest(base);

  const r = (await requalifierApplications(client)).parApplication.unswipe;

  assertEquals([r.requalifies, r.dejaRequalifies, r.details.length], [0, 1, 0]);
  assertEquals(ecritures(journal).filter((o) => o.op === "upsert"), [], "matérialisée : pas d'upsert");
  assertEquals(tables[TABLE_TIERS_APPLICATION][0].tier_cycle, 3, "ligne intacte");
  oublierSondes();
});

Deno.test("requalif application — cycle sans mesure (tous introuvables) : relancé au même rang", async () => {
  oublierSondes();
  const base = baseRequalif([
    cycleTermine("c1", { moyenne_vues: null, max_vues: null, mesures: 0, introuvables: 2, en_attente_mesure: 0 }),
  ]);
  const { client, tables } = fauxPostgrest(base);

  const r = (await requalifierApplications(client)).parApplication.unswipe;

  assertEquals([r.requalifies, r.sansMesure], [1, 1]);
  assertEquals(r.details[0].sansMesure, "introuvable");
  const ligne = tables[TABLE_TIERS_APPLICATION][0];
  assertEquals([ligne.tier, ligne.passages_prevus, ligne.tier_cycle], ["B", 2, 1]);
  assertEquals((ligne.tier_rapport as Record<string, unknown>).sans_mesure, "introuvable");
  assertEquals("m" in (ligne.tier_rapport as Record<string, unknown>), false);
  oublierSondes();
});

Deno.test("requalif application — S+ : rien dans remix_debloques, remix_en_attente = 3 dans le rapport", async () => {
  oublierSondes();
  const base = baseRequalif([
    cycleTermine("c1", { tier: "S", passages_prevus: 8, publies: 8, max_vues: 200_000, nb_150k: 1, materialise: true }),
  ], {
    [TABLE_TIERS_APPLICATION]: [{ contenu_id: "c1", application_id: UNSWIPE, tier: "S", passages_prevus: 8, tier_cycle: 0 }],
  });
  const { client, journal, tables } = fauxPostgrest(base);

  const r = (await requalifierApplications(client)).parApplication.unswipe;

  assertEquals(r.details[0].apres, "S+");
  assertEquals(r.remixDebloques, 0);
  assertEquals(r.details[0].remix, 0);
  assertEquals(r.details[0].remixEnAttente, 3);
  assertEquals(journal.filter((o) => o.table === "remix_debloques"), [], "jamais lue ni écrite");
  assertEquals((tables[TABLE_TIERS_APPLICATION][0].tier_rapport as Record<string, unknown>).remix_en_attente, 3);
  oublierSondes();
});

Deno.test("requalif application — dryRun : la décision est rendue, rien n'est écrit", async () => {
  oublierSondes();
  const base = baseRequalif([cycleTermine("c1"), cycleTermine("c2", { materialise: true })]);
  const { client, journal } = fauxPostgrest(base);

  const r = (await requalifierApplications(client, { dryRun: true })).parApplication.unswipe;

  assertEquals(r.requalifies, 2);
  assertEquals(ecritures(journal), []);
  oublierSondes();
});

Deno.test("requalif application — AUCUNE écriture sur contenus ni remix_debloques (lecture des titres permise)", async () => {
  oublierSondes();
  const base = baseRequalif([
    cycleTermine("c1"),
    cycleTermine("c2", { tier: "S+", passages_prevus: 16, publies: 16, max_vues: 400_000, nb_150k: 3, materialise: true }),
    cycleTermine("c3", { moyenne_vues: null, mesures: 0, introuvables: 2 }),
  ], {
    [TABLE_TIERS_APPLICATION]: [{ contenu_id: "c2", application_id: UNSWIPE, tier: "S+", passages_prevus: 16, tier_cycle: 0 }],
  });
  const { client, journal } = fauxPostgrest(base);

  const r = (await requalifierApplications(client)).parApplication.unswipe;

  assertEquals(r.requalifies, 3);
  const interdites = journal.filter((o) =>
    (o.table === "contenus" || o.table === "remix_debloques") && o.op !== "select"
  );
  assertEquals(interdites, []);
  const lecturesContenus = journal.filter((o) => o.table === "contenus");
  assert(lecturesContenus.every((o) => o.colonnes === "id, titre"), "seulement les titres");
  assertEquals(new Set(ecritures(journal).map((o) => o.table)), new Set([TABLE_TIERS_APPLICATION]));
  oublierSondes();
});

Deno.test("requalif application — lecture : comptage puis keyset sur contenu_id, filtrés sur application_id", async () => {
  oublierSondes();
  // 1200 cycles terminés : deux pages, aucune perdue.
  const lignes = Array.from({ length: 1200 }, (_, i) => cycleTermine(`c${String(i).padStart(5, "0")}`));
  const base = baseRequalif(lignes);
  const { client, journal } = fauxPostgrest(base);

  const r = (await requalifierApplications(client, { dryRun: true })).parApplication.unswipe;

  assertEquals(r.examines, 1200);
  assertEquals(r.coherence.ok, true);
  const lectures = journal.filter((o) => o.table === VUE_REQUALIF_APPLICATION);
  const [comptage, ...pages] = lectures;
  assert(comptage.head, "le comptage est pris AVANT la lecture");
  assert(pages.length === 2);
  for (const o of lectures) {
    assert(o.filtres.some(([c, f, v]) => c === "application_id" && f === "eq" && v === UNSWIPE));
  }
  for (const p of pages) {
    assertEquals(p.ordres, [{ colonne: "contenu_id", asc: true }]);
    assert(p.limite !== null && p.limite < PLAFOND_LIGNES);
  }
  assert(pages[1].filtres.some(([c, f]) => c === "contenu_id" && f === "gt"), "reprise APRÈS le curseur");
  assertEquals(journal.filter((o) => o.table === "contenu_a_requalifier" || o.table === "contenu_tier_etat"), []);
  oublierSondes();
});

Deno.test("requalif application — écart de complétude : l'alerte nomme la vue PAR APPLICATION", async () => {
  oublierSondes();
  const base = baseRequalif([cycleTermine("c1")]);
  const { client } = fauxPostgrest(base, { comptes: { [VUE_REQUALIF_APPLICATION]: 3 } });

  const r = (await requalifierApplications(client, { dryRun: true })).parApplication.unswipe;

  assertEquals(r.coherence.ok, false);
  assert(r.coherence.alerte?.includes("contenu_application_a_requalifier"), r.coherence.alerte ?? "");
  assertEquals(blocRunTierlistApplications({ etat: "pret", parApplication: { unswipe: r } }).unswipe.complet, false);
  oublierSondes();
});

Deno.test("requalif application — échéance dépassée : interrompue, rien d'écrit, le reste repasse demain", async () => {
  oublierSondes();
  const base = baseRequalif([cycleTermine("c1"), cycleTermine("c2")]);
  const { client, journal } = fauxPostgrest(base);

  const r = (await requalifierApplications(client, { echeance: Date.now() - 1 })).parApplication.unswipe;

  assertEquals([r.interrompu, r.requalifies], [true, 0]);
  assertEquals(ecritures(journal), []);
  assertEquals(blocRunTierlistApplications({ etat: "pret", parApplication: { unswipe: r } }).unswipe.interrompu, true);
  oublierSondes();
});

Deno.test("requalif application — échéance déjà dépassée : ni comptage, ni page, ni titres ; toutes les applications interrompues, sans erreur", async () => {
  oublierSondes();
  const base = baseRequalif([cycleTermine("c1"), cycleTermine("c2", { application_id: FOO })]);
  base.applications.push({ id: FOO, slug: "foo", nom: "Foo", langues: null, actif: true, created_at: "3" });
  const { client, journal } = fauxPostgrest(base);

  const res = await requalifierApplications(client, { echeance: Date.now() - 1 });

  for (const slug of ["unswipe", "foo"]) {
    const r = res.parApplication[slug];
    assertEquals([r.interrompu, r.erreur, r.requalifies], [true, undefined, 0], slug);
  }
  assertEquals(
    journal.filter((o) => o.table === VUE_REQUALIF_APPLICATION || o.table === "contenus"),
    [],
    "rien n'est lu après la sonde, la liste des applications et les réglages",
  );
  assertEquals(ecritures(journal), []);
  oublierSondes();
});

Deno.test("requalif application — échéance dépassée ENTRE deux pages : pas de page suivante, ni titres ni écriture", async () => {
  oublierSondes();
  const lignes = Array.from({ length: 1200 }, (_, i) => cycleTermine(`c${String(i).padStart(5, "0")}`));
  const base = baseRequalif(lignes);
  const vraiNow = Date.now;
  let horloge = vraiNow.call(Date);
  const echeance = horloge + 1_000;
  const { client, journal } = fauxPostgrest(base, {
    // Chaque page de la vue « prend » 2 s : l'échéance tombe après la première.
    echecSi: (o) => {
      if (o.table === VUE_REQUALIF_APPLICATION && !o.head) horloge += 2_000;
      return null;
    },
  });
  Date.now = () => horloge;
  try {
    const r = (await requalifierApplications(client, { echeance })).parApplication.unswipe;

    assertEquals([r.interrompu, r.erreur, r.requalifies], [true, undefined, 0]);
    const pages = journal.filter((o) => o.table === VUE_REQUALIF_APPLICATION && !o.head);
    assertEquals(pages.length, 1, "la seconde page n'est pas demandée");
    assertEquals(journal.filter((o) => o.table === "contenus"), [], "titres non lus");
    assertEquals(ecritures(journal), []);
  } finally {
    Date.now = vraiNow;
    oublierSondes();
  }
});

Deno.test("requalif application — échéance dépassée pendant les écritures : ce qui est écrit l'est, le reste attend", async () => {
  oublierSondes();
  const base = baseRequalif([cycleTermine("c1"), cycleTermine("c2"), cycleTermine("c3")]);
  const vraiNow = Date.now;
  let horloge = vraiNow.call(Date);
  const echeance = horloge + 1_000;
  const { client, tables } = fauxPostgrest(base, {
    // Chaque UPDATE de la table « prend » 2 s : un seul contenu passe.
    echecSi: (o) => {
      if (o.table === TABLE_TIERS_APPLICATION && o.op === "update") horloge += 2_000;
      return null;
    },
  });
  Date.now = () => horloge;
  try {
    const r = (await requalifierApplications(client, { echeance })).parApplication.unswipe;

    assertEquals([r.interrompu, r.erreur, r.requalifies, r.examines], [true, undefined, 1, 3]);
    assertEquals(
      tables[TABLE_TIERS_APPLICATION].filter((l) => l.tier_cycle === 1).map((l) => l.contenu_id),
      ["c1"],
    );
  } finally {
    Date.now = vraiNow;
    oublierSondes();
  }
});

Deno.test("minuit — tierlist_applications est la DERNIÈRE étape : rien de non-Sophia devant le drain", async () => {
  const source = await Deno.readTextFile(new URL("../minuit-vnext/index.ts", import.meta.url));
  const position = (etape: string) => {
    const i = source.indexOf(`executerEtape(out, bilan, "${etape}"`);
    assert(i >= 0, `étape ${etape} introuvable`);
    return i;
  };
  const applications = position("tierlist_applications");
  for (const etape of ["rattrapage", "tierlist", "rappels", "assignation", "upscale", "variations"]) {
    assert(position(etape) < applications, `${etape} doit passer AVANT tierlist_applications`);
  }
  assert(source.indexOf("kickAssignationDrain(request") < applications);
});

Deno.test("requalif application — une application en erreur n'empêche pas la suivante", async () => {
  oublierSondes();
  const base = baseRequalif([cycleTermine("c1"), cycleTermine("c2", { application_id: FOO })]);
  base.applications.push({ id: FOO, slug: "foo", nom: "Foo", langues: null, actif: true, created_at: "3" });
  const { client } = fauxPostgrest(base, {
    echecSi: (o) =>
      o.table === VUE_REQUALIF_APPLICATION && !o.head &&
        o.filtres.some(([c, , v]) => c === "application_id" && v === UNSWIPE)
        ? "panne de lecture Unswipe"
        : null,
  });

  const res = await requalifierApplications(client);

  assert(res.parApplication.unswipe.erreur?.includes("panne de lecture Unswipe"));
  assertEquals(res.parApplication.foo.erreur, undefined);
  assertEquals(res.parApplication.foo.requalifies, 1);
  assertEquals(blocRunTierlistApplications(res).unswipe.erreur !== null, true);
  oublierSondes();
});

Deno.test("requalif application — application INACTIVE : ses cycles publiés se requalifient quand même", async () => {
  oublierSondes();
  const base = baseRequalif([cycleTermine("c1")]);
  assertEquals(base.applications[1].actif, false);
  const { client } = fauxPostgrest(base);

  const r = (await requalifierApplications(client)).parApplication.unswipe;

  assertEquals(r.requalifies, 1);
  oublierSondes();
});

Deno.test("requalif application — clic admin : vue COMPLÈTE, un cycle non terminé rend son attente", async () => {
  oublierSondes();
  const base = baseRequalif([]);
  base[VUE_TIER_APPLICATION] = [cycleTermine("c1", { publies: 1, restants: 1 })];
  const { client, journal } = fauxPostgrest(base);

  const res = await requalifierApplications(client, { contenuId: "c1", applicationId: UNSWIPE });

  const r = res.parApplication.unswipe;
  assertEquals([r.examines, r.requalifies, r.enAttente], [1, 0, 1]);
  assertEquals(journal.filter((o) => o.table === VUE_REQUALIF_APPLICATION), []);
  assertEquals(Object.keys(res.parApplication), ["unswipe"]);
  await assertRejects(() => requalifierApplications(client, { contenuId: "c1", applicationId: ID_SOPHIA }));
  oublierSondes();
});

Deno.test("requalif application — base SANS 0270 : rien d'autre que la sonde n'est lu", async () => {
  oublierSondes();
  const base = baseRequalif([cycleTermine("c1")]);
  const { client, journal } = fauxPostgrest(base, { absentes: { [TABLE_TIERS_APPLICATION]: ABSENT_42P01 } });

  const res = await requalifierApplications(client);

  assertEquals(res, { etat: "absent", parApplication: {} });
  assertEquals(journal.map((o) => o.table), [TABLE_TIERS_APPLICATION]);
  assertEquals(blocRunTierlistApplications(res), {});
  oublierSondes();
});

Deno.test("requalif application — sonde illisible : rien n'est fait, l'état est rendu", async () => {
  oublierSondes();
  const base = baseRequalif([cycleTermine("c1")]);
  const { client, journal } = fauxPostgrest(base, { pannes: { [TABLE_TIERS_APPLICATION]: 2 } });

  const res = await requalifierApplications(client);

  assertEquals(res, { etat: "illisible", parApplication: {} });
  assertEquals(ecritures(journal), []);
  oublierSondes();
});
