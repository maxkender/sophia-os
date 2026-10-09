/**
 * Pertinence par application : décisions pures, puis le chemin base (import
 * étape 2 / 4 et rattrapage) sur un faux PostgREST en mémoire.
 *
 * Les deux promesses qu'on vérifie avant tout :
 *  - un contenu Sophia seul part chez Gemini avec EXACTEMENT le prompt stocké
 *    (un passage, un appel, mêmes valeurs qu'avant le multi-app) ;
 *  - une application sans prompt n'est jamais notée — surtout pas avec le
 *    texte Sophia.
 */

import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import { oublierSondeMultiApp } from "./applications_moteur.ts";
import { eloParLangue } from "./import_contenu.ts";
import { ID_SOPHIA, type ApplicationMoteur } from "./multi_app.ts";
import { tierImport, tierInitialDepuisNote } from "./tierlist.ts";
import {
  accrocheDepuisLigneSource,
  applicationBackfillAPrendre,
  applicationsANoter,
  basculerBackfill,
  BAIL_BACKFILL_MS,
  CLE_BACKFILL_PERTINENCE,
  clePromptPertinenceApp,
  eligibiliteDepuisNote,
  etatBackfillPertinence,
  finaliserPertinence,
  majNotesPertinences,
  normaliserReglageBackfill,
  noteStockee,
  noterPertinenceImport,
  piloterBackfillPertinence,
  placementSophiaDepuisLignes,
  placementSophiaImport,
  prochaineANoter,
  scoreStockable,
  tickBackfillPertinence,
  type DepsBackfill,
} from "./pertinence_apps.ts";

const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";
const ID_AUTRE = "00000000-0000-4000-8000-000000000009";

const SOPHIA: ApplicationMoteur = {
  id: ID_SOPHIA,
  slug: "sophia",
  nom: "Sophia",
  langues: null,
  actif: true,
};
const UNSWIPE: ApplicationMoteur = {
  id: ID_UNSWIPE,
  slug: "unswipe",
  nom: "Unswipe",
  langues: null,
  actif: false,
};
const AAA: ApplicationMoteur = {
  id: ID_AUTRE,
  slug: "aaa",
  nom: "Aaa",
  langues: null,
  actif: true,
};

// ---------------------------------------------------------------------------
// Décisions pures
// ---------------------------------------------------------------------------

Deno.test("clé de prompt : Sophia garde 'pertinence', les autres 'pertinence_<slug>'", () => {
  assertEquals(clePromptPertinenceApp(SOPHIA), "pertinence");
  assertEquals(clePromptPertinenceApp(UNSWIPE), "pertinence_unswipe");
});

Deno.test("Sophia seule : notée même sans prompt stocké (défaut de scoreRelevance)", () => {
  const r = applicationsANoter({
    servies: [ID_SOPHIA],
    applications: [SOPHIA, UNSWIPE],
    prompts: new Map([[ID_SOPHIA, undefined]]),
  });
  assertEquals(r.length, 1);
  assertEquals(r[0].app.id, ID_SOPHIA);
  assertEquals(r[0].cle, "pertinence");
  assertStrictEquals(r[0].prompt, undefined);
});

Deno.test("prompt non-Sophia manquant ou vide : application NON notée, jamais le texte Sophia", () => {
  for (const manquant of [undefined, "", "   "]) {
    const r = applicationsANoter({
      servies: [ID_SOPHIA, ID_UNSWIPE],
      applications: [SOPHIA, UNSWIPE],
      prompts: new Map([[ID_SOPHIA, "PROMPT SOPHIA"], [ID_UNSWIPE, manquant]]),
    });
    assertEquals(r.map((a) => a.app.id), [ID_SOPHIA]);
  }
});

Deno.test("labels qui ne servent qu'une application sans prompt : repli Sophia (porte d'import)", () => {
  const r = applicationsANoter({
    servies: [ID_UNSWIPE],
    applications: [SOPHIA, UNSWIPE],
    prompts: new Map([[ID_SOPHIA, "PROMPT SOPHIA"]]),
  });
  assertEquals(r.map((a) => a.app.id), [ID_SOPHIA]);
  assertEquals(r[0].prompt, "PROMPT SOPHIA");
});

Deno.test("application inactive notée si son prompt existe ; Sophia d'abord puis par slug", () => {
  const r = applicationsANoter({
    servies: [ID_UNSWIPE, ID_AUTRE, ID_SOPHIA],
    applications: [SOPHIA, UNSWIPE, AAA],
    prompts: new Map([[ID_UNSWIPE, "PU"], [ID_AUTRE, "PA"]]),
  });
  assertEquals(r.map((a) => a.app.slug), ["sophia", "aaa", "unswipe"]);
  assertEquals(r[2].cle, "pertinence_unswipe");

  const sansSophia = applicationsANoter({
    servies: [ID_UNSWIPE],
    applications: [SOPHIA, UNSWIPE],
    prompts: new Map([[ID_UNSWIPE, "PU"]]),
  });
  assertEquals(sansSophia.map((a) => a.app.slug), ["unswipe"]);
});

