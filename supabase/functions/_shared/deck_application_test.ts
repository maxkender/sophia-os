/**
 * Deck d'une application non-Sophia : cache, refus métier, et la règle d'or —
 * ce module n'écrit JAMAIS `contenu_langues.slides` (le deck Sophia publié).
 *
 * Faux PostgREST en mémoire (tables = tableaux de lignes) qui journalise
 * chaque écriture, et fausse API Gemini qui compte ses appels : un refus
 * métier (cache, base polluée, prompt manquant) ne doit rien coûter.
 */

import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";

import {
  analyserSophiaBase,
  assurerDeckApplication,
  construireDeckPlace,
  motifConcurrenceRefusee,
} from "./deck_application.ts";
import { oublierSondeMultiApp } from "./applications_moteur.ts";
import { motifConcurrentApplication } from "./concurrents.ts";
import { ID_SOPHIA, type ApplicationMoteur } from "./multi_app.ts";
import type { SlideLangue } from "./import_contenu.ts";

type Ligne = Record<string, unknown>;

interface Ecriture {
  table: string;
  op: "insert" | "update" | "upsert";
  valeurs: Ligne;
}

interface Options {
  /** La sonde 0256 échoue (migration pas encore passée). */
  schemaAbsent?: boolean;
  /** L'insert de contenu_langues perd la course : 23505, la ligne existe déjà. */
  courseInsertion?: Ligne;
  /** La lecture des labels du contenu (pour l'angle) tombe en panne. */
  anglesEnPanne?: boolean;
}

/**
 * Faux client Supabase : juste ce que le module utilise (select / eq / in /
 * maybeSingle / single / insert / update / upsert), sur des tables en mémoire.
 */
function fauxClient(tables: Record<string, Ligne[]>, ecritures: Ecriture[], opts: Options = {}) {
  const from = (table: string) => {
    const filtres: Array<(l: Ligne) => boolean> = [];
    let op: "select" | "insert" | "update" | "upsert" = "select";
    let valeurs: Ligne = {};
    let conflit: string[] = [];
    let tete = false;
    let mode: "liste" | "un" | "unOuRien" = "liste";

    const lignes = () => (tables[table] ??= []);

    const executer = (): { data: unknown; error: unknown } => {
      if (table === "label_applications" && opts.schemaAbsent) {
        return { data: null, error: { message: 'relation "label_applications" does not exist' } };
      }
      if (table === "contenu_labels" && opts.anglesEnPanne) {
        return { data: null, error: { message: "connexion perdue" } };
      }
      let resultat: Ligne[] = [];
      if (op === "select") {
        resultat = lignes().filter((l) => filtres.every((f) => f(l)));
      } else if (op === "insert") {
        ecritures.push({ table, op, valeurs });
        if (table === "contenu_langues" && opts.courseInsertion) {
          lignes().push({ ...opts.courseInsertion });
          return { data: null, error: { code: "23505", message: "duplicate key value" } };
        }
        const ligne = { id: crypto.randomUUID(), ...valeurs };
        lignes().push(ligne);
        resultat = [ligne];
      } else if (op === "update") {
        ecritures.push({ table, op, valeurs });
        resultat = lignes().filter((l) => filtres.every((f) => f(l)));
        for (const l of resultat) Object.assign(l, valeurs);
      } else {
        ecritures.push({ table, op, valeurs });
        const existante = lignes().find((l) => conflit.every((c) => l[c] === valeurs[c]));
        if (existante) Object.assign(existante, valeurs);
        else lignes().push({ id: crypto.randomUUID(), ...valeurs });
      }
      if (tete) return { data: null, error: null };
      if (mode === "un") {
        return resultat[0]
          ? { data: resultat[0], error: null }
          : { data: null, error: { message: "0 ligne" } };
      }
      if (mode === "unOuRien") return { data: resultat[0] ?? null, error: null };
      return { data: resultat, error: null };
    };

    const maillon = {
      select: (_colonnes?: string, o?: { head?: boolean }) => {
        tete = Boolean(o?.head);
        return maillon;
      },
      eq: (colonne: string, valeur: unknown) => {
        filtres.push((l) => l[colonne] === valeur);
        return maillon;
      },
      in: (colonne: string, valeurs: unknown[]) => {
        filtres.push((l) => valeurs.includes(l[colonne]));
        return maillon;
      },
      order: () => maillon,
      limit: () => maillon,
      insert: (v: Ligne) => {
        op = "insert";
        valeurs = v;
        return maillon;
      },
      update: (v: Ligne) => {
        op = "update";
        valeurs = v;
        return maillon;
      },
      upsert: (v: Ligne, o?: { onConflict?: string }) => {
        op = "upsert";
        valeurs = v;
        conflit = (o?.onConflict ?? "id").split(",").map((c) => c.trim());
        return maillon;
      },
      single: () => {
        mode = "un";
        return maillon;
      },
      maybeSingle: () => {
        mode = "unOuRien";
        return maillon;
      },
      then: (
        ok?: (v: { data: unknown; error: unknown }) => unknown,
        ko?: (r: unknown) => unknown,
      ) => Promise.resolve(executer()).then(ok, ko),
    };
    return maillon;
  };

  // deno-lint-ignore no-explicit-any
  return { from } as any;
}

/**
 * Fausse API Gemini : répond selon le type de prompt (traduction, placement,
 * hashtags) et garde chaque prompt reçu.
 */
