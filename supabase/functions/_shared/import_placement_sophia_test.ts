/**
 * Rang SOPHIA à l'import, maintenant que chaque application a SON tier (0270).
 *
 * La promesse d'abord : un contenu Sophia seul (le cas de tout le stock) suit
 * le chemin « historique », et l'UPDATE de `contenus` est celui d'avant, champ
 * pour champ. Ensuite seulement : un contenu partagé prend son rang Sophia sur
 * SA pertinence Sophia (plus le max), un contenu hors Sophia n'en prend pas.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import { oublierSondeMultiApp } from "./applications_moteur.ts";
import { oublierSondeTiersApplication } from "./tiers_application.ts";
import {
  assurerTierImport,
  avancerImport,
  eloParLangue,
  forcerImportElo,
} from "./import_contenu.ts";
import { ID_SOPHIA } from "./multi_app.ts";
import { passagesPourTier, tierImport } from "./tierlist.ts";

const UNSWIPE = "00000000-0000-4000-8000-000000000003";
const SEUIL = 54;
const VUES = 5000;

interface Op {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  colonnes: string | null;
  filtres: Array<[string, unknown]>;
  valeurs: unknown;
}

type Ligne = Record<string, unknown>;
type Client = Parameters<typeof forcerImportElo>[0];

/** Faux PostgREST minimal (eq / maybeSingle / update / insert / delete), journalisé. */
function fauxClient(
  tables: Record<string, Ligne[]>,
  opts: { absentes?: string[]; pannes?: Record<string, string> } = {},
) {
  const journal: Op[] = [];
  const from = (table: string) => {
    const op: Op = { table, op: "select", colonnes: null, filtres: [], valeurs: null };
    let unique = false;
    const lignes = (): Ligne[] => (tables[table] ??= []);
    const filtrer = () => lignes().filter((l) => op.filtres.every(([c, v]) => l[c] === v));
    const executer = () => {
      journal.push({ ...op, filtres: [...op.filtres] });
      if (opts.absentes?.includes(table)) {
        return { data: null, error: { code: "42P01", message: `relation "${table}" does not exist` }, status: 404 };
      }
      const panne = opts.pannes?.[table];
      if (panne) return { data: null, error: { message: panne }, status: 500 };
      let data: Ligne[] = [];
      if (op.op === "select") data = filtrer();
      else if (op.op === "update") {
        data = filtrer();
        for (const l of data) Object.assign(l, op.valeurs);
      } else if (op.op === "insert") {
        const v = (Array.isArray(op.valeurs) ? op.valeurs : [op.valeurs]) as Ligne[];
        lignes().push(...v.map((x) => ({ id: `${table}-${lignes().length + 1}`, ...x })));
        data = v;
      } else if (op.op === "delete") {
        data = filtrer();
        tables[table] = lignes().filter((l) => !data.includes(l));
      }
      if (unique) return { data: data[0] ?? null, error: null, status: 200 };
      return { data, error: null, status: 200 };
    };
    const maillon = {
      select: (c?: string) => (op.op === "select" ? (op.colonnes = c ?? "*") : null, maillon),
      update: (v: unknown) => ((op.op = "update"), (op.valeurs = v), maillon),
      insert: (v: unknown) => ((op.op = "insert"), (op.valeurs = v), maillon),
      delete: () => ((op.op = "delete"), maillon),
      eq: (c: string, v: unknown) => (op.filtres.push([c, v]), maillon),
      in: () => maillon,
      is: () => maillon,
      order: () => maillon,
      limit: () => maillon,
      maybeSingle: () => ((unique = true), maillon),
      single: () => ((unique = true), maillon),
      then: (ok?: (v: unknown) => unknown, ko?: (r: unknown) => unknown) =>
        Promise.resolve(executer()).then(ok, ko),
    };
    return maillon;
  };
  return { client: { from } as unknown as Client, journal, tables };
}

const SCORING = { elo_seuil_import: SEUIL };

/** Les deux sondes (0256, 0270) sont mémorisées par isolate : oubliées à chaque test. */
function oublierSondes() {
  oublierSondeMultiApp();
  oublierSondeTiersApplication();
}

/** 0270 non appliquée : la table des tiers par application est inconnue. */
const SANS_0270 = ["contenu_tiers_application"];

