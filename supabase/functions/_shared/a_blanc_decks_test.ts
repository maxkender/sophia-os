/**
 * Test à blanc — fidélité des decks à travers l'intercepteur.
 *
 * Les VRAIES fonctions de deck (`assurerDeckPourLangue`,
 * `assurerDeckApplication`), appelées par l'enveloppe du test à blanc, sur un
 * faux PostgREST en lecture seule PIÉGÉ et un faux modèle.
 */

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";

import { decksAssignation } from "./assignation_contenu.ts";
import { envelopperDecksABlanc } from "./a_blanc_decks.ts";
import { type ContexteABlanc, creerContexteABlanc, executerDansContexte } from "./a_blanc_intercepteur.ts";
import { avecIntercepteur, fauxGemini, fauxServeurPostgrest, instantane } from "./a_blanc_test_utils.ts";
import { ID_SOPHIA, type ApplicationMoteur } from "./multi_app.ts";
import { serviceClient } from "./supabase.ts";

const UNSWIPE = "00000000-0000-4000-8000-0000000000aa";
const APP: ApplicationMoteur = { id: UNSWIPE, slug: "unswipe", nom: "Unswipe", langues: null, actif: true };

const SOURCE = [
  { position: 1, texte_overlay: "trois habitudes", position_sophia: false },
  { position: 2, texte_overlay: "lire chaque soir", position_sophia: false },
  { position: 3, texte_overlay: "noter une idée", position_sophia: false },
];

function base(extra: Record<string, unknown[]> = {}) {
  return {
    contenus: [{
      id: "c1",
      titre: "Titre",
      langue_source: "fr",
      compte_reference_id: null,
      structure_slides: [],
      pod: null,
      livre: false,
    }],
    contenu_langues: [{ id: "cl-fr", contenu_id: "c1", langue: "fr", slides: SOURCE, slides_base: null, hashtags: "#fr" }],
    prompts: [
      { cle: "placement_sophia", contenu: "Place Sophia." },
      { cle: "placement_unswipe", contenu: "Place Unswipe." },
    ],
    corrections: [],
    comptes_reference: [],
    contenu_langue_decks: [],
    label_applications: [{ label_id: "L1", application_id: ID_SOPHIA }],
    applications: [{ id: ID_SOPHIA, slug: "sophia", nom: "Sophia", langues: null, actif: true }],
    passages: [{ id: "p0", application_id: ID_SOPHIA }],
    ...extra,
  };
}

const traductionEtPlacement = (prompt: string): string => {
  if (prompt.includes('"translated"')) {
    return JSON.stringify({
      slides: [
        { position: 1, translated: "drei Gewohnheiten" },
        { position: 2, translated: "jeden Abend lesen" },
        { position: 3, translated: "eine Idee notieren" },
      ],
      hashtags: "#lernen #lesen #ideen",
    });
  }
  if (prompt.includes("chosen_position")) {
    return JSON.stringify({ chosen_position: 3, mode: "instructif", variants: ["eine Idee in der Sophia-App notieren"], best: 0 });
  }
  return '{"hashtags":"#a #b #c"}';
};

async function avecDecks<T>(fn: () => Promise<T>): Promise<T> {
  const restaurer = envelopperDecksABlanc();
  try {
    return await fn();
  } finally {
    restaurer();
  }
}

const run = (ia: boolean): ContexteABlanc => creerContexteABlanc({ nature: "run", ia });

Deno.test("Sophia, IA cochée, ligne absente : vrai deck traduit + placé, relu par le calque, rien d'écrit", async () => {
  const tables = base();
  const avant = instantane(tables);
  const gemini = fauxGemini(traductionEtPlacement);
  const serveur = fauxServeurPostgrest(tables, { gemini });
  await avecIntercepteur(serveur.fetch, () =>
    avecDecks(async () => {
      const ctx = run(true);
      const deck = await executerDansContexte(ctx, async () => await decksAssignation.sophia(serviceClient(), "c1", "de"));
      assertEquals(deck.slides.map((s) => s.texte_overlay), [
        "drei Gewohnheiten",
        "jeden Abend lesen",
        "eine Idee in der Sophia-App notieren",
      ]);
      assertEquals(deck.slides.filter((s) => s.position_sophia).map((s) => s.position), [3], "UNE slide pub");
      assertEquals(deck.hashtags, "#lernen #lesen #ideen");
      assertEquals(gemini.appels.length, 2, "traduction puis placement");
      const ops = ctx.etat.journal.map((e) => `${e.operation} ${e.table}`);
      assertEquals(ops[0], "insert contenu_langues");
      assert(ops.slice(1).every((o) => o === "update contenu_langues"), ops.join(", "));
      assertEquals(ctx.etat.decks.map((n) => [n.origine, n.appelsIA.autorises]), [["cuit_ia", 2]]);
    })
  );
  assertEquals(serveur.violations, []);
  assertEquals(tables, avant);
});

