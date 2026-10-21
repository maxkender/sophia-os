/**
 * Test à blanc — mode « contenus » : la VRAIE notation du rattrapage
 * (`noterContenuBackfill`) et le VRAI placement d'application
 * (`assurerDeckApplication`, cache ignoré) à travers l'intercepteur, sur un
 * faux PostgREST en lecture seule PIÉGÉ et un faux modèle. Chaque test vérifie
 * que rien n'a traversé (`violations` vide) et que la base est intacte.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  executerContenusABlanc,
  motifsNonEligible,
  PLAFOND_IA_PAR_CONTENU,
  tierEntree,
} from "./a_blanc_contenus.ts";
import { MAX_ANGLES_TEST } from "./angle_placement.ts";
import { creerContexteABlanc, executerDansContexte } from "./a_blanc_intercepteur.ts";
import { avecIntercepteur, fauxGemini, fauxServeurPostgrest, instantane } from "./a_blanc_test_utils.ts";
import { assurerDeckApplication } from "./deck_application.ts";
import { eloParLangue } from "./import_contenu.ts";
import { ID_SOPHIA, type ApplicationMoteur } from "./multi_app.ts";
import { PERTINENCE_MIN_HORS_SOPHIA } from "./pertinence_apps.ts";
import { serviceClient } from "./supabase.ts";

const UNSWIPE = "00000000-0000-4000-8000-000000000003";
const APP: ApplicationMoteur = { id: UNSWIPE, slug: "unswipe", nom: "Unswipe", langues: null, actif: false };
const C1 = "c0000000-0000-4000-8000-000000000001";
const C2 = "c0000000-0000-4000-8000-000000000002";
const MIDI = () => new Date("2026-10-09T12:00:00Z");

const DECK_C1 = [
  { position: 1, texte_overlay: "trop d'écrans ?", position_sophia: false },
  { position: 2, texte_overlay: "range ton téléphone le soir", position_sophia: false },
  { position: 3, texte_overlay: "j'utilise opal pour bloquer tiktok", position_sophia: false },
  { position: 4, texte_overlay: "et je lis enfin", position_sophia: false },
];
const DECK_C2 = [
  { position: 1, texte_overlay: "recette de crêpes", position_sophia: false },
  { position: 2, texte_overlay: "farine et lait", position_sophia: false },
  { position: 3, texte_overlay: "cuire deux minutes", position_sophia: false },
];
const VIEUX_DECK = [
  { position: 1, texte_overlay: "trop d'écrans ?", position_sophia: false },
  { position: 2, texte_overlay: "ANCIEN PROMPT avec Unswipe", position_sophia: true },
];
const SCORING = {
  score_prior: 50,
  elo_regularisation_k: 1,
  elo_seuil_import: 55,
  elo_poids_vues: 0.7,
  elo_vues_plafond: 80_000,
  elo_poids_source: 0.45,
};

function base(extra: Record<string, unknown[]> = {}) {
  return {
    applications: [
      { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", langues: null, actif: true, created_at: "2026-01-01" },
      { id: UNSWIPE, slug: "unswipe", nom: "Unswipe", langues: null, actif: false, created_at: "2026-09-01" },
    ],
    label_applications: [{ label_id: "L1", application_id: ID_SOPHIA }],
    // Lus par le seuil réglé de chaque label (`chargerMinimumsPertinence`).
    contenu_labels: [] as unknown[],
    labels: [] as unknown[],
    passages: [{ id: "p0", application_id: ID_SOPHIA }],
    prompts: [
      { cle: "pertinence_unswipe", contenu: "Note la pertinence pour Unswipe." },
      { cle: "placement_unswipe", contenu: "Place Unswipe." },
    ],
    reglages: [{ cle: "scoring", valeur: SCORING }],
    contenus: [
      {
        id: C1,
        titre: "Moins d'écrans",
        langue_source: "fr",
        vues_source: 120_000,
        statut: "valide",
        import_statut: "done",
        import_elo_force_seuil: false,
        compte_reference_id: "r1",
        structure_slides: [],
      },
      {
        id: C2,
        titre: "Crêpes",
        langue_source: "fr",
        vues_source: 500_000,
        statut: "valide",
        import_statut: "done",
        import_elo_force_seuil: false,
        compte_reference_id: null,
        structure_slides: [],
      },
    ],
    contenu_langues: [
      { id: "cl-1fr", contenu_id: C1, langue: "fr", slides: DECK_C1, slides_base: DECK_C1, hashtags: "#ecrans" },
      { id: "cl-2fr", contenu_id: C2, langue: "fr", slides: DECK_C2, slides_base: DECK_C2, hashtags: "#crepes" },
    ],
    contenu_langue_decks: [{
      id: "d1",
      contenu_langue_id: "cl-1fr",
      contenu_id: C1,
      langue: "fr",
      application_id: UNSWIPE,
      variante: "unswipe",
      statut: "pret",
      raison: null,
      slides: VIEUX_DECK,
      placement: null,
      updated_at: new Date().toISOString(),
    }],
    // C2 déjà noté (ancien prompt) : la ligne n'est remplacée QUE dans le test.
    contenu_pertinences: [{
      contenu_id: C2,
      application_id: UNSWIPE,
      score: 90,
      raison: "ancien",
      note: 70,
      eligible: true,
      angles: null,
      prompt_cle: "pertinence_unswipe",
    }],
    piste_comptes_reference: [{ compte_reference_id: "r1", piste: 80 }],
    corrections: [],
    comptes_reference: [],
    ...extra,
  };
}

/** Faux modèle : notation selon l'accroche, traduction, placement sur la slide imposée. */
const modele = (prompt: string): string => {
  if (prompt.includes("Slideshow candidat")) {
    return prompt.includes("écrans")
      ? JSON.stringify({ score: 80, reason: "sujet écrans" })
      : JSON.stringify({ score: 30, reason: "hors sujet" });
  }
  if (prompt.includes('"translated"')) {
    return JSON.stringify({
      slides: [
        { position: 1, translated: "zu viele Bildschirme?" },
        { position: 2, translated: "leg dein Handy abends weg" },
        { position: 3, translated: "ich blockiere tiktok mit opal" },
        { position: 4, translated: "und lese endlich" },
      ],
      hashtags: "#bildschirm",
    });
  }
  if (prompt.includes("chosen_position")) {
    const allemand = prompt.includes("LANGUE DE SORTIE : DE") || prompt.includes("LANGUE DE SORTIE : ALLEMAND");
    const variante = allemand ? "ich blockiere tiktok mit der Unswipe-App" : "je bloque tiktok avec l'appli unswipe";
    return JSON.stringify({ chosen_position: 3, mode: "confession", variants: [variante, `${variante} !`], best: 0 });
  }
  return '{"hashtags":"#a #b #c"}';
};