function lecturesSonde0270(journal: Op[]) {
  return journal.filter((o) =>
    o.table === "contenu_tiers_application" || o.table === "contenu_application_tier_etat"
  );
}

function note(pertinence: number): number {
  return eloParLangue({
    pertinence,
    vues: VUES,
    langue: "en",
    langueSource: "en",
    prior: 50,
    k: 1,
    poidsVues: 0.7,
    vuesPlafond: 80_000,
  });
}

function contenu(sur: Record<string, unknown> = {}) {
  return {
    id: "c1",
    titre: "t",
    structure_slides: [{ position: 1, raw_url: "u1", media_id: null, texte_original: "hook" }],
    langue_source: "en",
    pertinence_score: 90,
    vues_source: VUES,
    statut: "brouillon",
    import_statut: "running",
    import_etape: "ocr",
    compte_reference_id: null,
    tier: "D",
    passages_prevus: 0,
    tier_cycle: 0,
    tier_maj_at: null,
    tier_rapport: null,
    import_tentatives: 0,
    import_elo_force_seuil: false,
    import_elo_rapport: null,
    ...sur,
  };
}

function base(lignesPertinence: Array<Record<string, unknown>>, sur: Record<string, unknown> = {}) {
  return {
    reglages: [{ cle: "scoring", valeur: SCORING }],
    applications: [
      { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", langues: null, actif: true, created_at: "1" },
      { id: UNSWIPE, slug: "unswipe", nom: "Unswipe", langues: [], actif: false, created_at: "2" },
    ],
    label_applications: [],
    passages: [],
    contenus: [contenu(sur)],
    contenu_langues: [],
    contenu_pertinences: lignesPertinence.map((l) => ({ contenu_id: "c1", raison: "r", note: null, eligible: false, ...l })),
  };
}

function updatesRang(journal: Op[]) {
  return journal
    .filter((o) => o.table === "contenus" && o.op === "update")
    .map((o) => o.valeurs as Record<string, unknown>)
    .filter((v) => "tier" in v);
}

function lecturesPlacement(journal: Op[]) {
  return journal.filter((o) => o.table === "contenu_pertinences" && o.colonnes === "application_id, score");
}

/** L'UPDATE du rang tel que l'écrivait le code d'avant 0270 (tier_maj_at mis à part). */
function instantaneHistorique(pertinence: number) {
  const elo = note(pertinence);
  const tier = tierImport(elo, SEUIL)!;
  return {
    tier,
    passages_prevus: passagesPourTier(tier),
    tier_cycle: 0,
    tier_rapport: {
      origine: "import",
      elo: Math.round(elo * 100) / 100,
      seuil: SEUIL,
      tier,
      passages: passagesPourTier(tier),
    },
  };
}

function sansDate(v: Record<string, unknown>) {
  const { tier_maj_at, ...reste } = v;
  assert(typeof tier_maj_at === "string", "tier_maj_at posé");
  return reste;
}

Deno.test("historique : l'UPDATE du rang est celui d'avant, champ pour champ et dans le même ordre", async () => {
  oublierSondes();
  for (const placement of [undefined, { mode: "historique" as const }]) {
    const { client, journal } = fauxClient(base([]));
    const tier = await assurerTierImport(client, "c1", "en", VUES, 90, null, placement);
    const [v] = updatesRang(journal);
    assertEquals(tier, instantaneHistorique(90).tier);
    assertEquals(Object.keys(v), ["tier", "passages_prevus", "tier_cycle", "tier_maj_at", "tier_rapport"]);
    assertEquals(sansDate(v), instantaneHistorique(90));
    assertEquals(lecturesPlacement(journal), [], "assurerTierImport ne lit pas le placement");
  }
});

Deno.test("pipeline, contenu Sophia seul : placement « historique », UPDATE et rapport d'avant (pas de clé placement_sophia)", async () => {
  oublierSondes();
  const b = base([{ application_id: ID_SOPHIA, score: 90 }]);
  const { client, journal, tables } = fauxClient(b);

  const r = await avancerImport(client, b.contenus[0]);

  assertEquals(r.etape, "elo");
  assertEquals(lecturesPlacement(journal).length, 1);
  const [v] = updatesRang(journal);
  assertEquals(sansDate(v), instantaneHistorique(90));
  const rapport = tables.contenus[0].import_elo_rapport as Record<string, unknown>;
  assertEquals("placement_sophia" in rapport, false);
  assert(!String(rapport.texte).includes("rang Sophia"));
  oublierSondes();
});

Deno.test("pipeline, contenu partagé où Sophia est le max : même tier qu'avant, base « pertinence_sophia »", async () => {
  oublierSondes();
  const b = base([{ application_id: ID_SOPHIA, score: 90 }, { application_id: UNSWIPE, score: 40 }]);
  const { client, journal, tables } = fauxClient(b);

  await avancerImport(client, b.contenus[0]);

  const [v] = updatesRang(journal);
  const avant = instantaneHistorique(90);
  assertEquals([v.tier, v.passages_prevus, v.tier_cycle], [avant.tier, avant.passages_prevus, 0]);
  const tr = v.tier_rapport as Record<string, unknown>;
  assertEquals([tr.origine, tr.base, tr.tier, tr.tier_porte], ["import", "pertinence_sophia", avant.tier, avant.tier]);
  const rapport = tables.contenus[0].import_elo_rapport as Record<string, unknown>;
  assertEquals((rapport.placement_sophia as Record<string, unknown>).tier, avant.tier);
  oublierSondes();
});

Deno.test("pipeline, contenu partagé où Sophia est sous le seuil : D / 0 côté Sophia, la porte importe quand même", async () => {
  oublierSondes();
  assert(note(10) < SEUIL && note(95) >= SEUIL, "prémisse des chiffres");
  const b = base(
    [{ application_id: ID_SOPHIA, score: 10 }, { application_id: UNSWIPE, score: 95 }],
    { pertinence_score: 95 },
  );
  const { client, journal, tables } = fauxClient(b);

  const r = await avancerImport(client, b.contenus[0]);

  assertEquals(r.etape, "elo", "la porte (le max) importe");
  const [v] = updatesRang(journal);
  assertEquals([v.tier, v.passages_prevus, v.tier_cycle], ["D", 0, 0]);
  assertEquals((v.tier_rapport as Record<string, unknown>).tier_porte, tierImport(note(95), SEUIL));
  const rapport = tables.contenus[0].import_elo_rapport as Record<string, unknown>;
  assertEquals((rapport.placement_sophia as Record<string, unknown>).tier, "D");
  assert(String(rapport.texte).includes("rang Sophia : D"));
  oublierSondes();
});

Deno.test("pipeline, contenu hors Sophia : aucune écriture du rang dans contenus", async () => {
  oublierSondes();
  const b = base([{ application_id: UNSWIPE, score: 95 }], { pertinence_score: 95 });
  const { client, journal, tables } = fauxClient(b);

  const r = await avancerImport(client, b.contenus[0]);

  assertEquals(r.etape, "elo");
  assertEquals(updatesRang(journal), []);
  assertEquals([tables.contenus[0].tier, tables.contenus[0].passages_prevus, tables.contenus[0].tier_maj_at], ["D", 0, null]);
  const rapport = tables.contenus[0].import_elo_rapport as Record<string, unknown>;
  assertEquals((rapport.placement_sophia as Record<string, unknown>).mode, "hors_sophia");
  oublierSondes();
});

Deno.test("pipeline, lecture du placement en panne : le pas échoue (rejoué), aucun rang écrit", async () => {
  oublierSondes();
  const b = base([{ application_id: ID_SOPHIA, score: 90 }]);
  // La note par application (majNotesPertinences) tolère la panne ; la
  // lecture du placement, elle, doit faire échouer le pas.
  const { client, journal, tables } = fauxClient(b, { pannes: { contenu_pertinences: "connexion perdue" } });

  const r = await avancerImport(client, b.contenus[0]);

  assertEquals(r.etape, "failed");
  assertEquals(updatesRang(journal), []);
  assertEquals(tables.contenus[0].import_statut, "failed");
  assert(String(tables.contenus[0].import_erreur).includes("connexion perdue"));
  oublierSondes();
});

Deno.test("pipeline, rang déjà posé (tier_maj_at) : le placement n'est pas relu", async () => {
  oublierSondes();
  const b = base(
    [{ application_id: ID_SOPHIA, score: 90 }, { application_id: UNSWIPE, score: 40 }],
    { tier_maj_at: "2026-10-01T00:00:00Z", tier: "A", passages_prevus: 4 },
  );
  const { client, journal, tables } = fauxClient(b);

  await avancerImport(client, b.contenus[0]);

  assertEquals(lecturesPlacement(journal), []);
  assertEquals(updatesRang(journal), []);
  assertEquals(tables.contenus[0].tier, "A");
  oublierSondes();
});

Deno.test("pipeline, 0256 absente : chemin historique sans aucune lecture de pertinence", async () => {
  oublierSondes();
  const b = base([]);
  const { client, journal } = fauxClient(b, { absentes: ["label_applications"] });

  await avancerImport(client, b.contenus[0]);

  assertEquals(journal.filter((o) => o.table === "contenu_pertinences"), []);
  assertEquals(sansDate(updatesRang(journal)[0]), instantaneHistorique(90));
  oublierSondes();
});

/* -------------------------------------------------------------------------
 * Import forcé : même placement Sophia.
 * ---------------------------------------------------------------------- */

function baseForcee(lignes: Array<Record<string, unknown>>) {
  return base(lignes, { statut: "rejete", import_etape: "elo_insuffisant", pertinence_score: 10 });
}

Deno.test("forçage, contenu Sophia seul : l'UPDATE d'avant (import_force, sans base)", async () => {
  oublierSondes();
  const b = baseForcee([{ application_id: ID_SOPHIA, score: 10 }]);
  const { client, journal } = fauxClient(b);

  const r = await forcerImportElo(client, "c1");

  assert(r.ok);
  const [v] = updatesRang(journal);
  assertEquals(Object.keys(v), ["tier", "passages_prevus", "tier_maj_at", "tier_rapport"]);
  assertEquals(sansDate(v), {
    tier: "C",
    passages_prevus: 1,
    tier_rapport: { origine: "import_force", elo: SEUIL, seuil: SEUIL, tier: "C", passages: 1 },
  });
  oublierSondes();
});

Deno.test("forçage, contenu partagé : rang depuis la note SOPHIA planchée au seuil", async () => {
  oublierSondes();
  // Sophia 90 → au-dessus du seuil : B, même si la porte (10) était sous le seuil.
  const b = baseForcee([{ application_id: ID_SOPHIA, score: 90 }, { application_id: UNSWIPE, score: 10 }]);
  const { client, journal } = fauxClient(b);

  const r = await forcerImportElo(client, "c1");

  assert(r.ok);
  const [v] = updatesRang(journal);
  const attendu = tierImport(Math.max(note(90), SEUIL), SEUIL);
  assertEquals(v.tier, attendu);
  const tr = v.tier_rapport as Record<string, unknown>;
  assertEquals([tr.origine, tr.base], ["import_force", "pertinence_sophia"]);
  oublierSondes();
});

Deno.test("forçage, contenu hors Sophia : pas d'UPDATE du rang, le reste du forçage est fait", async () => {
  oublierSondes();
  const b = baseForcee([{ application_id: UNSWIPE, score: 10 }]);
  const { client, journal, tables } = fauxClient(b);

  const r = await forcerImportElo(client, "c1");

  assert(r.ok);
  assertEquals(updatesRang(journal), []);
  assertEquals(tables.contenus[0].import_elo_force_seuil, true);
  assertEquals(tables.contenu_pertinences[0].eligible, true);
  oublierSondes();
});

Deno.test("forçage, placement illisible : refus propre, aucun rang écrit", async () => {
  oublierSondes();
  const b = baseForcee([{ application_id: ID_SOPHIA, score: 10 }]);
  const { client, journal } = fauxClient(b, { pannes: { contenu_pertinences: "connexion perdue" } });

  const r = await forcerImportElo(client, "c1");

  assertEquals(r.ok, false);
  assertEquals(updatesRang(journal), []);
  oublierSondes();
});

/* -------------------------------------------------------------------------
 * Sonde 0270 : sans elle, le placement d'avant (rang depuis la porte).
 * ---------------------------------------------------------------------- */

Deno.test("pipeline, contenu Sophia seul : la sonde 0270 n'est jamais lue", async () => {
  oublierSondes();
  const b = base([{ application_id: ID_SOPHIA, score: 90 }]);
  const { client, journal } = fauxClient(b);

  await avancerImport(client, b.contenus[0]);

  assertEquals(lecturesSonde0270(journal), []);
  assertEquals(sansDate(updatesRang(journal)[0]), instantaneHistorique(90));
  oublierSondes();
});

Deno.test("pipeline, contenu partagé, 0270 ABSENTE : placement historique (rang depuis la porte, comme avant)", async () => {
  oublierSondes();
  const b = base(
    [{ application_id: ID_SOPHIA, score: 10 }, { application_id: UNSWIPE, score: 95 }],
    { pertinence_score: 95 },
  );
  const { client, journal, tables } = fauxClient(b, { absentes: SANS_0270 });

  const r = await avancerImport(client, b.contenus[0]);

  assertEquals(r.etape, "elo");
  assertEquals(sansDate(updatesRang(journal)[0]), instantaneHistorique(95), "UPDATE d'avant, sur le max");
  const rapport = tables.contenus[0].import_elo_rapport as Record<string, unknown>;
  assertEquals("placement_sophia" in rapport, false);
  oublierSondes();
});

Deno.test("pipeline, contenu hors Sophia, 0270 ABSENTE : rang Sophia posé comme avant", async () => {
  oublierSondes();
  const b = base([{ application_id: UNSWIPE, score: 95 }], { pertinence_score: 95 });
  const { client, journal } = fauxClient(b, { absentes: SANS_0270 });

  await avancerImport(client, b.contenus[0]);

  assertEquals(sansDate(updatesRang(journal)[0]), instantaneHistorique(95));
  oublierSondes();
});

Deno.test("pipeline, contenu partagé, sonde 0270 ILLISIBLE : le pas échoue (rejoué), aucun rang écrit", async () => {
  oublierSondes();
  const b = base([{ application_id: ID_SOPHIA, score: 90 }, { application_id: UNSWIPE, score: 40 }]);
  const { client, journal, tables } = fauxClient(b, { pannes: { contenu_tiers_application: "503 PGRST002" } });

  const r = await avancerImport(client, b.contenus[0]);

  assertEquals(r.etape, "failed");
  assertEquals(updatesRang(journal), []);
  assert(String(tables.contenus[0].import_erreur).includes("0270"));
  oublierSondes();
});

Deno.test("forçage, contenu partagé, 0270 ABSENTE : l'UPDATE d'avant (import_force, sans base)", async () => {
  oublierSondes();
  const b = baseForcee([{ application_id: ID_SOPHIA, score: 90 }, { application_id: UNSWIPE, score: 10 }]);
  const { client, journal } = fauxClient(b, { absentes: SANS_0270 });

  const r = await forcerImportElo(client, "c1");

  assert(r.ok);
  const [v] = updatesRang(journal);
  assertEquals(sansDate(v), {
    tier: "C",
    passages_prevus: 1,
    tier_rapport: { origine: "import_force", elo: SEUIL, seuil: SEUIL, tier: "C", passages: 1 },
  });
  oublierSondes();
});

Deno.test("forçage : ligne d'une AUTRE application planchée au seuil, ligne Sophia brute", async () => {
  oublierSondes();
  const b = baseForcee([
    { application_id: ID_SOPHIA, score: 10, note: 30 },
    { application_id: UNSWIPE, score: 10, note: 20 },
  ]);
  (b.contenus[0] as Record<string, unknown>).import_elo_rapport = {
    pertinences: {
      sophia: { score: 10, note: 30, eligible: false },
      unswipe: { score: 10, note: 20, eligible: false },
    },
  };
  const { client, tables } = fauxClient(b);

  const r = await forcerImportElo(client, "c1");

  assert(r.ok);
  const ligne = (app: string) => tables.contenu_pertinences.find((l) => l.application_id === app)!;
  assertEquals([ligne(ID_SOPHIA).note, ligne(ID_SOPHIA).eligible], [30, true], "Sophia : note brute");
  assertEquals([ligne(UNSWIPE).note, ligne(UNSWIPE).eligible], [SEUIL, true], "Unswipe : max(note, seuil)");
  const pert = (r.ok ? r.elo : null) as { pertinences?: Record<string, { note: number | null }> } | null;
  assertEquals(pert?.pertinences?.sophia.note, 30);
  assertEquals(pert?.pertinences?.unswipe.note, SEUIL);
  oublierSondes();
});