async function avecGemini<T>(fn: () => Promise<T>): Promise<{ resultat: T; prompts: string[] }> {
  const vraiFetch = globalThis.fetch;
  const avaitCle = Deno.env.get("GEMINI_API_KEY");
  const prompts: string[] = [];
  Deno.env.set("GEMINI_API_KEY", avaitCle ?? "cle-de-test");
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    const prompt: string = JSON.parse(String(init?.body)).contents[0].parts[0].text;
    prompts.push(prompt);
    let texte: string;
    if (prompt.includes("Application à placer")) {
      texte = JSON.stringify({
        chosen_position: 4,
        mode: "instructif",
        variants: ["3. die Unswipe-App hilft mir", "3. Unswipe hilft"],
        best: 0,
      });
    } else if (prompt.includes("Traduis chaque slide")) {
      const slides = [...prompt.matchAll(/^Slide (\d+) : "(.*)"$/gm)].map((m) => ({
        position: Number(m[1]),
        translated: `[de] ${m[2]}`,
      }));
      texte = JSON.stringify({ slides, hashtags: "#gewohnheiten #fokus #fyp" });
    } else {
      texte = JSON.stringify({ hashtags: "#a #b #c" });
    }
    return Promise.resolve(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texte }] } }] }), {
        status: 200,
      }),
    );
  }) as typeof fetch;
  try {
    return { resultat: await fn(), prompts };
  } finally {
    globalThis.fetch = vraiFetch;
    if (avaitCle === undefined) Deno.env.delete("GEMINI_API_KEY");
  }
}

const UNSWIPE: ApplicationMoteur = {
  id: "00000000-0000-4000-8000-000000000003",
  slug: "unswipe",
  nom: "Unswipe",
  langues: null,
  actif: true,
};

const slide = (position: number, texte: string, pub = false): SlideLangue => ({
  position,
  texte_overlay: texte,
  position_sophia: pub,
});

const BASE_FR = [
  slide(1, "5 habitudes pour arrêter de scroller"),
  slide(2, "1. téléphone hors de la chambre"),
  slide(3, "2. notifications coupées"),
  slide(4, "3. lecture avant de dormir"),
];

/** Un contenu source français, une ligne source propre, un prompt Unswipe. */
function monde(surcharge: Partial<Record<string, Ligne[]>> = {}): Record<string, Ligne[]> {
  return {
    contenus: [{
      id: "c1",
      titre: "#digitaldetox",
      langue_source: "fr",
      compte_reference_id: null,
      structure_slides: [],
    }],
    contenu_langues: [{
      id: "cl-fr",
      contenu_id: "c1",
      langue: "fr",
      slides: BASE_FR,
      slides_base: null,
      hashtags: "#fr1 #fr2 #fr3",
    }],
    contenu_langue_decks: [],
    prompts: [{ cle: "placement_unswipe", contenu: "Prompt maître Unswipe." }],
    contenu_labels: [{ contenu_id: "c1", label_id: "l1", labels: { id: "l1", slug: "clean-girl", nom: "Clean Girl" } }],
    label_applications: [{ label_id: "l1", application_id: UNSWIPE.id }],
    ...surcharge,
  };
}

/** La règle d'or, vérifiée après CHAQUE scénario. */
function aucuneEcritureDeSlides(ecritures: Ecriture[]) {
  for (const e of ecritures) {
    if (e.table !== "contenu_langues") continue;
    if (e.op === "insert") {
      // Création de la ligne langue, exactement comme le chemin Sophia.
      assertEquals(e.valeurs.slides, []);
      continue;
    }
    assert(!("slides" in e.valeurs), `contenu_langues.slides écrit : ${JSON.stringify(e.valeurs)}`);
  }
}

Deno.test("Sophia n'a rien à faire ici : erreur de programmation", async () => {
  oublierSondeMultiApp();
  const supabase = fauxClient(monde(), []);
  await assertRejects(() =>
    assurerDeckApplication(supabase, "c1", "fr", { ...UNSWIPE, id: ID_SOPHIA, slug: "sophia", nom: "Sophia" })
  );
});

Deno.test("schéma 0256 absent : échec franc, aucune lecture ni écriture de plus", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const supabase = fauxClient(monde(), ecritures, { schemaAbsent: true });
  const { resultat, prompts } = await avecGemini(() => assurerDeckApplication(supabase, "c1", "de", UNSWIPE));
  assertEquals(resultat, { statut: "echec", raison: "schéma multi-app absent" });
  assertEquals(prompts.length, 0);
  assertEquals(ecritures, []);
  oublierSondeMultiApp();
});

Deno.test("cache prêt : rendu tel quel, sans Gemini ni écriture", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const deck = [...BASE_FR.slice(0, 3), slide(4, "3. l'appli Unswipe m'aide", true)];
  const tables = monde({
    contenu_langue_decks: [{
      id: "d1",
      contenu_langue_id: "cl-fr",
      variante: "unswipe",
      statut: "pret",
      slides: deck,
      updated_at: new Date().toISOString(),
    }],
  });
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "fr", UNSWIPE)
  );
  assertEquals(resultat, { statut: "pret", slides: deck, hashtags: "#fr1 #fr2 #fr3" });
  assertEquals(prompts.length, 0);
  assertEquals(ecritures, []);
});

Deno.test("cache inéligible / échec récent : rendu sans recuisson", async () => {
  oublierSondeMultiApp();
  for (const statut of ["ineligible", "echec"] as const) {
    const ecritures: Ecriture[] = [];
    const tables = monde({
      contenu_langue_decks: [{
        contenu_langue_id: "cl-fr",
        variante: "unswipe",
        statut,
        raison: "motif en cache",
        slides: [],
        updated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      }],
    });
    const { resultat, prompts } = await avecGemini(() =>
      assurerDeckApplication(fauxClient(tables, ecritures), "c1", "fr", UNSWIPE)
    );
    assertEquals(resultat, { statut, raison: "motif en cache" });
    assertEquals(prompts.length, 0);
    assertEquals(ecritures, []);
  }
});