async function lancer(
  tables: ReturnType<typeof base>,
  args: {
    applicationId?: string;
    contenuIds?: string[];
    langue?: string | null;
    maintenant?: () => Date;
    modele?: (prompt: string) => string;
  },
) {
  const gemini = fauxGemini(args.modele ?? modele);
  const serveur = fauxServeurPostgrest(tables, {
    gemini,
    relations: { contenu_labels: { labels: { fk: "label_id", table: "labels" } } },
  });
  const ids = args.contenuIds ?? [C1, C2];
  const ctx = creerContexteABlanc({ nature: "run", ia: true, plafondIA: PLAFOND_IA_PAR_CONTENU * ids.length });
  const r = await avecIntercepteur(serveur.fetch, () =>
    executerDansContexte(ctx, () =>
      executerContenusABlanc(serviceClient(), ctx, {
        applicationId: args.applicationId ?? UNSWIPE,
        contenuIds: ids,
        langue: args.langue ?? null,
        maintenant: args.maintenant ?? MIDI,
      })
    )
  );
  return { r, ctx, gemini, serveur };
}

Deno.test("contenus : vraie notation + vrai placement, cache ignoré, rien d'écrit", async () => {
  const tables = base();
  const avant = instantane(tables);
  const { r, ctx, gemini, serveur } = await lancer(tables, {});
  assertEquals(serveur.violations, []);
  assertEquals(tables, avant, "la base du faux serveur n'a pas bougé");
  assertEquals(r.erreurRun, undefined, r.resume);
  assertEquals(r.mode, "contenus");
  assertEquals(r.application?.slug, "unswipe");
  assertEquals(r.prompts, {
    pertinence: { cle: "pertinence_unswipe", present: true },
    placement: { cle: "placement_unswipe", present: true },
  });
  assertEquals(r.scoring, { seuil: 55, plancher: PERTINENCE_MIN_HORS_SOPHIA, poidsVues: 0.7, poidsSource: 0.45 });
  assert(r.limites.some((l) => l.includes("inactive")), "application inactive signalée");

  const [c1, c2] = r.contenus;
  // C1 : la note est EXACTEMENT celle du rattrapage (piste du compte source comprise).
  const attendue = eloParLangue({
    pertinence: 80,
    vues: 120_000,
    langue: "fr",
    langueSource: "fr",
    prior: 50,
    k: 1,
    poidsVues: 0.7,
    vuesPlafond: 80_000,
    pisteSource: 80,
    poidsSource: 0.45,
  });
  assertEquals(c1.pisteSource, 80);
  assertEquals(c1.pertinence?.score, 80);
  assertEquals(c1.pertinence?.raison, "sujet écrans");
  assertEquals(c1.pertinence?.accroche, "trop d'écrans ?");
  assertEquals(c1.pertinence?.note, attendue);
  assertEquals(c1.pertinence?.eligible, true);
  assertEquals(c1.pertinence?.motifs, []);
  assertEquals(c1.pertinence?.tier, tierEntree(true, attendue).tier);
  assertEquals(c1.pertinence?.enBase, null, "jamais noté en base");

  // Placement : le cache « pret » (ancien prompt) est ignoré, la slide qui
  // cite un concurrent (opal) est imposée et remplacée.
  assertEquals(c1.deck?.statut, "pret");
  assertEquals(c1.deck?.positionImposee, 3);
  assertEquals(c1.deck?.slidePub, 3);
  assertEquals(c1.deck?.base.map((s) => s.texte), DECK_C1.map((s) => s.texte_overlay));
  assertEquals(c1.deck?.slides.map((s) => s.texte), [
    "trop d'écrans ?",
    "range ton téléphone le soir",
    "je bloque tiktok avec l'appli unswipe",
    "et je lis enfin",
  ]);
  assertEquals(c1.deck?.variantes.length, 2);
  assertEquals(c1.deck?.hashtags, "#ecrans");
  assert(!c1.deck?.slides.some((s) => s.texte.includes("ANCIEN PROMPT")));

  // C2 : pertinence 30 < plancher 50 → non éligible malgré ses vues ; la
  // ligne réelle (90, éligible) est remplacée DANS LE TEST seulement.
  assertEquals(c2.pertinence?.score, 30);
  assertEquals(c2.pertinence?.eligible, false);
  assert(c2.pertinence?.motifs.includes("pertinence_sous_plancher"));
  assertEquals([c2.pertinence?.tier, c2.pertinence?.passages], ["D", 0]);
  assertEquals(c2.pertinence?.enBase, { score: 90, note: 70, eligible: true });
  assertEquals(c2.deck?.statut, "pret", "placement lancé même pour un contenu non éligible");

  // Écritures : simulées, journalisées, jamais envoyées.
  const ops = r.ecrituresEvitees.map((e) => `${e.operation} ${e.table}`);
  assert(ops.includes("upsert contenu_pertinences"), ops.join(", "));
  assert(ops.includes("upsert contenu_langue_decks"), ops.join(", "));
  assertEquals(r.appelsIA.autorises, gemini.appels.length);
  assertEquals(gemini.appels.length, 4, "2 notations + 2 placements");
  assertEquals(ctx.etat.compteurIA.bloques, 0);
  assert(r.resume.includes("rien n'a été écrit"));
});

