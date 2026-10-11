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
  args: { applicationId?: string; contenuIds?: string[]; langue?: string | null; maintenant?: () => Date },
) {
  const gemini = fauxGemini(modele);
  const serveur = fauxServeurPostgrest(tables, { gemini });
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

Deno.test("contenus : refus — Sophia, application inconnue, IA la nuit ; aucun appel au modèle", async () => {
  for (const [args, attendu] of [
    [{ applicationId: ID_SOPHIA }, "autres que Sophia"],
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
