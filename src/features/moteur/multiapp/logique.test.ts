import { describe, expect, it } from "vitest";

import type { RepliApplication, RunTiersApplications } from "../apiMultiApp";
import { ID_SOPHIA } from "../multiApp";
import {
  avancementBackfill,
  basculerApplicationLabel,
  clesPromptsApplication,
  derniereRequalifApplication,
  estErreurSchemaAbsent,
  grouperReplis,
  jourParisIlYa,
  labelImplicite,
  langueCiblee,
  languesApresBascule,
  promptsManquants,
  resumeRunTiersApplications,
} from "./logique";

const UNSWIPE = "00000000-0000-4000-8000-000000000003";

describe("bascule d'une application sur un label", () => {
  it("un label sans ligne sert Sophia : cocher Unswipe écrit les DEUX", () => {
    // Le premier clic matérialise l'héritage. Écrire {Unswipe} seul retirerait
    // Sophia sans que personne l'ait décoché, et viderait son stock.
    expect(labelImplicite("l1", [])).toBe(true);
    expect(basculerApplicationLabel("l1", [], UNSWIPE)).toEqual({
      ok: true,
      applications: [ID_SOPHIA, UNSWIPE].sort(),
    });
  });

  it("décocher Sophia d'un label implicite est refusé (dernière application)", () => {
    expect(basculerApplicationLabel("l1", [], ID_SOPHIA)).toEqual({ ok: false, raison: "derniere" });
  });

  it("retire une application quand il en reste une autre", () => {
    const liens = [
      { label_id: "l1", application_id: ID_SOPHIA },
      { label_id: "l1", application_id: UNSWIPE },
      { label_id: "l2", application_id: UNSWIPE },
    ];
    expect(labelImplicite("l1", liens)).toBe(false);
    expect(basculerApplicationLabel("l1", liens, ID_SOPHIA)).toEqual({ ok: true, applications: [UNSWIPE] });
    expect(basculerApplicationLabel("l2", liens, UNSWIPE)).toEqual({ ok: false, raison: "derniere" });
    expect(basculerApplicationLabel("l2", liens, ID_SOPHIA)).toEqual({
      ok: true,
      applications: [ID_SOPHIA, UNSWIPE].sort(),
    });
  });
});

describe("langues ciblées", () => {
  const toutes = ["fr", "en", "de"] as const;

  it("décocher une langue depuis « toutes » donne la liste explicite des autres", () => {
    expect(languesApresBascule(null, "en", toutes)).toEqual(["fr", "de"]);
  });

  it("tout recocher revient à null (une langue ajoutée plus tard sera servie)", () => {
    expect(languesApresBascule(["fr", "de"], "en", toutes)).toBeNull();
  });

  it("la sélection vide est permise", () => {
    expect(languesApresBascule(["fr"], "fr", toutes)).toEqual([]);
  });

  it("garde l'ordre de référence et les langues inconnues du front", () => {
    expect(languesApresBascule(["de", "xx"], "fr", toutes)).toEqual(["fr", "de", "xx"]);
    // Toutes les connues cochées mais une inconnue en plus : on ne l'efface pas.
    expect(languesApresBascule(["fr", "de", "xx"], "en", toutes)).toEqual(["fr", "en", "de", "xx"]);
  });

  it("null cible toutes les langues", () => {
    expect(langueCiblee(null, "fr")).toBe(true);
    expect(langueCiblee([], "fr")).toBe(false);
    expect(langueCiblee(["en"], "en")).toBe(true);
  });
});

describe("prompts requis avant activation", () => {
  it("vise pertinence_<slug> et placement_<slug>", () => {
    expect(clesPromptsApplication("unswipe")).toEqual(["pertinence_unswipe", "placement_unswipe"]);
  });

  it("un prompt vide ou blanc compte comme manquant", () => {
    expect(promptsManquants("unswipe", {})).toEqual(["pertinence_unswipe", "placement_unswipe"]);
    expect(
      promptsManquants("unswipe", { pertinence_unswipe: "Note de 0 à 100", placement_unswipe: "  \n" }),
    ).toEqual(["placement_unswipe"]);
    expect(
      promptsManquants("unswipe", { pertinence_unswipe: "a", placement_unswipe: "b" }),
    ).toEqual([]);
  });
});