/** Le label L1 (qui sert Sophia et Unswipe) sur C1, et des angles pour ses paires. */
const avecAngles = (angles: Array<Record<string, unknown>>, extra: Record<string, unknown[]> = {}) =>
  base({
    contenu_labels: [{ contenu_id: C1, label_id: "L1" }],
    labels: [{ id: "L1", slug: "weird-alpha", nom: "weird_alpha" }],
    label_applications: [{ label_id: "L1", application_id: ID_SOPHIA }, { label_id: "L1", application_id: UNSWIPE }],
    angles_placement: angles,
    ...extra,
  });
const angle = (id: string, texte: string, statut: "actif" | "test", application_id = UNSWIPE, minute = 0) => ({
  id,
  label_id: "L1",
  application_id,
  texte,
  statut,
  created_at: `2026-10-14T08:${String(minute).padStart(2, "0")}:00Z`,
});
const placements = (appels: string[]) => appels.filter((p) => p.includes("chosen_position"));
const consigne = (prompt: string) => /--- CONSIGNE PROPRE À CE SLIDESHOW ---\n(.*)\n/.exec(prompt)?.[1] ?? null;

Deno.test("angles : la référence (angle actif) puis une variante par angle EN TEST, rien d'écrit", async () => {
  const tables = avecAngles([
    angle("a-actif", "insister sur le temps récupéré", "actif"),
    angle("a-test-1", "montrer la fierté d'avoir tenu", "test", UNSWIPE, 1),
    angle("a-test-2", "parler du soir, avant de dormir", "test", UNSWIPE, 2),
    angle("a-sophia", "angle Sophia, jamais pour Unswipe", "test", ID_SOPHIA, 3),
  ]);
  const avant = instantane(tables);
  const { r, gemini, serveur } = await lancer(tables, { contenuIds: [C1] });
  assertEquals(serveur.violations, []);
  assertEquals(tables, avant, "rien n'a bougé en base");
  const [c1] = r.contenus;
  assertEquals(
    c1.angles.map((a) => [a.source, a.angleId, a.angle, a.deck?.statut, a.deck?.angle]),
    [
      ["reference", null, "insister sur le temps récupéré", "pret", "insister sur le temps récupéré"],
      ["test", "a-test-1", "montrer la fierté d'avoir tenu", "pret", "montrer la fierté d'avoir tenu"],
      ["test", "a-test-2", "parler du soir, avant de dormir", "pret", "parler du soir, avant de dormir"],
    ],
  );
  assertEquals(c1.deck, c1.angles[0].deck, "le deck affiché est celui de la référence");
  assertEquals(placements(gemini.appels).map(consigne).sort(), [
    "insister sur le temps récupéré",
    "montrer la fierté d'avoir tenu",
    "parler du soir, avant de dormir",
  ]);
  assertEquals(gemini.appels.length, 4, "1 notation + 3 placements, la base n'est traduite qu'une fois");
  assertEquals(c1.anglesNonTestes, 0);
});