Deno.test("cache en échec depuis plus de 24 h : recuit", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const tables = monde({
    contenu_langue_decks: [{
      contenu_langue_id: "cl-fr",
      variante: "unswipe",
      statut: "echec",
      raison: "placement impossible",
      slides: [],
      updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    }],
  });
  const { resultat } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "fr", UNSWIPE)
  );
  assertEquals(resultat.statut, "pret");
  assertEquals(tables.contenu_langue_decks.length, 1, "upsert sur la même ligne");
  assertEquals(tables.contenu_langue_decks[0].statut, "pret");
  aucuneEcritureDeSlides(ecritures);
});

/**
 * Base source « polluée » : la pub Sophia a écrasé la slide 3 avant
 * `slides_base` (le cas des ≈ 110 contenus Unswipe refusés jusqu'au 14/10).
 */
const BASE_POLLUEE = [
  slide(1, "5 habitudes pour arrêter de scroller"),
  slide(2, "1. téléphone hors de la chambre"),
  slide(3, "2. une appli de micro-apprentissage comme l'appli Sophia", true),
  slide(4, "3. lecture avant de dormir"),
  slide(5, "4. marche sans écouteurs."),
];

Deno.test("base source polluée par la pub Sophia : la slide Sophia est imposée et remplacée", async () => {
  for (const langue of ["fr", "de"]) {
    oublierSondeMultiApp();
    const ecritures: Ecriture[] = [];
    const tables = monde({
      contenu_langues: [{
        id: "cl-fr",
        contenu_id: "c1",
        langue: "fr",
        slides: BASE_POLLUEE,
        slides_base: null,
        hashtags: "#fr1 #fr2 #fr3",
      }],
    });
    const { resultat, prompts } = await avecGemini(() =>
      assurerDeckApplication(fauxClient(tables, ecritures), "c1", langue, UNSWIPE)
    );

    assertEquals(resultat.statut, "pret", langue);
    if (resultat.statut !== "pret") return;
    // Le modèle répond 4 : la slide Sophia imposée l'emporte.
    assertEquals(resultat.slides.filter((s) => s.position_sophia).map((s) => s.position), [3]);
    assertEquals(resultat.slides[2].texte_overlay, "3. die Unswipe-App hilft mir");
    for (const s of resultat.slides) assert(!/sophia/i.test(s.texte_overlay ?? ""), s.texte_overlay ?? "");

    // Le modèle voit la slide Sophia telle quelle, pour la remplacer en entier.
    const placement = prompts.filter((p) => p.includes("Application à placer"));
    assertEquals(placement.length, 1);
    assertStringIncludes(placement[0], "La slide 3 cite une appli concurrente");
    assertStringIncludes(placement[0], "Position imposée : choisis la slide 3 UNIQUEMENT");

    const cache = tables.contenu_langue_decks[0];
    assertEquals(cache.statut, "pret");
    assertEquals((cache.placement as { positionImposee?: number }).positionImposee, 3);
    assertEquals((cache.placement as { chosenPosition: number }).chosenPosition, 3);
    // La base source (et le deck Sophia) ne sont pas touchés.
    assertEquals(tables.contenu_langues[0].slides, BASE_POLLUEE);
    aucuneEcritureDeSlides(ecritures);
  }
});

Deno.test("base polluée, langue cible : la base traduite garde la slide Sophia marquée", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const tables = monde({
    contenu_langues: [{
      id: "cl-fr",
      contenu_id: "c1",
      langue: "fr",
      slides: BASE_POLLUEE,
      slides_base: null,
      hashtags: "#fr",
    }],
  });
  await avecGemini(() => assurerDeckApplication(fauxClient(tables, ecritures), "c1", "de", UNSWIPE));
  const de = tables.contenu_langues.find((l) => l.langue === "de")!;
  const baseDe = de.slides_base as SlideLangue[];
  // La slide 3 reste l'emplacement de pub pour Unswipe ET micabo (cache partagé).
  assertEquals(baseDe.filter((s) => s.position_sophia).map((s) => s.position), [3]);
  aucuneEcritureDeSlides(ecritures);
});

Deno.test("base qui cite Sophia sans marquage, perdue par la traduction : position lue sur la source", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const source = BASE_POLLUEE.map((s) => slide(s.position, s.texte_overlay ?? ""));
  // La base allemande déjà traduite a perdu le nom (« eine App »).
  const baseDe = source.map((s) =>
    slide(s.position, `[de] ${(s.texte_overlay ?? "").replace(/l'appli Sophia/g, "eine App")}`)
  );
  const tables = monde({
    contenu_langues: [
      { id: "cl-fr", contenu_id: "c1", langue: "fr", slides: source, slides_base: null, hashtags: "#fr" },
      { id: "cl-de", contenu_id: "c1", langue: "de", slides: [], slides_base: baseDe, hashtags: "#de" },
    ],
  });
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "de", UNSWIPE)
  );
  assertEquals(resultat.statut, "pret");
  if (resultat.statut !== "pret") return;
  assertEquals(prompts.length, 1, "slides_base allemande déjà là : pas de traduction");
  assertStringIncludes(prompts[0], "La slide 3 cite une appli concurrente");
  assertEquals(resultat.slides.filter((s) => s.position_sophia).map((s) => s.position), [3]);
  aucuneEcritureDeSlides(ecritures);
});