Deno.test("score stockable : entier borné 0..100", () => {
  assertEquals(scoreStockable(72.6), 73);
  assertEquals(scoreStockable(140), 100);
  assertEquals(scoreStockable(-3), 0);
  assertEquals(scoreStockable(Number.NaN), 0);
});

Deno.test("finalisation : rien tant qu'une application manque ; Sophia seule = ses valeurs", () => {
  const aNoter = applicationsANoter({
    servies: [ID_SOPHIA, ID_UNSWIPE],
    applications: [SOPHIA, UNSWIPE],
    prompts: new Map([[ID_UNSWIPE, "PU"]]),
  });
  const sophia = { application_id: ID_SOPHIA, score: 41, raison: "bof" };
  assertEquals(finaliserPertinence(aNoter, [sophia]), null);
  assertEquals(prochaineANoter(aNoter, [sophia])?.app.id, ID_UNSWIPE);

  // Max des applications, raison de Sophia.
  const fin = finaliserPertinence(aNoter, [
    sophia,
    { application_id: ID_UNSWIPE, score: 88, raison: "top" },
  ]);
  assertEquals(fin, { score: 88, raison: "bof" });

  const seule = applicationsANoter({
    servies: [ID_SOPHIA],
    applications: [SOPHIA],
    prompts: new Map(),
  });
  assertEquals(finaliserPertinence(seule, [{ application_id: ID_SOPHIA, score: 67, raison: "r" }]), {
    score: 67,
    raison: "r",
  });
  assertEquals(prochaineANoter(seule, [{ application_id: ID_SOPHIA, score: 67, raison: "r" }]), null);
});

Deno.test("finalisation sans Sophia : raison de la gagnante, préfixée de son nom", () => {
  const aNoter = applicationsANoter({
    servies: [ID_UNSWIPE, ID_AUTRE],
    applications: [SOPHIA, UNSWIPE, AAA],
    prompts: new Map([[ID_UNSWIPE, "PU"], [ID_AUTRE, "PA"]]),
  });
  const fin = finaliserPertinence(aNoter, [
    { application_id: ID_AUTRE, score: 30, raison: "non" },
    { application_id: ID_UNSWIPE, score: 77, raison: "scroll" },
  ]);
  assertEquals(fin, { score: 77, raison: "[Unswipe] scroll" });
});

Deno.test("éligibilité : note ≥ seuil, ou import forcé", () => {
  assert(eligibiliteDepuisNote(55, 55, false));
  assert(!eligibiliteDepuisNote(54.99, 55, false));
  assert(eligibiliteDepuisNote(10, 55, true));
  assert(!eligibiliteDepuisNote(Number.NaN, 55, false));
});

Deno.test("accroche du stock : base sans pub d'abord, slide pub sautée", () => {
  assertEquals(
    accrocheDepuisLigneSource({
      slides: [
        { position: 1, texte_overlay: "PUB SOPHIA", position_sophia: true },
        { position: 2, texte_overlay: "deux", position_sophia: false },
      ],
      slides_base: [
        { position: 2, texte_overlay: "deux brut", position_sophia: false },
        { position: 1, texte_overlay: " hook brut ", position_sophia: false },
      ],
    }),
    "hook brut",
  );
  assertEquals(
    accrocheDepuisLigneSource({
      slides: [
        { position: 1, texte_overlay: "PUB", position_sophia: true },
        { position: 2, texte_overlay: "vrai hook", position_sophia: false },
      ],
    }),
    "vrai hook",
  );
  assertEquals(accrocheDepuisLigneSource(null), "");
});

Deno.test("réglage du rattrapage : lecture tolérante, bascule, choix de l'application", () => {
  const r = normaliserReglageBackfill({
    [ID_UNSWIPE]: { actif: true, faits: "12", erreurs: -1 },
    [ID_SOPHIA]: { actif: true },
    "": { actif: true },
    cassé: "oui",
  });
  assertEquals(Object.keys(r).sort(), [ID_SOPHIA, ID_UNSWIPE].sort());
  assertEquals(r[ID_UNSWIPE].faits, 12);
  assertEquals(r[ID_UNSWIPE].erreurs, 0);

  const maintenant = Date.parse("2026-10-02T12:00:00Z");
  // Sophia jamais rattrapée, même « active ».
  assertEquals(applicationBackfillAPrendre({ [ID_SOPHIA]: r[ID_SOPHIA] }, maintenant), null);
  assertEquals(applicationBackfillAPrendre(r, maintenant), ID_UNSWIPE);
  // Bail tenu par un autre worker → rien ; bail expiré → reprenable.
  const tenu = {
    ...r,
    [ID_UNSWIPE]: { ...r[ID_UNSWIPE], bail_jusqu_a: new Date(maintenant + 1000).toISOString() },
  };
  assertEquals(applicationBackfillAPrendre(tenu, maintenant), null);
  assertEquals(applicationBackfillAPrendre(tenu, maintenant + 2000), ID_UNSWIPE);

  const off = basculerBackfill(r, ID_UNSWIPE, false, "t1");
  assertEquals(off[ID_UNSWIPE].actif, false);
  assertEquals(off[ID_UNSWIPE].faits, 12);
  const on = basculerBackfill(off, ID_UNSWIPE, true, "t2");
  assertEquals(on[ID_UNSWIPE], { ...off[ID_UNSWIPE], actif: true, demarre_at: "t2", faits: 0, erreurs: 0 });
  // Rallumer une campagne active : inchangé (même référence).
  assertStrictEquals(basculerBackfill(on, ID_UNSWIPE, true, "t3"), on);
});