Deno.test("angles : sans angle actif, la référence est sans angle", async () => {
  const { r, gemini } = await lancer(avecAngles([angle("t", "montrer la fierté", "test")]), { contenuIds: [C1] });
  const [c1] = r.contenus;
  assertEquals(c1.angles.map((a) => [a.source, a.angle]), [["reference", null], ["test", "montrer la fierté"]]);
  assertEquals(placements(gemini.appels).map(consigne).sort((a, b) => String(a).localeCompare(String(b))), [
    "montrer la fierté",
    null,
  ]);
});

Deno.test("angles : aucun angle en test → un seul placement, comme avant", async () => {
  const { r, gemini } = await lancer(base(), { contenuIds: [C1] });
  assertEquals(r.contenus[0].angles.length, 1);
  assertEquals(r.contenus[0].angles[0].angle, null);
  assertEquals(placements(gemini.appels).length, 1);
  assert(!placements(gemini.appels)[0].includes("CONSIGNE PROPRE"));
});

Deno.test("angles : un label qui ne sert plus l'application garde ses angles, sans qu'ils servent", async () => {
  const tables = avecAngles(
    [angle("a-actif", "insister sur le temps récupéré", "actif"), angle("a-test", "montrer la fierté", "test", UNSWIPE, 1)],
    { label_applications: [{ label_id: "L1", application_id: ID_SOPHIA }] },
  );
  const { r, gemini } = await lancer(tables, { contenuIds: [C1] });
  const [c1] = r.contenus;
  assertEquals(c1.angles.map((a) => [a.source, a.angle]), [["reference", null]]);
  assertEquals(placements(gemini.appels).map(consigne), [null]);
  assertEquals((tables as unknown as Record<string, unknown[]>).angles_placement.length, 2, "les angles restent en base");
});