Deno.test("base polluée sans légende : les hashtags ne voient pas la slide Sophia", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const tables = monde({
    contenu_langues: [{
      id: "cl-fr",
      contenu_id: "c1",
      langue: "fr",
      slides: BASE_POLLUEE,
      slides_base: null,
      hashtags: null,
    }],
  });
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "fr", UNSWIPE)
  );
  assertEquals(resultat.statut, "pret");
  const horsPlacement = prompts.filter((p) => !p.includes("Application à placer"));
  assert(horsPlacement.length > 0, "une légende a été générée");
  for (const p of horsPlacement) assert(!/sophia/i.test(p), "la légende ne doit pas partir de la slide Sophia");
  aucuneEcritureDeSlides(ecritures);
});

Deno.test("slide Sophia ET slide concurrente : inéligible (deux pubs), sans aucun appel modèle", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const base = [
    slide(1, "things that fixed my attention span"),
    slide(2, "1. phone out of the bedroom"),
    slide(3, "2. i installed opal to block tiktok"),
    slide(4, "3. the Sophia app teaches me something daily", true),
    slide(5, "4. morning walks"),
  ];
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(mondeEn(base), ecritures), "c1", "en", UNSWIPE)
  );
  assertEquals(resultat, { statut: "ineligible", raison: "une slide Sophia et une slide concurrente", cuit: true });
  assertEquals(prompts.length, 0);
});

Deno.test("analyserSophiaBase : une seule slide Sophia, hors couverture, avec du texte ailleurs", () => {
  assertEquals(analyserSophiaBase(BASE_FR), {});
  assertEquals(analyserSophiaBase(BASE_POLLUEE), { position: 3 });
  // Non marquée mais qui nomme Sophia (source qui faisait déjà sa promo).
  assertEquals(analyserSophiaBase([slide(1, "x"), slide(2, "merci SOPHIA"), slide(3, "y")]), { position: 2 });
  assertEquals(
    analyserSophiaBase([slide(1, "comment Sophia m'a rendue cultivée"), slide(2, "x")]),
    { refus: "couverture qui cite Sophia" },
  );
  assertEquals(
    analyserSophiaBase([slide(1, "x"), slide(2, "l'appli Sophia", true), slide(3, "merci Sophia")]),
    { refus: "plusieurs slides citent Sophia" },
  );
  assertEquals(
    analyserSophiaBase([slide(1, ""), slide(2, "l'appli Sophia", true)]),
    { refus: "aucun texte hors de la slide Sophia" },
  );
});

Deno.test("prompt placement_<slug> manquant : échec en cache, AUCUN appel Gemini", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const tables = monde({ prompts: [{ cle: "placement_sophia", contenu: "Prompt Sophia." }] });
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "de", UNSWIPE)
  );
  assertEquals(resultat, { statut: "echec", raison: "prompt placement_unswipe manquant", cuit: true });
  assertEquals(prompts.length, 0, "ni traduction ni placement sans prompt : jamais le texte Sophia");
  assertEquals(tables.contenu_langue_decks[0].statut, "echec");
  aucuneEcritureDeSlides(ecritures);
});

Deno.test("cuisson en langue cible : base traduite dans slides_base, deck placé dans le cache", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const tables = monde();
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "de", UNSWIPE)
  );

  assertEquals(resultat.statut, "pret");
  if (resultat.statut !== "pret") return;
  assertEquals(resultat.slides, [
    slide(1, "[de] 5 habitudes pour arrêter de scroller"),
    slide(2, "[de] 1. téléphone hors de la chambre"),
    slide(3, "[de] 2. notifications coupées"),
    slide(4, "3. die Unswipe-App hilft mir", true),
  ]);
  assertEquals(resultat.hashtags, "#gewohnheiten #fokus #fyp");

  // Ligne allemande créée comme Sophia, base SANS pub, slides Sophia intactes.
  const de = tables.contenu_langues.find((l) => l.langue === "de")!;
  assertEquals(de.slides, []);
  assertEquals((de.slides_base as SlideLangue[]).every((s) => !s.position_sophia), true);
  assertEquals(de.hashtags, "#gewohnheiten #fokus #fyp");
  // La ligne source est mise à l'abri (assurerSlidesBase), jamais réécrite.
  const fr = tables.contenu_langues.find((l) => l.langue === "fr")!;
  assertEquals(fr.slides, BASE_FR);
  assertEquals(fr.slides_base, BASE_FR);

  // Une traduction, un placement — sans angle de label, sans slide imposée.
  assertEquals(prompts.length, 2);
  assertStringIncludes(prompts[1], "Prompt maître Unswipe.");
  assert(!prompts[1].includes("Angle à donner"));
  assert(!prompts[1].includes("appli concurrente"));
  assert(!prompts[1].includes("Prompt Sophia"));

  const cache = tables.contenu_langue_decks[0];
  assertEquals(cache.statut, "pret");
  assertEquals(cache.langue, "de");
  assertEquals(cache.contenu_id, "c1");
  assertEquals(cache.contenu_langue_id, de.id);
  assertEquals(cache.placement, {
    mode: "instructif",
    variants: ["3. die Unswipe-App hilft mir", "3. Unswipe hilft"],
    bestIndex: 0,
    chosenPosition: 4,
    positionImposee: undefined,
    prompt_cle: "placement_unswipe",
  });
  aucuneEcritureDeSlides(ecritures);

  // Deuxième passage : tout vient du cache.
  oublierSondeMultiApp();
  const second = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "de", UNSWIPE)
  );
  // Même deck, mais servi par le cache : rien n'a été cuit cette fois.
  const { cuit: cuitPremier, ...sansCuit } = resultat;
  assertEquals(cuitPremier, true);
  assertEquals(second.resultat, sansCuit);
  assertEquals(second.prompts.length, 0);
});