// ---------------------------------------------------------------------------
// Faux PostgREST en mémoire
// ---------------------------------------------------------------------------

type Ligne = Record<string, unknown>;

const CLES: Record<string, string[]> = {
  reglages: ["cle"],
  contenu_pertinences: ["contenu_id", "application_id"],
};

interface Trace {
  table: string;
  op: string;
  valeur?: unknown;
}

class FausseBase {
  tables: Record<string, Ligne[]> = {};
  traces: Trace[] = [];
  /** Erreur à rendre pour toute requête sur cette table. */
  pannes = new Map<string, string>();

  constructor(init: Record<string, Ligne[]>) {
    for (const [t, l] of Object.entries(init)) this.tables[t] = l.map((x) => ({ ...x }));
  }

  table(t: string): Ligne[] {
    return (this.tables[t] ??= []);
  }

  client() {
    // deno-lint-ignore no-explicit-any
    return { from: (t: string) => new FausseRequete(this, t) } as any;
  }
}

class FausseRequete {
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private filtres: Array<(l: Ligne) => boolean> = [];
  private tri: Array<[string, boolean]> = [];
  private lim: number | null = null;
  private tete = false;
  private compte = false;
  private unique: "maybe" | "single" | null = null;
  private retour = false;
  private valeur: unknown = null;
  private conflit: string[] = [];

  constructor(private base: FausseBase, private nom: string) {}