Deno.test("angles : une référence qui LÈVE (lecture en panne) n'empêche pas les angles en test", async () => {
  const tables = avecAngles([angle("t1", "montrer la fierté", "test")]);
  const gemini = fauxGemini(modele);
  const serveur = fauxServeurPostgrest(tables, {
    gemini,
    relations: { contenu_labels: { labels: { fk: "label_id", table: "labels" } } },
  });
  // Première lecture de contenu_langue_decks (celle de la référence) en panne.
  let panne = true;
  const fetchPanne: typeof fetch = (entree, init) => {
    const url = typeof entree === "string" ? entree : entree instanceof URL ? entree.href : entree.url;
    if (panne && url.includes("/rest/v1/contenu_langue_decks") && (init?.method ?? "GET") === "GET") {
      panne = false;
      return Promise.resolve(new Response(JSON.stringify({ message: "boom", code: "PGRST000" }), { status: 400 }));
    }
    return serveur.fetch(entree, init);
  };
  const ctx = creerContexteABlanc({ nature: "run", ia: true, plafondIA: PLAFOND_IA_PAR_CONTENU });
  const r = await avecIntercepteur(fetchPanne, () =>
    executerDansContexte(ctx, () =>
      executerContenusABlanc(serviceClient(), ctx, { applicationId: UNSWIPE, contenuIds: [C1], maintenant: MIDI })
    )
  );
  const [c1] = r.contenus;
  assertEquals(c1.angles[0].deck, null);
  assert(c1.angles[0].erreur?.includes("boom"), c1.angles[0].erreur);
  assertEquals(c1.angles[1].deck?.statut, "pret", c1.angles[1].erreur ?? "");
  assertEquals(serveur.violations, []);
});

Deno.test("angles : au-delà de MAX_ANGLES_TEST, les plus récents attendent, et c'est dit", async () => {
  const tests = Array.from({ length: MAX_ANGLES_TEST + 2 }, (_, k) => angle(`t${k}`, `angle ${k}`, "test", UNSWIPE, k));
  const { r } = await lancer(avecAngles(tests), { contenuIds: [C1] });
  const [c1] = r.contenus;
  assertEquals(c1.angles.length, 1 + MAX_ANGLES_TEST);
  assertEquals(c1.angles.slice(1).map((a) => a.angleId), tests.slice(0, MAX_ANGLES_TEST).map((t) => t.id));
  assertEquals(c1.anglesNonTestes, 2);
  assert(r.limites.some((l) => l.includes("non testés")), r.limites.join(" | "));
});

Deno.test("Sophia : placement seul (pas de notation), une variante par angle, rien d'écrit", async () => {
  const tables = avecAngles(
    [
      angle("s-actif", "insister sur la régularité", "actif", ID_SOPHIA),
      angle("s-test", "parler de culture générale", "test", ID_SOPHIA, 1),
      angle("u-test", "angle Unswipe, jamais pour Sophia", "test", UNSWIPE, 2),
    ],
    { prompts: [{ cle: "placement_sophia", contenu: "Place Sophia." }] },
  );
  const avant = instantane(tables);
  const { r, gemini, serveur } = await lancer(tables, { applicationId: ID_SOPHIA, contenuIds: [C1] });
  assertEquals(serveur.violations, []);
  assertEquals(tables, avant);
  assertEquals(r.erreurRun, undefined, r.resume);
  assertEquals(r.notation, false);
  assertEquals(r.scoring, null);
  const [c1] = r.contenus;
  assertEquals(c1.pertinence, null);
  assertEquals(c1.angles.map((a) => [a.source, a.angle, a.deck?.statut, a.deck?.promptCle]), [
    ["reference", "insister sur la régularité", "pret", "placement_sophia"],
    ["test", "parler de culture générale", "pret", "placement_sophia"],
  ]);
  assertEquals(c1.deck?.slidePub, 3);
  assertEquals(gemini.appels.filter((p) => p.includes("Slideshow candidat")).length, 0, "aucune notation");
  assertEquals(placements(gemini.appels).map(consigne).sort(), [
    "insister sur la régularité",
    "parler de culture générale",
  ]);
  assert(r.limites.some((l) => l.startsWith("Sophia : placement seul")));
  assert(!r.resume.includes("éligible"), r.resume);
  assert(!r.limites.some((l) => l.startsWith("Notation") || l.startsWith("Tier d'entrée")), r.limites.join(" | "));
});

Deno.test("Sophia, autre langue : la base est traduite avec la voix du compte source, comme la nuit", async () => {
  const tables = avecAngles([], {
    prompts: [{ cle: "placement_sophia", contenu: "Place Sophia." }],
    comptes_reference: [{ id: "r1", style_profile: "VOIX_DU_COMPTE_R1" }],
  });
  const { r, gemini, serveur } = await lancer(tables, { applicationId: ID_SOPHIA, contenuIds: [C1], langue: "de" });
  assertEquals(serveur.violations, []);
  const traductions = gemini.appels.filter((p) => p.includes('"translated"'));
  assertEquals(traductions.length, 1);
  assert(traductions[0].includes("VOIX_DU_COMPTE_R1"), "voix du compte source dans la traduction");
  assertEquals(r.contenus[0].angles[0].deck?.statut, "pret");
});