/** 8 slides, « Opal » (concurrent d'Unswipe) en slide 3 seulement. */
const BASE_OPAL = [
  slide(1, "7 habitudes pour arrêter de scroller"),
  slide(2, "1. téléphone hors de la chambre"),
  slide(3, "2. j'ai installé Opal pour bloquer TikTok"),
  slide(4, "3. notifications coupées"),
  slide(5, "4. lecture avant de dormir"),
  slide(6, "5. marche sans écouteurs."),
  slide(7, "6. carnet du soir"),
  slide(8, "7. lumière du matin"),
];

Deno.test("concurrent Unswipe en slide 3 sur 8 : position imposée 3, deck final sans « Opal »", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const tables = monde({
    contenu_langues: [{
      id: "cl-fr",
      contenu_id: "c1",
      langue: "fr",
      slides: BASE_OPAL,
      slides_base: null,
      hashtags: "#fr1 #fr2 #fr3",
    }],
  });
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "fr", UNSWIPE)
  );

  assertEquals(resultat.statut, "pret");
  if (resultat.statut !== "pret") return;
  // Le modèle répond 4 : la slide concurrente imposée l'emporte.
  assertEquals(resultat.slides.filter((s) => s.position_sophia).map((s) => s.position), [3]);
  assertEquals(resultat.slides[2].texte_overlay, "3. die Unswipe-App hilft mir");
  assertEquals(resultat.slides[5].texte_overlay, "5. marche sans écouteurs.");
  for (const s of resultat.slides) assert(!/opal/i.test(s.texte_overlay ?? ""), s.texte_overlay ?? "");

  // Le modèle voit la slide concurrente telle quelle, pour la remplacer.
  assertEquals(prompts.length, 1);
  assertStringIncludes(prompts[0], "La slide 3 cite une appli concurrente");
  assertStringIncludes(prompts[0], `Slide 3 : "2. j'ai installé Opal pour bloquer TikTok"`);
  assertStringIncludes(prompts[0], `Slide 6 : "5. marche sans écouteurs."`);

  const cache = tables.contenu_langue_decks[0];
  assertEquals(cache.statut, "pret");
  assertEquals((cache.placement as { positionImposee?: number }).positionImposee, 3);
  assertEquals((cache.placement as { chosenPosition: number }).chosenPosition, 3);
  // La base source (et le deck Sophia) ne sont pas touchés.
  assertEquals(tables.contenu_langues[0].slides, BASE_OPAL);
  aucuneEcritureDeSlides(ecritures);

  // Cache : un deck propre est resservi tel quel.
  oublierSondeMultiApp();
  const second = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "fr", UNSWIPE)
  );
  assertEquals(second.prompts.length, 0);
  assertEquals(second.resultat.statut, "pret");
});

Deno.test("concurrent perdu par la traduction : position lue sur la base source", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  // La traduction a perdu le nom de la marque partout.
  const baseDe = BASE_OPAL.map((s) =>
    slide(s.position, `[de] ${(s.texte_overlay ?? "").replace(/Opal/g, "eine App")}`)
  );
  const tables = monde({
    contenu_langues: [
      { id: "cl-fr", contenu_id: "c1", langue: "fr", slides: BASE_OPAL, slides_base: null, hashtags: "#fr" },
      { id: "cl-de", contenu_id: "c1", langue: "de", slides: [], slides_base: baseDe, hashtags: "#de" },
    ],
  });
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "de", UNSWIPE)
  );
  assertEquals(resultat.statut, "pret");
  if (resultat.statut !== "pret") return;
  assertEquals(prompts.length, 1, "slides_base allemande déjà là : pas de traduction");
  assertStringIncludes(prompts[0], "La slide 3 cite une appli concurrente");
  assertEquals(resultat.slides.filter((s) => s.position_sophia).map((s) => s.position), [3]);
  for (const s of resultat.slides) assert(!/opal/i.test(s.texte_overlay ?? ""), s.texte_overlay ?? "");
  aucuneEcritureDeSlides(ecritures);
});

/**
 * Le cas du stock (contenu f20f0b64, EN) : la slide 4 finit par « (i use
 * unscroll) » coupé sur deux lignes, la slide 5 porte la carte App Store
 * d'Unscroll incrustée. Nettoyée ligne par ligne, la slide 5 partait en
 * « so instead of just scrolling / honestly cured my brain rot / content worth
 * your time / Open ».
 */
const BASE_DEUX_CONCURRENTES = [
  slide(1, "things that fixed my attention span"),
  slide(2, "1. phone out of the bedroom"),
  slide(3, "2. no notifications"),
  slide(4, "3. i swapped tiktok for articles (i use\nunscroll)"),
  slide(
    5,
    "so instead of just scrolling\nyou're finally reading, using unscroll has\nhonestly cured my brain rot\n\n" +
      "unscroll: the curated internet\ncontent worth your time\nOpen",
  ),
  slide(6, "4. morning walks"),
];

