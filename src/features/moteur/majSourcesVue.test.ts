import { describe, expect, it } from "vitest";

import type { MajSourcesRun } from "./majSequentielle";
import { finDuRun, joursDepuis, resultatsDuJournal, sourcesMettables, suiviParSource, totalEnfilees } from "./majSourcesVue";
import type { CompteReference } from "./types";

const JOUR = 86_400_000;
const MAINTENANT = Date.parse("2026-10-24T18:00:00Z");

function source(id: string, o: Partial<CompteReference> = {}): CompteReference {
  return {
    id,
    handle_tiktok: id,
    is_active: true,
    langue: "fr",
    dernier_scrape_at: "2026-10-20T10:00:00Z",
    ...o,
  } as CompteReference;
}

const COMPTES = [
  { id: "a", handle: "alice", langue: "fr" },
  { id: "b", handle: "bob", langue: "en" },
  { id: "c", handle: "carla", langue: "es" },
];

function run(o: Partial<MajSourcesRun>): MajSourcesRun {
  return {
    statut: "running",
    comptes: COMPTES,
    index: 0,
    faits: 0,
    handle: null,
    phase: null,
    restant: 0,
    minRestant: null,
    maxFaits: null,
    dernierProgresAt: null,
    journal: [],
    ...o,
  };
}

/** Le journal tel que l'écrit `_shared/maj_sources.ts`. */
const JOURNAL = [
  { at: "t1", niveau: "info" as const, message: "[1/3] @alice — mise à jour" },
  {
    at: "t2",
    niveau: "ok" as const,
    message: "[1/3] @alice — 12 slideshow(s) enfilé(s)",
    detail: "profil=40 slideshow(s) · déjà en stock=28 · manquants=12\nenfilées=12 · déjà en file=0 · source=apify",
  },
  { at: "t3", niveau: "info" as const, message: "[2/3] @bob — mise à jour" },
  {
    at: "t4",
    niveau: "info" as const,
    message: "[2/3] @bob — rien à rattraper",
    detail: "profil=30 slideshow(s) · déjà en stock=30 · manquants=0\nenfilées=0 · déjà en file=0 · source=apify",
  },
];

describe("sources à proposer", () => {
  it("actives, déjà extraites, avec une langue ; la plus ancienne d'abord", () => {
    const l = sourcesMettables([
      source("recente", { dernier_scrape_at: "2026-10-23T10:00:00Z" }),
      source("ancienne", { dernier_scrape_at: "2026-09-01T10:00:00Z" }),
      source("inactive", { is_active: false }),
      source("jamais", { dernier_scrape_at: null }),
      source("sanslangue", { langue: "" }),
    ]);
    expect(l.map((s) => s.id)).toEqual(["ancienne", "recente"]);
  });

  it("jours depuis le dernier import", () => {
    expect(joursDepuis(new Date(MAINTENANT - 3.5 * JOUR).toISOString(), MAINTENANT)).toBe(3);
    expect(joursDepuis(new Date(MAINTENANT - 1000).toISOString(), MAINTENANT)).toBe(0);
    expect(joursDepuis(null, MAINTENANT)).toBeNull();
  });
});

describe("bilan par source, lu dans le journal du serveur", () => {
  it("enfilées, déjà en stock, rien à rattraper", () => {
    const r = resultatsDuJournal(run({ journal: JOURNAL }));
    expect(r.get("alice")).toEqual({ profil: 40, enStock: 28, manquants: 12, enfilees: 12, echec: false });
    expect(r.get("bob")).toMatchObject({ enfilees: 0, manquants: 0, echec: false });
    expect(r.has("carla")).toBe(false);
  });

  it("un échec est reconnu", () => {
    const r = resultatsDuJournal(
      run({ journal: [{ at: "t", niveau: "warn", message: "[3/3] @carla — échec (on continue)", detail: "timeout" }] }),
    );
    expect(r.get("carla")).toMatchObject({ echec: true, enfilees: 0 });
  });
});

describe("statut de chaque source dans la séquence", () => {
  it("la 1re dont la file se vide, les autres en attente", () => {
    const s = suiviParSource(run({ index: 1, faits: 1, phase: "attente", handle: "alice", restant: 9, journal: JOURNAL.slice(0, 2) }));
    expect(s.map((x) => x.statut)).toEqual(["file", "attente", "attente"]);
    expect(s[0].resultat?.enfilees).toBe(12);
  });

  it("la 2e en cours de recherche : la 1re est faite", () => {
    const s = suiviParSource(run({ index: 1, faits: 1, phase: "import", handle: "bob", journal: JOURNAL.slice(0, 3) }));
    expect(s.map((x) => x.statut)).toEqual(["fait", "liste", "attente"]);
  });

  it("rien à rattraper : faite tout de suite", () => {
    const s = suiviParSource(run({ index: 2, faits: 2, phase: "import", handle: "bob", journal: JOURNAL }));
    expect(s.map((x) => x.statut)).toEqual(["fait", "fait", "attente"]);
    expect(totalEnfilees(s)).toBe(12);
  });

  it("terminée, arrêtée, figée", () => {
    expect(suiviParSource(run({ statut: "done", index: 3 })).every((x) => x.statut === "fait")).toBe(true);
    expect(suiviParSource(run({ statut: "cancelled", index: 1, phase: "attente" })).map((x) => x.statut)).toEqual([
      "fait",
      "annule",
      "annule",
    ]);
    expect(suiviParSource(run({ statut: "bloquee", index: 2, phase: "attente" })).map((x) => x.statut)).toEqual([
      "fait",
      "bloquee",
      "annule",
    ]);
  });

  it("sans séquence, rien", () => {
    expect(suiviParSource(null)).toEqual([]);
  });

  it("date de la séquence : sa dernière ligne de journal", () => {
    // « t4 » n'est pas une date : pas de date plutôt qu'une date fausse.
    expect(finDuRun(run({ journal: JOURNAL }))).toBeNull();
    expect(finDuRun(run({ journal: [{ at: "2026-08-19T17:12:02.541Z", niveau: "ok", message: "Séquence terminée" }] }))).toBe(
      "2026-08-19T17:12:02.541Z",
    );
    expect(finDuRun(run({ journal: [] }))).toBeNull();
    expect(finDuRun(null)).toBeNull();
  });
});