Deno.test("angles : référence sans base (traduction ratée) → les angles en test ne retraduisent pas, c'est dit", async () => {
  const tables = avecAngles([angle("t1", "montrer la fierté", "test"), angle("t2", "parler du soir", "test", UNSWIPE, 1)]);
  const sansTraduction = (prompt: string) => prompt.includes('"translated"') ? "pas du json" : modele(prompt);
  const { r, gemini, serveur } = await lancer(tables, { contenuIds: [C1], langue: "de", modele: sansTraduction });
  assertEquals(serveur.violations, []);
  const [c1] = r.contenus;
  assertEquals(c1.angles.map((a) => a.source), ["reference", "test", "test"]);
  assert(c1.angles[0].deck !== null, "la référence rend un deck (en échec)");
  assertEquals(c1.angles[0].deck?.base, []);
  for (const a of c1.angles.slice(1)) {
    assertEquals(a.deck, null);
    assert(a.erreur?.startsWith("non testé"), a.erreur);
  }
  const traductions = gemini.appels.filter((p) => p.includes('"translated"')).length;
  const { gemini: seul } = await lancer(avecAngles([]), { contenuIds: [C1], langue: "de", modele: sansTraduction });
  assertEquals(traductions, seul.appels.filter((p) => p.includes('"translated"')).length, "pas une traduction de plus");
});

Deno.test("contenus : langue demandée ≠ source — traduction simulée, base relue dans le calque", async () => {
  const tables = base();
  const avant = instantane(tables);
  const { r, ctx, serveur } = await lancer(tables, { contenuIds: [C1], langue: "de" });
  assertEquals(serveur.violations, []);
  assertEquals(tables, avant);
  const [c1] = r.contenus;
  assertEquals([c1.langueSource, c1.langue], ["fr", "de"]);
  assertEquals(c1.deck?.statut, "pret", c1.deck?.raison ?? "");
  assertEquals(c1.deck?.base.map((s) => s.texte), [
    "zu viele Bildschirme?",
    "leg dein Handy abends weg",
    "ich blockiere tiktok mit opal",
    "und lese endlich",
  ]);
  assertEquals(c1.deck?.slidePub, 3);
  assertEquals(c1.deck?.slides[2].texte, "ich blockiere tiktok mit der Unswipe-App");
  const ops = ctx.etat.journal.map((e) => `${e.operation} ${e.table}`);
  assert(ops.includes("insert contenu_langues"), ops.join(", "));
  assert(ops.includes("update contenu_langues"), ops.join(", "));
});

Deno.test("deck d'application : le cache n'est ignoré QU'avec l'option ignorerCache", async () => {
  const tables = base();
  const avant = instantane(tables);
  const gemini = fauxGemini(modele);
  const serveur = fauxServeurPostgrest(tables, { gemini });
  await avecIntercepteur(serveur.fetch, async () => {
    const ctx = creerContexteABlanc({ nature: "run", ia: true });
    await executerDansContexte(ctx, async () => {
      const supabase = serviceClient();
      const parDefaut = await assurerDeckApplication(supabase, C1, "fr", APP);
      assertEquals(parDefaut.statut, "pret");
      assert(parDefaut.statut === "pret" && parDefaut.slides[1].texte_overlay === "ANCIEN PROMPT avec Unswipe");
      assertEquals(gemini.appels.length, 0, "sans l'option : le cache est servi, aucun appel");
      const echeance = await assurerDeckApplication(supabase, C1, "fr", APP, { echeance: Date.now() + 60_000 });
      assert(echeance.statut === "pret" && echeance.slides[1].texte_overlay === "ANCIEN PROMPT avec Unswipe");
      assertEquals(gemini.appels.length, 0, "une échéance seule ne change rien");

      const recuit = await assurerDeckApplication(supabase, C1, "fr", APP, { ignorerCache: true });
      assertEquals(recuit.statut, "pret");
      assert(recuit.statut === "pret" && recuit.slides[2].texte_overlay === "je bloque tiktok avec l'appli unswipe");
      assertEquals(gemini.appels.length, 1, "avec l'option : placement refait");
    });
  });
  assertEquals(serveur.violations, []);
  assertEquals(tables, avant);
});