/** Une ligne source anglaise, sans hashtags, pour `base`. */
function mondeEn(base: SlideLangue[]) {
  return monde({
    contenus: [{ id: "c1", titre: "#focus", langue_source: "en", compte_reference_id: null, structure_slides: [] }],
    contenu_langues: [{ id: "cl-en", contenu_id: "c1", langue: "en", slides: base, slides_base: null, hashtags: null }],
  });
}

Deno.test("deux slides concurrentes (texte d'OCR) : inéligible, en cache, sans aucun appel modèle", async () => {
  for (const langue of ["en", "de"]) {
    oublierSondeMultiApp();
    const ecritures: Ecriture[] = [];
    const tables = mondeEn(BASE_DEUX_CONCURRENTES);
    const { resultat, prompts } = await avecGemini(() =>
      assurerDeckApplication(fauxClient(tables, ecritures), "c1", langue, UNSWIPE)
    );
    assertEquals(resultat, {
      statut: "ineligible",
      raison: "plusieurs slides citent un concurrent de l'application",
      cuit: true,
    });
    assertEquals(prompts.length, 0, "refus lu sur la base source : ni traduction ni placement");
    const cache = tables.contenu_langue_decks;
    assertEquals(cache.length, 1);
    assertEquals(cache[0].statut, "ineligible");
    aucuneEcritureDeSlides(ecritures);
  }
});

Deno.test("couverture qui cite un concurrent : inéligible (elle partait vide, sans accroche)", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const base = [
    slide(1, "how unscroll changed my screen time"),
    slide(2, "1. phone out of the bedroom"),
    slide(3, "2. no notifications"),
    slide(4, "3. morning walks"),
  ];
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(mondeEn(base), ecritures), "c1", "en", UNSWIPE)
  );
  assertEquals(resultat, {
    statut: "ineligible",
    raison: "couverture qui cite un concurrent de l'application",
    cuit: true,
  });
  assertEquals(prompts.length, 0);
});

Deno.test("slide concurrente seule à porter du texte : inéligible (le deck ne serait que la pub)", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const base = [slide(1, ""), slide(2, ""), slide(3, "i use opal")];
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(mondeEn(base), ecritures), "c1", "en", UNSWIPE)
  );
  assertEquals(resultat, { statut: "ineligible", raison: "aucun texte hors de la slide concurrente", cuit: true });
  assertEquals(prompts.length, 0);
});

Deno.test("traduction qui fait apparaître un second concurrent : inéligible, base de la langue en cause", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  // La base allemande déjà traduite nomme « die App Forest » en slide 4.
  const baseDe = BASE_OPAL.map((s) =>
    slide(s.position, s.position === 4 ? "3. die App Forest hilft" : `[de] ${s.texte_overlay}`)
  );
  const tables = monde({
    contenu_langues: [
      { id: "cl-fr", contenu_id: "c1", langue: "fr", slides: BASE_OPAL, slides_base: null, hashtags: "#fr" },
      { id: "cl-de", contenu_id: "c1", langue: "de", slides: [], slides_base: baseDe, hashtags: "#de" },
    ],
  });
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "de", UNSWIPE)
  );
  assertEquals(resultat, {
    statut: "ineligible",
    raison: "base de : plusieurs slides citent un concurrent de l'application",
    cuit: true,
  });
  assertEquals(prompts.length, 0);
  aucuneEcritureDeSlides(ecritures);
});

Deno.test("motifConcurrenceRefusee : une seule slide concurrente, hors couverture, avec du texte ailleurs", () => {
  const motif = motifConcurrentApplication("unswipe");
  assertEquals(motifConcurrenceRefusee(BASE_OPAL, 3, motif), null);
  assertEquals(motifConcurrenceRefusee(BASE_FR, undefined, motif), null, "sans concurrent : rien à refuser");
  assertEquals(
    motifConcurrenceRefusee(BASE_DEUX_CONCURRENTES, 4, motif),
    "plusieurs slides citent un concurrent de l'application",
  );
  // Le motif de Sophia ne voit pas Opal : la règle est celle de l'application.
  assertEquals(motifConcurrenceRefusee(BASE_DEUX_CONCURRENTES, undefined, motifConcurrentApplication("sophia")), null);
});

Deno.test("cache prêt qui cite un concurrent d'Unswipe : recuit", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const tables = monde({
    contenu_langue_decks: [{
      id: "d1",
      contenu_langue_id: "cl-fr",
      variante: "unswipe",
      statut: "pret",
      slides: [...BASE_FR.slice(0, 2), slide(3, "2. the forest app"), slide(4, "3. l'appli Unswipe m'aide", true)],
      updated_at: new Date().toISOString(),
    }],
  });
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "fr", UNSWIPE)
  );
  assertEquals(resultat.statut, "pret");
  assertEquals(prompts.length, 1, "recuit : un placement");
  aucuneEcritureDeSlides(ecritures);
});

Deno.test("course à la création de la ligne langue : on relit au lieu d'échouer", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const tables = monde();
  const supabase = fauxClient(tables, ecritures, {
    courseInsertion: {
      id: "cl-de",
      contenu_id: "c1",
      langue: "de",
      slides: [],
      slides_base: [slide(1, "basis"), slide(2, "eins"), slide(3, "zwei"), slide(4, "drei")],
      hashtags: "#de",
    },
  });
  const { resultat, prompts } = await avecGemini(() => assurerDeckApplication(supabase, "c1", "de", UNSWIPE));
  assertEquals(resultat.statut, "pret");
  assertEquals(prompts.length, 1, "slides_base de la ligne cible déjà là : pas de traduction");
  if (resultat.statut === "pret") assertEquals(resultat.hashtags, "#de");
  aucuneEcritureDeSlides(ecritures);
});