Deno.test("Sophia, IA décochée, deck absent : aperçu « à fabriquer » (texte source, sans pub), aucun appel, < 1 s", async () => {
  const tables = base();
  const avant = instantane(tables);
  const serveur = fauxServeurPostgrest(tables);
  await avecIntercepteur(serveur.fetch, () =>
    avecDecks(async () => {
      const ctx = run(false);
      const debut = Date.now();
      const deck = await executerDansContexte(ctx, async () => await decksAssignation.sophia(serviceClient(), "c1", "de"));
      assert(Date.now() - debut < 1000);
      assertEquals(deck.slides.map((s) => s.texte_overlay), SOURCE.map((s) => s.texte_overlay));
      assert(deck.slides.every((s) => !s.position_sophia));
      assertEquals(ctx.etat.compteurIA, { autorises: 0, bloques: 0 });
      assertEquals(ctx.etat.journal, [], "l'aperçu ne simule même pas d'écriture");
      const [note] = ctx.etat.decks;
      assertEquals(note.origine, "a_fabriquer");
      assertEquals(note.besoin, "traduction de + placement Sophia");
      assert(note.fabrication?.some((f) => f.startsWith("INSERT contenu_langues")));
    })
  );
  assertEquals(serveur.violations, []);
  assertEquals(tables, avant);
});

Deno.test("Sophia, IA décochée : original de pod — aperçu = deck du pod, slide Sophia repérée", async () => {
  const pod = [
    { position: 1, texte_overlay: "accroche", position_sophia: false },
    { position: 2, texte_overlay: "avec l'appli Sophia", position_sophia: true },
  ];
  const tables = base({
    contenus: [{ id: "c1", titre: "T", langue_source: "fr", pod: "page-blanche", livre: false, structure_slides: [] }],
    contenu_langues: [{ id: "cl-fr", contenu_id: "c1", langue: "fr", slides: pod, slides_base: SOURCE, hashtags: null }],
  });
  const serveur = fauxServeurPostgrest(tables);
  await avecIntercepteur(serveur.fetch, () =>
    avecDecks(async () => {
      const ctx = run(false);
      const deck = await executerDansContexte(ctx, async () => await decksAssignation.sophia(serviceClient(), "c1", "en"));
      assertEquals(deck.slides.filter((s) => s.position_sophia).map((s) => s.position), [2]);
      assertEquals(ctx.etat.decks[0].besoin, "traduction en (deck du pod, slide Sophia comprise)");
    })
  );
  assertEquals(serveur.violations, []);
});

Deno.test("Sophia, IA décochée : mêmes refus que le vrai code (source vide, langue hors cibles, contenu absent)", async () => {
  const tables = base({
    contenu_langues: [{ id: "cl-fr", contenu_id: "c1", langue: "fr", slides: [], slides_base: null, hashtags: null }],
  });
  const serveur = fauxServeurPostgrest(tables);
  await avecIntercepteur(serveur.fetch, () =>
    avecDecks(async () => {
      const ctx = run(false);
      await executerDansContexte(ctx, async () => {
        const supabase = serviceClient();
        await assertRejects(() => decksAssignation.sophia(supabase, "c1", "de"), Error, "Deck langue source vide — impossible de traduire");
        await assertRejects(() => decksAssignation.sophia(supabase, "c1", "xx"), Error, "Langue xx hors langues cibles");
        await assertRejects(() => decksAssignation.sophia(supabase, "inconnu", "de"), Error, "Contenu introuvable");
      });
      assertEquals(ctx.etat.decks.map((n) => n.origine), ["echec", "echec", "echec"]);
    })
  );
  assertEquals(serveur.violations, []);
});

Deno.test("Sophia, IA décochée, deck prêt sans hashtags : vrai deck, hashtags IA bloqués (repli statique)", async () => {
  const pret = [
    { position: 1, texte_overlay: "a", position_sophia: false },
    { position: 2, texte_overlay: "b Sophia", position_sophia: true },
  ];
  const tables = base({
    contenu_langues: [
      { id: "cl-fr", contenu_id: "c1", langue: "fr", slides: SOURCE, slides_base: null, hashtags: null },
      { id: "cl-de", contenu_id: "c1", langue: "de", slides: pret, slides_base: null, hashtags: null },
    ],
  });
  const serveur = fauxServeurPostgrest(tables);
  await avecIntercepteur(serveur.fetch, () =>
    avecDecks(async () => {
      const ctx = run(false);
      const debut = Date.now();
      const deck = await executerDansContexte(ctx, async () => await decksAssignation.sophia(serviceClient(), "c1", "de"));
      assert(Date.now() - debut < 1000, "aucune reprise du modèle");
      assertEquals(deck.slides, pret);
      assertEquals(deck.hashtags, "");
      assertEquals([ctx.etat.decks[0].origine, ctx.etat.decks[0].hashtagsIA], ["existant", "bloques"]);
      assertEquals(ctx.etat.compteurIA.autorises, 0);
    })
  );
  assertEquals(serveur.violations, []);
});