Deno.test("contenus : prompt de placement vide → erreur claire, la notation est faite quand même", async () => {
  const tables = base({ prompts: [{ cle: "pertinence_unswipe", contenu: "Note." }] });
  const { r, serveur, gemini } = await lancer(tables, { contenuIds: [C1] });
  assertEquals(serveur.violations, []);
  assertEquals(r.prompts?.placement, { cle: "placement_unswipe", present: false });
  assertEquals(r.contenus[0].pertinence?.score, 80);
  assertEquals(r.contenus[0].deck?.statut, "echec");
  assertEquals(r.contenus[0].deck?.raison, "prompt placement_unswipe manquant");
  assertEquals(gemini.appels.length, 1, "seule la notation a appelé le modèle");
});

Deno.test("contenus : prompt de pertinence vide → notation refusée (pas de repli Sophia), placement fait", async () => {
  const tables = base({ prompts: [{ cle: "placement_unswipe", contenu: "Place." }, { cle: "pertinence", contenu: "Sophia" }] });
  const { r, serveur } = await lancer(tables, { contenuIds: [C1] });
  assertEquals(serveur.violations, []);
  const p = r.contenus[0].pertinence;
  assert(p?.erreur?.includes("pertinence_unswipe"), p?.erreur);
  assertEquals([p?.eligible, p?.tier], [false, "D"]);
  assertEquals(r.contenus[0].deck?.statut, "pret");
  assert(!r.ecrituresEvitees.some((e) => e.table === "contenu_pertinences"));
});

Deno.test("contenus : refus — application inconnue, IA la nuit ; aucun appel au modèle", async () => {
  for (const [args, attendu] of [
    [{ applicationId: "00000000-0000-4000-8000-0000000000ff" }, "inconnue"],
    [{ maintenant: () => new Date("2026-10-09T22:30:00Z") }, "pendant la nuit"],
  ] as const) {
    const tables = base();
    const { r, serveur, gemini } = await lancer(tables, args);
    assertEquals(serveur.violations, []);
    assert(r.erreurRun?.includes(attendu), `${attendu} : ${r.erreurRun}`);
    assertEquals(r.contenus, []);
    assertEquals(gemini.appels.length, 0);
  }
});

Deno.test("plancher hors Sophia : 49 refusé même bien noté, 50 accepté ; tier d'entrée", () => {
  const base = { applicationId: UNSWIPE, note: 80, seuil: 55, forcee: false };
  assertEquals(motifsNonEligible({ ...base, score: PERTINENCE_MIN_HORS_SOPHIA - 1 }), ["pertinence_sous_plancher"]);
  assertEquals(motifsNonEligible({ ...base, score: PERTINENCE_MIN_HORS_SOPHIA }), []);
  assertEquals(motifsNonEligible({ ...base, score: 80, note: 40 }), ["note_sous_seuil"]);
  assertEquals(motifsNonEligible({ ...base, score: 80, note: 40, forcee: true }), []);
  assertEquals(motifsNonEligible({ ...base, score: 10, note: 40 }), ["pertinence_sous_plancher", "note_sous_seuil"]);
  assertEquals(tierEntree(true, 72), { tier: "A", passages: 4 });
  assertEquals(tierEntree(true, 61), { tier: "B", passages: 2 });
  assertEquals(tierEntree(true, 56), { tier: "C", passages: 1 });
  assertEquals(tierEntree(false, 90), { tier: "D", passages: 0 });
});

Deno.test("déploiement : a_blanc_contenus redéploie assignation-a-blanc, et elle seule", async () => {
  const racine = new URL("../../../", import.meta.url);
  const touchees = async (fichiers: string[]) => {
    const sortie = await new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "scripts/fonctions-touchees.mjs", ...fichiers],
      cwd: racine,
      env: { DETAIL: "0" },
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!sortie.success) throw new Error(new TextDecoder().decode(sortie.stderr));
    return new TextDecoder().decode(sortie.stdout).trim();
  };
  assertEquals(await touchees(["supabase/functions/_shared/a_blanc_contenus.ts"]), "assignation-a-blanc");
  assertEquals(await touchees(["supabase/functions/_shared/a_blanc_contenus_test.ts"]), "");
});