Deno.test("deck placé : une seule slide pub, jamais la couverture, jamais Sophia", () => {
  const base = BASE_FR;
  assertEquals(construireDeckPlace(base, 1, "Unswipe"), null);
  assertEquals(construireDeckPlace(base, 9, "Unswipe"), null);
  assertEquals(construireDeckPlace(base, 4, "Unswipe et Sophia"), null);
  const deck = construireDeckPlace(base, 3, "2. Unswipe coupe tout")!;
  assertEquals(deck.filter((s) => s.position_sophia).map((s) => s.position), [3]);
  assertEquals(deck[2].texte_overlay, "2. Unswipe coupe tout");
});

Deno.test("langue hors langues cibles : échec, rien de créé", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const { resultat } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(monde(), ecritures), "c1", "xx", UNSWIPE)
  );
  assertEquals(resultat, { statut: "echec", raison: "langue xx hors langues cibles" });
  assertEquals(ecritures, []);
});

/* -------------------------------------------------------------------------
 * Contenus livrés par un pod (0276) : jamais de cuisson. Seul le deck fourni
 * par le pod pour l'application est servi ; sinon inéligible, sans écrire.
 * ---------------------------------------------------------------------- */

const DECK_LIVRE_UNSWIPE = [
  { position: 1, media_id: "m-fr-1", texte_overlay: "", position_sophia: false },
  { position: 2, media_id: "m-unswipe-2", texte_overlay: "", position_sophia: true },
];

/** Contenu livré : images finies dans contenu_langues (fr), deck Unswipe fourni ou non. */
function mondeLivre(avecDeck: boolean): Record<string, Ligne[]> {
  return monde({
    contenus: [{ id: "c1", titre: "#pod", langue_source: "fr", compte_reference_id: null, structure_slides: [], livre: true }],
    contenu_langues: [{
      id: "cl-fr",
      contenu_id: "c1",
      langue: "fr",
      slides: [
        { position: 1, media_id: "m-fr-1", texte_overlay: "", position_sophia: false },
        { position: 2, media_id: "m-fr-2", texte_overlay: "", position_sophia: true },
      ],
      slides_base: null,
      hashtags: "#livre #fr",
    }],
    contenu_langue_decks: avecDeck
      ? [{
        id: "d-pod",
        contenu_langue_id: "cl-fr",
        contenu_id: "c1",
        langue: "fr",
        variante: "unswipe",
        statut: "pret",
        slides: DECK_LIVRE_UNSWIPE,
        placement: { origine: "pod" },
        updated_at: new Date().toISOString(),
      }]
      : [],
  });
}

Deno.test("contenu livré avec deck Unswipe fourni : servi tel quel (media_id), sans Gemini ni écriture", async () => {
  for (const ignorerCache of [false, true]) {
    oublierSondeMultiApp();
    const ecritures: Ecriture[] = [];
    const { resultat, prompts } = await avecGemini(() =>
      assurerDeckApplication(fauxClient(mondeLivre(true), ecritures), "c1", "fr", UNSWIPE, { ignorerCache })
    );
    assertEquals(resultat, { statut: "pret", slides: DECK_LIVRE_UNSWIPE, hashtags: "#livre #fr", cuit: false });
    assertEquals(prompts.length, 0);
    assertEquals(ecritures, []);
  }
});

Deno.test("contenu livré sans deck Unswipe : inéligible, aucune écriture (ni cache, ni ligne langue), sans Gemini", async () => {
  for (const [langue, ignorerCache] of [["fr", false], ["fr", true], ["de", false]] as const) {
    oublierSondeMultiApp();
    const ecritures: Ecriture[] = [];
    const tables = mondeLivre(false);
    const { resultat, prompts } = await avecGemini(() =>
      assurerDeckApplication(fauxClient(tables, ecritures), "c1", langue, UNSWIPE, { ignorerCache })
    );
    assertEquals(resultat, { statut: "ineligible", raison: `contenu livré : pas de deck unswipe en ${langue}` });
    assertEquals(prompts.length, 0);
    assertEquals(ecritures, []);
    assertEquals(tables.contenu_langues.length, 1, "aucune ligne langue créée");
  }
});

Deno.test("contenu NON livré (livre: false) : chemin d'avant, cache prêt servi", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const deck = [...BASE_FR.slice(0, 3), slide(4, "3. l'appli Unswipe m'aide", true)];
  const tables = monde({
    contenus: [{ id: "c1", titre: "#digitaldetox", langue_source: "fr", compte_reference_id: null, structure_slides: [], livre: false }],
    contenu_langue_decks: [{
      contenu_langue_id: "cl-fr",
      variante: "unswipe",
      statut: "pret",
      slides: deck,
      updated_at: new Date().toISOString(),
    }],
  });
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "fr", UNSWIPE)
  );
  assertEquals(resultat, { statut: "pret", slides: deck, hashtags: "#fr1 #fr2 #fr3" });
  assertEquals(prompts.length, 0);
  assertEquals(ecritures, []);
});

// ---------------------------------------------------------------------------
// Angle de placement (label × application) : angle_placement.ts
// ---------------------------------------------------------------------------

const ANGLE = "insister sur le temps récupéré pour ses études";

/** Le prompt de placement parmi ceux reçus par la fausse API. */
const promptPlacement = (prompts: string[]) => prompts.find((p) => p.includes("Application à placer")) ?? "";