  select(_cols?: string, opts?: { head?: boolean; count?: string }) {
    if (this.op === "select") {
      this.tete = Boolean(opts?.head);
      this.compte = Boolean(opts?.count);
    } else {
      this.retour = true;
    }
    return this;
  }
  eq(c: string, v: unknown) {
    this.filtres.push((l) => l[c] === v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filtres.push((l) => vs.includes(l[c]));
    return this;
  }
  order(c: string, opts?: { ascending?: boolean }) {
    this.tri.push([c, opts?.ascending !== false]);
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  maybeSingle() {
    this.unique = "maybe";
    return this;
  }
  single() {
    this.unique = "single";
    return this;
  }
  insert(v: unknown) {
    this.op = "insert";
    this.valeur = v;
    return this;
  }
  upsert(v: unknown, opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.valeur = v;
    this.conflit = (opts?.onConflict ?? "").split(",").filter(Boolean);
    return this;
  }
  update(v: unknown) {
    this.op = "update";
    this.valeur = v;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  private executer(): { data: unknown; error: unknown; count?: number | null } {
    const panne = this.base.pannes.get(this.nom);
    if (panne) return { data: null, error: { message: panne } };
    const lignes = this.base.table(this.nom);
    const garde = (l: Ligne) => this.filtres.every((f) => f(l));
    if (this.op !== "select") this.base.traces.push({ table: this.nom, op: this.op, valeur: this.valeur });

    if (this.op === "select") {
      let out = lignes.filter(garde);
      for (const [c, asc] of [...this.tri].reverse()) {
        out = [...out].sort((a, b) => {
          const x = String(a[c] ?? "");
          const y = String(b[c] ?? "");
          return asc ? x.localeCompare(y) : y.localeCompare(x);
        });
      }
      if (this.lim !== null) out = out.slice(0, this.lim);
      if (this.tete) return { data: null, error: null, count: this.compte ? out.length : null };
      if (this.unique) {
        if (out.length > 1) return { data: null, error: { message: "plusieurs lignes" } };
        if (out.length === 0 && this.unique === "single") {
          return { data: null, error: { message: "aucune ligne" } };
        }
        return { data: out[0] ? { ...out[0] } : null, error: null };
      }
      return { data: out.map((l) => ({ ...l })), error: null };
    }

    if (this.op === "insert") {
      const cles = CLES[this.nom] ?? [];
      const nouvelles = (Array.isArray(this.valeur) ? this.valeur : [this.valeur]) as Ligne[];
      for (const n of nouvelles) {
        if (cles.length && lignes.some((l) => cles.every((c) => l[c] === n[c]))) {
          return { data: null, error: { message: "duplicate key", code: "23505" } };
        }
      }
      lignes.push(...nouvelles.map((n) => ({ ...n })));
      return { data: this.retour ? nouvelles : null, error: null };
    }

    if (this.op === "upsert") {
      const nouvelles = (Array.isArray(this.valeur) ? this.valeur : [this.valeur]) as Ligne[];
      for (const n of nouvelles) {
        const ex = lignes.find((l) => this.conflit.every((c) => l[c] === n[c]));
        if (ex) Object.assign(ex, n);
        else lignes.push({ ...n });
      }
      return { data: this.retour ? nouvelles : null, error: null };
    }

    if (this.op === "update") {
      const touchees = lignes.filter(garde);
      for (const l of touchees) Object.assign(l, this.valeur as Ligne);
      return { data: this.retour ? touchees.map((l) => ({ ...l })) : null, error: null };
    }

    // delete
    const restent = lignes.filter((l) => !garde(l));
    this.base.tables[this.nom] = restent;
    return { data: null, error: null };
  }

  then<T>(ok?: (v: { data: unknown; error: unknown; count?: number | null }) => T, ko?: (e: unknown) => T) {
    try {
      return Promise.resolve(ok ? ok(this.executer()) : (this.executer() as unknown as T));
    } catch (e) {
      return ko ? Promise.resolve(ko(e)) : Promise.reject(e);
    }
  }
}

function applications(): Ligne[] {
  return [
    { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", langues: null, actif: true, created_at: "1" },
    { id: ID_UNSWIPE, slug: "unswipe", nom: "Unswipe", langues: null, actif: false, created_at: "3" },
  ];
}

function contenuLabel(contenuId: string, labelId: string, nom = "Clean Girl"): Ligne {
  return {
    contenu_id: contenuId,
    label_id: labelId,
    labels: { id: labelId, slug: labelId, nom },
  };
}

interface Appel {
  caption: string;
  hookText: string;
  instructions?: string;
}

function espionScore(scores: Array<{ score: number; reason: string }>, appels: Appel[]) {
  return (input: Appel) => {
    appels.push({ ...input });
    const r = scores.shift();
    if (!r) throw new Error("appel Gemini inattendu");
    return Promise.resolve(r);
  };
}

// ---------------------------------------------------------------------------
// Import, étape 2
// ---------------------------------------------------------------------------

Deno.test("import Sophia seule : un appel, prompt stocké exact, valeurs inchangées", async () => {
  oublierSondeMultiApp();
  const base = new FausseBase({
    label_applications: [],
    applications: applications(),
    prompts: [{ cle: "pertinence", contenu: "PROMPT SOPHIA" }],
    contenu_labels: [contenuLabel("c1", "l1")],
    contenu_pertinences: [],
  });
  const appels: Appel[] = [];
  const r = await noterPertinenceImport(
    base.client(),
    { id: "c1", titre: "Titre TikTok" },
    "hook OCR",
    { scoreRelevance: espionScore([{ score: 72, reason: "culture" }], appels) },
  );
  assertEquals(appels, [{ caption: "Titre TikTok", hookText: "hook OCR", instructions: "PROMPT SOPHIA" }]);
  assertEquals(r, { fini: true, score: 72, raison: "culture", application: "sophia" });
  const lignes = base.table("contenu_pertinences");
  assertEquals(lignes.length, 1);
  assertEquals(lignes[0].application_id, ID_SOPHIA);
  assertEquals(lignes[0].score, 72);
  assertEquals(lignes[0].prompt_cle, "pertinence");
  assertEquals(lignes[0].angles, null);
  // Provisoire : Sophia éligible jusqu'à l'étape 4 (sens sûr).
  assertEquals(lignes[0].eligible, true);
});

Deno.test("import Sophia sans prompt stocké : consigne undefined (défaut de scoreRelevance)", async () => {
  oublierSondeMultiApp();
  const base = new FausseBase({
    label_applications: [],
    applications: applications(),
    prompts: [],
    contenu_labels: [],
    contenu_pertinences: [],
  });
  const appels: Appel[] = [];
  await noterPertinenceImport(base.client(), { id: "c1", titre: null }, "", {
    scoreRelevance: espionScore([{ score: 50, reason: "" }], appels),
  });
  assertEquals(appels.length, 1);
  assertStrictEquals(appels[0].instructions, undefined);
  assertEquals(appels[0].caption, "");
});

Deno.test("import Sophia + Unswipe : un appel par passage, max au dernier, prompts stockés tels quels", async () => {
  oublierSondeMultiApp();
  const base = new FausseBase({
    // Angles restés en base (colonne inutilisée) : jamais injectés.
    label_applications: [
      { label_id: "l1", application_id: ID_SOPHIA, angle: "vieil angle Sophia" },
      { label_id: "l1", application_id: ID_UNSWIPE, angle: "reprends ton temps" },
    ],
    applications: applications(),
    prompts: [
      { cle: "pertinence", contenu: "PROMPT SOPHIA" },
      { cle: "pertinence_unswipe", contenu: "PROMPT UNSWIPE" },
    ],
    contenu_labels: [contenuLabel("c1", "l1")],
    contenu_pertinences: [],
  });
  const appels: Appel[] = [];
  const score = espionScore([{ score: 40, reason: "moyen" }, { score: 81, reason: "écrans" }], appels);

  const p1 = await noterPertinenceImport(base.client(), { id: "c1", titre: "t" }, "h", {
    scoreRelevance: score,
  });
  assertEquals(p1, { fini: false, application: "sophia" });
  assertEquals(appels[0].instructions, "PROMPT SOPHIA");

  const p2 = await noterPertinenceImport(base.client(), { id: "c1", titre: "t" }, "h", {
    scoreRelevance: score,
  });
  assertEquals(p2, { fini: true, score: 81, raison: "moyen", application: "unswipe" });
  assertStrictEquals(appels[1].instructions, "PROMPT UNSWIPE");
  const unswipe = base.table("contenu_pertinences").find((l) => l.application_id === ID_UNSWIPE)!;
  assertEquals(unswipe.eligible, false);
  assertEquals(unswipe.prompt_cle, "pertinence_unswipe");
  assertStrictEquals(unswipe.angles, null);
  const sophia = base.table("contenu_pertinences").find((l) => l.application_id === ID_SOPHIA)!;
  assertStrictEquals(sophia.angles, null);

  // Reprise après coupure : tout est noté → finalisation sans Gemini.
  const p3 = await noterPertinenceImport(base.client(), { id: "c1", titre: "t" }, "h", {
    scoreRelevance: score,
  });
  assertEquals(p3, { fini: true, score: 81, raison: "moyen", application: null });
  assertEquals(appels.length, 2);
});

Deno.test("import : prompt Unswipe manquant → Sophia seule, aucune ligne Unswipe", async () => {
  oublierSondeMultiApp();
  const base = new FausseBase({
    label_applications: [
      { label_id: "l1", application_id: ID_SOPHIA },
      { label_id: "l1", application_id: ID_UNSWIPE },
    ],
    applications: applications(),
    prompts: [{ cle: "pertinence", contenu: "PROMPT SOPHIA" }],
    contenu_labels: [contenuLabel("c1", "l1")],
    contenu_pertinences: [],
  });
  const appels: Appel[] = [];
  const r = await noterPertinenceImport(base.client(), { id: "c1", titre: "t" }, "h", {
    scoreRelevance: espionScore([{ score: 63, reason: "ok" }], appels),
  });
  assertEquals(r, { fini: true, score: 63, raison: "ok", application: "sophia" });
  assertEquals(appels.map((a) => a.instructions), ["PROMPT SOPHIA"]);
  assertEquals(base.table("contenu_pertinences").map((l) => l.application_id), [ID_SOPHIA]);
});

// ---------------------------------------------------------------------------
// Import, étape 4
// ---------------------------------------------------------------------------

Deno.test("étape 4 : note par application, lignes déjà notées laissées telles quelles", async () => {
  oublierSondeMultiApp();
  const base = new FausseBase({
    label_applications: [],
    applications: applications(),
    contenu_pertinences: [
      { contenu_id: "c1", application_id: ID_SOPHIA, score: 40, note: null, eligible: true },
      { contenu_id: "c1", application_id: ID_UNSWIPE, score: 80, note: null, eligible: false },
      { contenu_id: "c2", application_id: ID_UNSWIPE, score: 10, note: 12, eligible: true },
    ],
  });
  const rapport = await majNotesPertinences(base.client(), "c1", {
    noteDe: (score) => score - 5,
    seuil: 55,
    force: false,
  });
  assertEquals(rapport, {
    sophia: { score: 40, note: 35, eligible: false },
    unswipe: { score: 80, note: 75, eligible: true },
  });
  const sophia = base.table("contenu_pertinences").find((l) =>
    l.contenu_id === "c1" && l.application_id === ID_SOPHIA
  )!;
  assertEquals([sophia.note, sophia.eligible], [35, false]);

  // Ligne déjà notée (ex. forcée) : pas recalculée.
  const r2 = await majNotesPertinences(base.client(), "c2", {
    noteDe: () => 99,
    seuil: 55,
    force: false,
  });
  assertEquals(r2, { unswipe: { score: 10, note: 12, eligible: true } });

  // Import forcé : éligible même sous le seuil.
  base.table("contenu_pertinences")[0].note = null;
  const r3 = await majNotesPertinences(base.client(), "c1", {
    noteDe: () => 1,
    seuil: 55,
    force: true,
  });
  assertEquals(r3.sophia, { score: 40, note: 1, eligible: true }, "Sophia : note brute, inchangée");

  // Import forcé, autre application : note planchée au seuil (même règle que
  // la note Sophia forcée, max(note, seuil)), donc même tier d'entrée.
  base.table("contenu_pertinences")[1].note = null;
  const r4 = await majNotesPertinences(base.client(), "c1", {
    noteDe: () => 1,
    seuil: 62,
    force: true,
  });
  assertEquals(r4.unswipe, { score: 80, note: 62, eligible: true });
  assertEquals(tierInitialDepuisNote(r4.unswipe.note), tierImport(Math.max(1, 62), 62), "B des deux côtés");
});

Deno.test("note stockée : plancher au seuil pour un import forcé hors Sophia seulement", () => {
  assertEquals(noteStockee(40, ID_UNSWIPE, 62, true), 62);
  assertEquals(noteStockee(70, ID_UNSWIPE, 62, true), 70, "au-dessus du seuil : inchangée");
  assertEquals(noteStockee(40, ID_UNSWIPE, 62, false), 40, "non forcé : note brute");
  assertEquals(noteStockee(40, ID_SOPHIA, 62, true), 40, "Sophia : note brute, toujours");
  assert(Number.isNaN(noteStockee(Number.NaN, ID_UNSWIPE, 62, true)));
});

// ---------------------------------------------------------------------------
// Rattrapage
// ---------------------------------------------------------------------------

function baseRattrapage(reglage: unknown, promptUnswipe: string | null = "PROMPT UNSWIPE") {
  return new FausseBase({
    // Angle resté en base (colonne inutilisée) : la consigne reste le prompt stocké.
    label_applications: [{ label_id: "l1", application_id: ID_UNSWIPE, angle: "reprends ton temps" }],
    applications: applications(),
    prompts: promptUnswipe ? [{ cle: "pertinence_unswipe", contenu: promptUnswipe }] : [],
    reglages: reglage === undefined
      ? []
      : [{ cle: CLE_BACKFILL_PERTINENCE, valeur: reglage, updated_at: "2026-10-02T00:00:00.000Z" }],
    contenu_pertinence_manquante: [
      { contenu_id: "vieux", application_id: ID_UNSWIPE, created_at: "2026-01-01" },
      { contenu_id: "neuf", application_id: ID_UNSWIPE, created_at: "2026-09-01" },
      { contenu_id: "sophia", application_id: ID_SOPHIA, created_at: "2026-09-30" },
    ],
    contenus: [
      {
        id: "neuf",
        titre: "titre neuf",
        langue_source: "en",
        vues_source: 5000,
        import_elo_force_seuil: false,
        statut: "valide",
        tier: "B",
        pertinence_score: 70,
      },
      {
        id: "vieux",
        titre: "titre vieux",
        langue_source: "fr",
        vues_source: 10,
        import_elo_force_seuil: true,
        statut: "valide",
        tier: "C",
        pertinence_score: 60,
      },
    ],
    contenu_langues: [
      {
        contenu_id: "neuf",
        langue: "en",
        slides: [{ position: 1, texte_overlay: "PUB", position_sophia: true }],
        slides_base: [{ position: 1, texte_overlay: "hook neuf", position_sophia: false }],
      },
    ],
    contenu_labels: [contenuLabel("neuf", "l1"), contenuLabel("vieux", "l1")],
    contenu_pertinences: [],
  });
}

function depsRattrapage(appels: Appel[], scores: Array<{ score: number; reason: string }>): DepsBackfill {
  return {
    scoreRelevance: espionScore(scores, appels),
    lireScoring: () =>
      Promise.resolve({ prior: 50, k: 1, poidsVues: 0.7, vuesPlafond: 80_000, eloSeuil: 55 }),
    noteImport: (o) => o.pertinence / 2,
    maintenant: () => Date.parse("2026-10-02T12:00:00Z"),
  };
}

Deno.test("rattrapage : note la file (plus récents d'abord) sans toucher aux contenus", async () => {
  oublierSondeMultiApp();
  const base = baseRattrapage({
    [ID_UNSWIPE]: { actif: true, demarre_at: "d", faits: 3, erreurs: 0 },
  });
  const contenusAvant = structuredClone(base.table("contenus"));
  const appels: Appel[] = [];
  const r = await tickBackfillPertinence(
    base.client(),
    depsRattrapage(appels, [{ score: 90, reason: "oui" }, { score: 20, reason: "non" }]),
  );
  assertEquals(r?.action, "backfill_pertinence");
  assertEquals(r?.faits, 2);
  // Lot pas plein : la file est vide, pas de rechaînage.
  assertEquals(r?.more, false);

  assertEquals(appels.map((a) => [a.caption, a.hookText, a.instructions]), [
    ["titre neuf", "hook neuf", "PROMPT UNSWIPE"],
    ["titre vieux", "", "PROMPT UNSWIPE"],
  ]);
  const lignes = base.table("contenu_pertinences");
  const neuf = lignes.find((l) => l.contenu_id === "neuf")!;
  assertEquals([neuf.score, neuf.note, neuf.eligible, neuf.prompt_cle], [90, 45, false, "pertinence_unswipe"]);
  assertStrictEquals(neuf.angles, null);
  // Import forcé : éligible malgré la note, note planchée au seuil (55) comme
  // la note Sophia d'un import forcé — le tier d'entrée (0270) en dépend.
  const vieux = lignes.find((l) => l.contenu_id === "vieux")!;
  assertEquals([vieux.note, vieux.eligible], [55, true]);
  // Jamais de ligne Sophia.
  assert(!lignes.some((l) => l.application_id === ID_SOPHIA));
  assertEquals(base.table("contenus"), contenusAvant);
  assert(!base.traces.some((t) => t.table === "contenus"));

  const etat = normaliserReglageBackfill(base.table("reglages")[0].valeur)[ID_UNSWIPE];
  assertEquals([etat.actif, etat.faits, etat.erreurs, etat.bail_jusqu_a], [true, 5, 0, null]);
  assertEquals(etat.dernier_at, "2026-10-02T12:00:00.000Z");
});

Deno.test("rattrapage : prompt de l'application manquant → campagne arrêtée, aucun appel", async () => {
  oublierSondeMultiApp();
  const base = baseRattrapage({ [ID_UNSWIPE]: { actif: true } }, null);
  const appels: Appel[] = [];
  const r = await tickBackfillPertinence(base.client(), depsRattrapage(appels, []));
  assertEquals(r?.action, "backfill_pertinence_arret");
  assertEquals(r?.more, false);
  assertEquals(appels.length, 0);
  assertEquals(base.table("contenu_pertinences").length, 0);
  const etat = normaliserReglageBackfill(base.table("reglages")[0].valeur)[ID_UNSWIPE];
  assertEquals([etat.actif, etat.erreurs], [false, 1]);
  assert(etat.derniere_erreur?.includes("pertinence_unswipe"));
});

Deno.test("rattrapage : rien d'allumé, bail tenu, ou 0256 absente → la main passe", async () => {
  oublierSondeMultiApp();
  const appels: Appel[] = [];
  assertEquals(await tickBackfillPertinence(baseRattrapage(undefined).client(), depsRattrapage(appels, [])), null);

  oublierSondeMultiApp();
  const tenu = baseRattrapage({
    [ID_UNSWIPE]: {
      actif: true,
      bail_jusqu_a: new Date(Date.parse("2026-10-02T12:00:00Z") + BAIL_BACKFILL_MS).toISOString(),
    },
  });
  assertEquals(await tickBackfillPertinence(tenu.client(), depsRattrapage(appels, [])), null);

  // Campagne allumée, file vide : ni bail ni écriture (la mise à jour des
  // sources garde son tick).
  oublierSondeMultiApp();
  const vide = baseRattrapage({ [ID_UNSWIPE]: { actif: true } });
  vide.tables.contenu_pertinence_manquante = [];
  assertEquals(await tickBackfillPertinence(vide.client(), depsRattrapage(appels, [])), null);
  assert(!vide.traces.some((t) => t.table === "reglages"));

  oublierSondeMultiApp();
  const sans0256 = baseRattrapage({ [ID_UNSWIPE]: { actif: true } });
  sans0256.pannes.set("label_applications", 'relation "label_applications" does not exist');
  assertEquals(await tickBackfillPertinence(sans0256.client(), depsRattrapage(appels, [])), null);
  assertEquals(appels.length, 0);
  oublierSondeMultiApp();
});

Deno.test("pilotage : Sophia refusée, prompt exigé, état avec le décompte exact de la file", async () => {
  oublierSondeMultiApp();
  const base = baseRattrapage(undefined);
  const client = base.client();

  const sophia = await piloterBackfillPertinence(client, ID_SOPHIA, true);
  assert(!sophia.ok);

  const inconnue = await piloterBackfillPertinence(client, ID_AUTRE, true);
  assert(!inconnue.ok);

  const on = await piloterBackfillPertinence(client, ID_UNSWIPE, true);
  assert(on.ok);
  assertEquals(on.etat.actif, true);
  assertEquals(on.etat.restants, 2);
  assert(on.etat.demarre_at);

  const off = await piloterBackfillPertinence(client, ID_UNSWIPE, false);
  assert(off.ok);
  assertEquals(off.etat.actif, false);
  assertEquals(off.etat.demarre_at, on.etat.demarre_at);

  const etat = await etatBackfillPertinence(client, ID_UNSWIPE);
  assert(etat.ok);
  assertEquals(etat.etat.restants, 2);

  const sansPrompt = baseRattrapage(undefined, null);
  const refus = await piloterBackfillPertinence(sansPrompt.client(), ID_UNSWIPE, true);
  assert(!refus.ok);
  assert(refus.erreur.includes("pertinence_unswipe"));
  assertEquals(sansPrompt.table("reglages").length, 0);
});

// ---------------------------------------------------------------------------
// Tiers par application (0270) : placement Sophia à l'import
// ---------------------------------------------------------------------------

Deno.test("placement Sophia : historique, partagé (score Sophia stocké), hors Sophia", () => {
  // Aucune ligne (stock historique, 0256 fraîche) : le chemin d'avant.
  assertEquals(placementSophiaDepuisLignes([]), { mode: "historique" });
  // Contenu Sophia seul : le chemin d'avant, à l'octet près.
  assertEquals(
    placementSophiaDepuisLignes([{ application_id: ID_SOPHIA, score: 72 }]),
    { mode: "historique" },
  );
  // Partagé : le rang Sophia vient du score SOPHIA, plus du max.
  assertEquals(
    placementSophiaDepuisLignes([
      { application_id: ID_UNSWIPE, score: 90 },
      { application_id: ID_SOPHIA, score: 41 },
    ]),
    { mode: "partage", scoreSophia: 41 },
  );
  // Score rendu en texte par PostgREST (numeric) : converti.
  assertEquals(
    placementSophiaDepuisLignes([{ application_id: ID_SOPHIA, score: "63" }, { application_id: ID_UNSWIPE, score: 10 }]),
    { mode: "partage", scoreSophia: 63 },
  );
  // Aucune ligne Sophia : labels qui ne servent qu'une autre application.
  assertEquals(
    placementSophiaDepuisLignes([{ application_id: ID_UNSWIPE, score: 80 }]),
    { mode: "hors_sophia" },
  );
});

Deno.test("placement Sophia : une lecture ratée LÈVE (le pas d'import est rejoué)", async () => {
  const base = new FausseBase({ contenu_pertinences: [] });
  base.pannes.set("contenu_pertinences", "connexion perdue");
  let leve = false;
  try {
    await placementSophiaImport(base.client(), "c1");
  } catch (e) {
    leve = true;
    assert(String((e as Error).message).includes("connexion perdue"));
  }
  assert(leve, "jamais un placement « historique » par défaut sur une panne");
  const ok = new FausseBase({
    contenu_pertinences: [
      { contenu_id: "c1", application_id: ID_SOPHIA, score: 50 },
      { contenu_id: "c1", application_id: ID_UNSWIPE, score: 80 },
      { contenu_id: "c2", application_id: ID_SOPHIA, score: 99 },
    ],
  });
  assertEquals(await placementSophiaImport(ok.client(), "c1"), { mode: "partage", scoreSophia: 50 });
});

// ---------------------------------------------------------------------------
// Rattrapage : même note que l'étape 4 de l'import (piste comprise)
// ---------------------------------------------------------------------------

const SCORING_PISTE = { prior: 50, k: 1, poidsVues: 0.7, vuesPlafond: 80_000, eloSeuil: 54, poidsSource: 0.45 };

function depsParite(appels: Appel[], scores: Array<{ score: number; reason: string }>, piste: number | null): DepsBackfill {
  return {
    scoreRelevance: espionScore(scores, appels),
    lireScoring: () => Promise.resolve(SCORING_PISTE),
    noteImport: eloParLangue,
    lirePisteSource: (id) => Promise.resolve(id === "src-1" ? piste : null),
    maintenant: () => Date.parse("2026-10-02T12:00:00Z"),
  };
}

function baseParite() {
  const base = baseRattrapage({ [ID_UNSWIPE]: { actif: true, demarre_at: "d", faits: 0, erreurs: 0 } });
  for (const c of base.table("contenus")) c.compte_reference_id = "src-1";
  // Un seul contenu dans la file, pour comparer une note à une note.
  base.tables.contenu_pertinence_manquante = base.table("contenu_pertinence_manquante")
    .filter((l) => l.contenu_id === "neuf");
  return base;
}

/** La note que l'étape 4 calcule pour un score donné (`noteDe` de executerPasImport). */
async function noteEtape4(score: number, piste: number | null): Promise<number> {
  oublierSondeMultiApp();
  const base = new FausseBase({
    label_applications: [],
    applications: applications(),
    passages: [],
    contenu_pertinences: [{ contenu_id: "neuf", application_id: ID_UNSWIPE, score, raison: "r", note: null, eligible: false }],
  });
  const rapport = await majNotesPertinences(base.client(), "neuf", {
    noteDe: (s) =>
      eloParLangue({
        pertinence: s,
        vues: 5000,
        langue: "en",
        langueSource: "en",
        prior: SCORING_PISTE.prior,
        k: SCORING_PISTE.k,
        poidsVues: SCORING_PISTE.poidsVues,
        vuesPlafond: SCORING_PISTE.vuesPlafond,
        pisteSource: piste,
        poidsSource: SCORING_PISTE.poidsSource,
      }),
    seuil: SCORING_PISTE.eloSeuil,
    force: false,
  });
  return Number(base.table("contenu_pertinences")[0].note ?? rapport.unswipe.note);
}

Deno.test("rattrapage : la note est CELLE de l'étape 4 (piste du compte source et poids compris)", async () => {
  oublierSondeMultiApp();
  const base = baseParite();
  const appels: Appel[] = [];
  const r = await tickBackfillPertinence(base.client(), depsParite(appels, [{ score: 90, reason: "oui" }], 80));
  assertEquals(r?.faits, 1);
  const ligne = base.table("contenu_pertinences").find((l) => l.contenu_id === "neuf")!;

  const attendue = await noteEtape4(90, 80);
  assertEquals(ligne.note, attendue);
  // Et la piste compte vraiment : sans elle, la note serait une autre.
  const sansPiste = await noteEtape4(90, null);
  assert(Math.abs(attendue - sansPiste) > 1e-6, "la piste doit peser dans la note");
  assertEquals(ligne.eligible, attendue >= SCORING_PISTE.eloSeuil);
  // Lecture de la source : compte_reference_id lu avec le contenu.
  assert(!base.traces.some((t) => t.table === "contenus"), "contenus jamais écrit");
});

Deno.test("rattrapage : source sans piste → terme de piste désactivé (la note d'avant 0264)", async () => {
  oublierSondeMultiApp();
  const base = baseParite();
  const appels: Appel[] = [];
  await tickBackfillPertinence(base.client(), depsParite(appels, [{ score: 90, reason: "oui" }], null));
  const ligne = base.table("contenu_pertinences").find((l) => l.contenu_id === "neuf")!;
  assertEquals(ligne.note, await noteEtape4(90, null));
  assertEquals(
    ligne.note,
    eloParLangue({
      pertinence: 90,
      vues: 5000,
      langue: "en",
      langueSource: "en",
      prior: 50,
      k: 1,
      poidsVues: 0.7,
      vuesPlafond: 80_000,
    }),
  );
});