describe("schéma absent (migration pas encore passée)", () => {
  it("reconnaît colonne, table et cache de schéma", () => {
    expect(estErreurSchemaAbsent({ code: "42703", message: "column stats_posts.application_id does not exist" })).toBe(true);
    expect(estErreurSchemaAbsent({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(estErreurSchemaAbsent({ code: "42P01" })).toBe(true);
    expect(
      estErreurSchemaAbsent({ message: "Could not find the 'actif' column of 'applications' in the schema cache" }),
    ).toBe(true);
  });

  it("ne confond pas une vraie panne avec un schéma absent", () => {
    expect(estErreurSchemaAbsent({ code: "42501", message: "permission denied for table passages" })).toBe(false);
    expect(estErreurSchemaAbsent(new Error("Failed to fetch"))).toBe(false);
    expect(estErreurSchemaAbsent(null)).toBe(false);
  });

  it("base qui ne répond plus (503 PGRST002 « schema cache ») : une panne, pas une absence", () => {
    expect(
      estErreurSchemaAbsent({ code: "PGRST002", message: "Could not query the database for the schema cache. Retrying." }),
    ).toBe(false);
    // Même message sans code : le « schema cache » seul ne dit rien d'une absence.
    expect(estErreurSchemaAbsent({ message: "Could not query the database for the schema cache. Retrying." })).toBe(false);
    expect(estErreurSchemaAbsent({ code: "PGRST001", message: "Database client error" })).toBe(false);
    // Un 5xx l'emporte sur le message.
    expect(estErreurSchemaAbsent({ status: 503, message: "relation \"x\" does not exist" })).toBe(false);
    // Les vraies absences restent reconnues.
    expect(estErreurSchemaAbsent({ code: "PGRST200", message: "Could not find a relationship between 'a' and 'b'" })).toBe(true);
    expect(estErreurSchemaAbsent({ message: "Could not find a relationship between 'a' and 'b' in the schema cache" })).toBe(true);
    expect(estErreurSchemaAbsent({ message: "relation \"public.label_applications\" does not exist" })).toBe(true);
  });
});

describe("avancement du rattrapage", () => {
  it("pourcentage des contenus faits", () => {
    expect(avancementBackfill({ restants: 75, faits: 25 })).toBe(25);
    expect(avancementBackfill({ restants: 0, faits: 12 })).toBe(100);
  });
  it("rien à mesurer", () => {
    expect(avancementBackfill({ restants: 0, faits: 0 })).toBeNull();
    expect(avancementBackfill(undefined)).toBeNull();
  });
});

describe("jour Paris", () => {
  it("recule en heure de Paris, pas en UTC", () => {
    // 2 oct. 23:30 UTC = 3 oct. 01:30 à Paris : il y a 7 jours = 26 sept.
    expect(jourParisIlYa(7, new Date("2026-10-02T23:30:00Z"))).toBe("2026-09-26");
    expect(jourParisIlYa(0, new Date("2026-10-02T10:00:00Z"))).toBe("2026-10-02");
  });
});

describe("regroupement des replis", () => {
  const repli = (
    id: string,
    compte: string,
    motif: string | null,
    date: string,
    handle: string | null = compte,
  ): RepliApplication => ({
    id,
    compte_id: compte,
    date_publication_prevue: date,
    application_id: ID_SOPHIA,
    application_visee_id: UNSWIPE,
    repli_motif: motif,
    compte: { handle_tiktok: handle, persona_nom: null, langue: "fr" },
  });

  it("par compte puis par motif, comptes les plus touchés d'abord", () => {
    const groupes = grouperReplis([
      repli("p1", "a", "reserve_vide", "2026-09-28"),
      repli("p2", "b", "reserve_vide", "2026-09-29"),
      repli("p3", "b", "deck_echec", "2026-09-30"),
      repli("p4", "b", "reserve_vide", "2026-10-01"),
    ]);
    expect(groupes.map((g) => [g.compte_id, g.total])).toEqual([
      ["b", 3],
      ["a", 1],
    ]);
    expect(groupes[0]!.motifs).toEqual([
      { application_visee_id: UNSWIPE, motif: "reserve_vide", n: 2, dernier: "2026-10-01" },
      { application_visee_id: UNSWIPE, motif: "deck_echec", n: 1, dernier: "2026-09-30" },
    ]);
  });

  it("un motif vide se range avec les motifs absents", () => {
    const groupes = grouperReplis([
      repli("p1", "a", null, "2026-09-28"),
      repli("p2", "a", "  ", "2026-09-27"),
    ]);
    expect(groupes[0]!.motifs).toEqual([
      { application_visee_id: UNSWIPE, motif: null, n: 2, dernier: "2026-09-28" },
    ]);
  });

  it("vide → vide", () => {
    expect(grouperReplis([])).toEqual([]);
  });
});

describe("0270 — trace de la tierlist par application", () => {
  const bloc = (sur: Partial<RunTiersApplications["applications"][string]> = {}) => ({
    at: "2026-10-09T22:01:00Z",
    examines: 0,
    requalifies: 0,
    enAttente: 0,
    sansMesure: 0,
    attendues: 0,
    complet: true,
    repli: false,
    alerte: null,
    interrompu: false,
    dejaRequalifies: 0,
    erreur: null,
    ...sur,
  });
  const run = (sur: Partial<RunTiersApplications> = {}): RunTiersApplications => ({
    jour: "2026-10-09",
    at: "2026-10-09T22:01:00Z",
    etat: "pret",
    applications: { unswipe: bloc() },
    erreur: null,
    ...sur,
  });

  it("page Minuit : rien tant qu'il n'y a rien à dire (0270 absente, ou 0 examiné sans alerte)", () => {
    expect(resumeRunTiersApplications(null, "2026-10-09")).toBeNull();
    expect(resumeRunTiersApplications(run({ etat: "absent", applications: {} }), "2026-10-09")).toBeNull();
    expect(resumeRunTiersApplications(run(), "2026-10-09")).toBeNull();
    // Un autre jour : rien, même avec des examinés.
    expect(resumeRunTiersApplications(run({ applications: { unswipe: bloc({ examines: 3 }) } }), "2026-10-10")).toBeNull();
  });

  it("page Minuit : une ligne dès qu'il y a des examinés, une alerte, une erreur, une interruption", () => {
    const r = resumeRunTiersApplications(
      run({ applications: { unswipe: bloc({ examines: 4, requalifies: 2 }), foo: bloc() } }),
      "2026-10-09",
    );
    expect(r?.lignes.map((l) => [l.slug, l.examines, l.requalifies])).toEqual([["unswipe", 4, 2]]);
    for (const sur of [{ alerte: "Lecture INCOMPLÈTE" }, { erreur: "panne" }, { interrompu: true }]) {
      expect(resumeRunTiersApplications(run({ applications: { unswipe: bloc(sur) } }), "2026-10-09")?.lignes).toHaveLength(1);
    }
    expect(resumeRunTiersApplications(run({ etat: "illisible", applications: {} }), "2026-10-09")?.illisible).toBe(true);
  });

  it("carte Applications : dernière requalif de l'application, en rouge sur alerte ou erreur", () => {
    expect(derniereRequalifApplication(null, "unswipe")).toBeNull();
    expect(derniereRequalifApplication(run({ applications: {} }), "unswipe")).toBeNull();
    const ok = derniereRequalifApplication(run({ applications: { unswipe: bloc({ examines: 2, requalifies: 1 }) } }), "unswipe");
    expect([ok?.examines, ok?.requalifies, ok?.rouge, ok?.jour]).toEqual([2, 1, false, "2026-10-09"]);
    expect(derniereRequalifApplication(run({ applications: { unswipe: bloc({ alerte: "x" }) } }), "unswipe")?.rouge).toBe(true);
    // L'étape entière a levé : rouge pour chaque application.
    const echec = derniereRequalifApplication(run({ applications: {}, erreur: "applications illisibles" }), "unswipe");
    expect([echec?.rouge, echec?.erreur]).toEqual([true, "applications illisibles"]);
  });
});