Deno.test("angle du label pour Unswipe : juste après le prompt maître, gardé dans le placement du deck", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const tables = monde({
    label_applications: [
      { label_id: "l1", application_id: UNSWIPE.id, angle: `  ${ANGLE}\n` },
      { label_id: "l1", application_id: ID_SOPHIA, angle: "angle Sophia, jamais pour Unswipe" },
    ],
  });
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "fr", UNSWIPE)
  );
  assertEquals(resultat.statut, "pret");
  const prompt = promptPlacement(prompts);
  assertStringIncludes(
    prompt,
    `Prompt maître Unswipe.\n\n--- CONSIGNE PROPRE À CE SLIDESHOW ---\n${ANGLE}\n`,
  );
  assert(prompt.indexOf("--- CONSIGNE PROPRE") < prompt.indexOf("--- DONNÉES ---"));
  assert(!prompt.includes("angle Sophia"), "l'angle d'une autre application ne fuit pas");
  const placement = tables.contenu_langue_decks[0].placement as Record<string, unknown>;
  assertEquals(placement.angle, ANGLE);
  aucuneEcritureDeSlides(ecritures);
});

Deno.test("aucun angle pour cette application : prompt sans consigne, placement sans clé angle", async () => {
  oublierSondeMultiApp();
  for (const angle of [undefined, null, "", "   "]) {
    const tables = monde({
      label_applications: [{ label_id: "l1", application_id: UNSWIPE.id, angle }],
    });
    const { resultat, prompts } = await avecGemini(() =>
      assurerDeckApplication(fauxClient(tables, []), "c1", "fr", UNSWIPE)
    );
    assertEquals(resultat.statut, "pret");
    const prompt = promptPlacement(prompts);
    assert(!prompt.includes("CONSIGNE PROPRE"), `angle ${JSON.stringify(angle)} : aucune consigne`);
    assertStringIncludes(prompt, "Prompt maître Unswipe.\n\n--- DONNÉES ---");
    const placement = tables.contenu_langue_decks[0].placement as Record<string, unknown>;
    assert(!("angle" in placement), "placement écrit comme avant l'angle");
  }
});

Deno.test("angle d'un label système : ignoré", async () => {
  oublierSondeMultiApp();
  const tables = monde({
    contenu_labels: [{ contenu_id: "c1", label_id: "h", labels: { id: "h", slug: "hook", nom: "hook" } }],
    label_applications: [{ label_id: "h", application_id: UNSWIPE.id, angle: ANGLE }],
  });
  const { prompts } = await avecGemini(() => assurerDeckApplication(fauxClient(tables, []), "c1", "fr", UNSWIPE));
  assert(!promptPlacement(prompts).includes("CONSIGNE PROPRE"));
});

Deno.test("test à blanc : l'angle brouillon remplace l'angle enregistré, '' essaie sans angle", async () => {
  oublierSondeMultiApp();
  const enregistre = () =>
    monde({ label_applications: [{ label_id: "l1", application_id: UNSWIPE.id, angle: ANGLE }] });

  const brouillon = enregistre();
  const essai = await avecGemini(() =>
    assurerDeckApplication(fauxClient(brouillon, []), "c1", "fr", UNSWIPE, {
      ignorerCache: true,
      angleBrouillon: " montrer la fierté d'avoir tenu une semaine ",
    })
  );
  const prompt = promptPlacement(essai.prompts);
  assertStringIncludes(prompt, "--- CONSIGNE PROPRE À CE SLIDESHOW ---\nmontrer la fierté d'avoir tenu une semaine\n");
  assert(!prompt.includes(ANGLE), "l'angle enregistré n'est pas lu");
  assertEquals(
    (brouillon.contenu_langue_decks[0].placement as Record<string, unknown>).angle,
    "montrer la fierté d'avoir tenu une semaine",
  );

  const sansAngle = enregistre();
  const essaiVide = await avecGemini(() =>
    assurerDeckApplication(fauxClient(sansAngle, []), "c1", "fr", UNSWIPE, { ignorerCache: true, angleBrouillon: "" })
  );
  assert(!promptPlacement(essaiVide.prompts).includes("CONSIGNE PROPRE"));
});

Deno.test("lecture de l'angle en panne : deck préparé sans angle, rien ne casse", async () => {
  oublierSondeMultiApp();
  const tables = monde({ label_applications: [{ label_id: "l1", application_id: UNSWIPE.id, angle: ANGLE }] });
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, [], { anglesEnPanne: true }), "c1", "fr", UNSWIPE)
  );
  assertEquals(resultat.statut, "pret");
  assert(!promptPlacement(prompts).includes("CONSIGNE PROPRE"));
});

Deno.test("deck prêt en cache : un angle saisi après coup ne le recuit pas (prochaines préparations seulement)", async () => {
  oublierSondeMultiApp();
  const ecritures: Ecriture[] = [];
  const deck = [...BASE_FR.slice(0, 3), slide(4, "3. l'appli Unswipe m'aide", true)];
  const tables = monde({
    label_applications: [{ label_id: "l1", application_id: UNSWIPE.id, angle: ANGLE }],
    contenu_langue_decks: [{
      contenu_langue_id: "cl-fr",
      variante: "unswipe",
      statut: "pret",
      slides: deck,
      updated_at: new Date().toISOString(),
    }],
  });
  const { resultat, prompts } = await avecGemini(() =>
    assurerDeckApplication(fauxClient(tables, ecritures), "c1", "fr", UNSWIPE)
  );
  assertEquals(resultat, { statut: "pret", slides: deck, hashtags: "#fr1 #fr2 #fr3" });
  assertEquals(prompts.length, 0);
  assertEquals(ecritures, []);
});