Deno.test("Application, IA décochée : cache prêt → vrai deck ; base polluée → refusé comme la nuit", async () => {
  const deckUnswipe = [
    { position: 1, texte_overlay: "trois habitudes", position_sophia: false },
    { position: 2, texte_overlay: "avec Unswipe", position_sophia: true },
  ];
  const tables = base({
    contenu_langues: [
      { id: "cl-fr", contenu_id: "c1", langue: "fr", slides: SOURCE, slides_base: null, hashtags: "#fr" },
      { id: "cl-fr2", contenu_id: "c2", langue: "fr", slides: [{ position: 1, texte_overlay: "x", position_sophia: true }], slides_base: null, hashtags: null },
    ],
    contenus: [
      { id: "c1", titre: "T", langue_source: "fr", compte_reference_id: null, structure_slides: [] },
      { id: "c2", titre: "T2", langue_source: "fr", compte_reference_id: null, structure_slides: [] },
    ],
    contenu_langue_decks: [{
      id: "d1",
      contenu_langue_id: "cl-fr",
      variante: "unswipe",
      statut: "pret",
      raison: null,
      slides: deckUnswipe,
      updated_at: new Date().toISOString(),
    }],
  });
  const avant = instantane(tables);
  const serveur = fauxServeurPostgrest(tables);
  await avecIntercepteur(serveur.fetch, () =>
    avecDecks(async () => {
      const ctx = run(false);
      await executerDansContexte(ctx, async () => {
        const supabase = serviceClient();
        const pret = await decksAssignation.application(supabase, "c1", "fr", APP, {});
        assertEquals(pret.statut, "pret");
        assert(pret.statut === "pret" && pret.slides[1].texte_overlay === "avec Unswipe");
        const refuse = await decksAssignation.application(supabase, "c2", "fr", APP, {});
        assertEquals(refuse, { statut: "ineligible", raison: "base polluée par une pub Sophia", cuit: true });
      });
      assertEquals(ctx.etat.decks.map((n) => n.origine), ["existant", "refuse"]);
      // La nuit met le refus en cache : simulé, jamais écrit.
      assert(ctx.etat.journal.some((e) => e.table === "contenu_langue_decks" && e.operation === "upsert"));
    })
  );
  assertEquals(serveur.violations, []);
  assertEquals(tables, avant);
});

Deno.test("Application, IA décochée, cuisson requise : aperçu prêt « à fabriquer », aucun appel IA, aucun cache", async () => {
  const tables = base();
  const avant = instantane(tables);
  const serveur = fauxServeurPostgrest(tables);
  await avecIntercepteur(serveur.fetch, () =>
    avecDecks(async () => {
      const ctx = run(false);
      const r = await executerDansContexte(ctx, async () =>
        await decksAssignation.application(serviceClient(), "c1", "de", APP, { echeance: Date.now() + 60_000 })
      );
      assertEquals(r.statut, "pret");
      assert(r.statut === "pret" && r.slides.every((s) => !s.position_sophia));
      assertEquals(r.statut === "pret" ? r.slides.map((s) => s.texte_overlay) : [], SOURCE.map((s) => s.texte_overlay));
      assertEquals(ctx.etat.compteurIA, { autorises: 0, bloques: 0 });
      assert(!ctx.etat.journal.some((e) => e.table === "contenu_langue_decks"), "pas de cache");
      const [note] = ctx.etat.decks;
      assertEquals([note.origine, note.besoin], ["a_fabriquer", "traduction de + placement Unswipe"]);
    })
  );
  assertEquals(serveur.violations, []);
  assertEquals(tables, avant);
});

Deno.test("Application : échéance du lot déjà dépassée → « budget », comme la nuit", async () => {
  const serveur = fauxServeurPostgrest(base());
  await avecIntercepteur(serveur.fetch, () =>
    avecDecks(async () => {
      const ctx = run(false);
      const r = await executerDansContexte(ctx, async () =>
        await decksAssignation.application(serviceClient(), "c1", "de", APP, { echeance: Date.now() - 1000 })
      );
      assertEquals(r, { statut: "echec", raison: "budget", cuit: false });
      assertEquals(ctx.etat.decks[0].origine, "budget");
    })
  );
  assertEquals(serveur.violations, []);
});

Deno.test("enveloppe : restaurée intacte, idempotente, transparente hors contexte", async () => {
  const avant = { ...decksAssignation };
  const restaurer = envelopperDecksABlanc();
  assert(decksAssignation.sophia !== avant.sophia);
  const rien = envelopperDecksABlanc();
  rien();
  assert(decksAssignation.sophia !== avant.sophia, "le second appel ne fait rien");
  restaurer();
  assertEquals(decksAssignation.sophia, avant.sophia);
  assertEquals(decksAssignation.application, avant.application);

  // Hors contexte : la fonction d'origine (dont chaque requête est bloquée).
  const cible = {
    sophia: () => Promise.resolve({ slides: [], hashtags: "origine" }),
    application: () => Promise.resolve({ statut: "echec" as const, raison: "origine" }),
  } as unknown as typeof decksAssignation;
  envelopperDecksABlanc(cible);
  assertEquals((await cible.sophia({} as never, "c", "fr")).hashtags, "origine");
});
