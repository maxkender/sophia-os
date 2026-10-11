/**
 * Test à blanc — de bout en bout : le VRAI `assignerTousComptes` (donc le vrai
 * `assignerCompteJour`, la vraie pioche, la vraie matérialisation, le vrai
 * journal) à travers l'intercepteur, sur un faux PostgREST en lecture seule
 * PIÉGÉ. Chaque test vérifie :
 *  - `violations` vide : aucune écriture, aucun appel externe n'a traversé ;
 *  - la base du faux serveur strictement identique avant / après ;
 *  - les créneaux reconstruits depuis le calque, et les écritures évitées.
 */

import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";

import { envelopperDecksABlanc } from "./a_blanc_decks.ts";
import {
  construireResultat,
  demainParis,
  executerAssignationABlanc,
  LIMITE_IA_DECOCHEE,
  masquerSecrets,
  raisonRefusIA,
  type ResultatABlanc,
} from "./a_blanc_execution.ts";
import { creerContexteABlanc, executerDansContexte } from "./a_blanc_intercepteur.ts";
import { avecIntercepteur, fauxServeurPostgrest, instantane, type Relations, URL_TEST } from "./a_blanc_test_utils.ts";
import { ID_SOPHIA } from "./multi_app.ts";
import { serviceClient } from "./supabase.ts";

const K = "0000000a-0000-4000-8000-000000000001";
const JOUR = "2026-10-10";
const RELATIONS: Relations = {
  passages: { posts: { fk: "post_id", table: "posts" } },
  compte_labels: { labels: { fk: "label_id", table: "labels" } },
  contenu_labels: { labels: { fk: "label_id", table: "labels" } },
};

const cid = (i: number) => `c0000000-0000-4000-8000-00000000000${i}`;
const DECK_PRET = [
  { position: 1, texte_overlay: "accroche", position_sophia: false },
  { position: 2, texte_overlay: "conseil", position_sophia: false },
  { position: 3, texte_overlay: "l'appli Sophia", position_sophia: true },
];

/** Base inspirée de `baseEssai` (assignation_contenu_test.ts), en tables PostgREST. */
function baseEssai(args: { n?: number; compte?: Record<string, unknown>; langues?: boolean; ugc?: boolean } = {}) {
  const n = args.n ?? 4;
  const ids = Array.from({ length: n }, (_, i) => cid(i + 1));
  return {
    reglages: [
      { cle: "frequence", valeur: { posts_par_jour: 1 } },
      { cle: "tierlist", valeur: {} },
      { cle: "assignation_auto", valeur: { actif: true } },
    ],
    comptes: [{
      id: K,
      persona_nom: "Alice",
      handle_tiktok: "alice",
      langue: "fr",
      posts_par_jour: 2,
      is_active: true,
      type_compte: "poster",
      ugc_ai: Boolean(args.ugc),
      ugc_ai_video: false,
      ugc_persona_id: args.ugc ? "persona-1" : null,
      videos_uniquement: false,
      warmup_ends_at: "2026-01-01T00:00:00Z",
      parts_applications: null,
      ...args.compte,
    }],
    labels: [{ id: "L1", nom: "smart_girl", slug: "smart-girl" }],
    compte_labels: [{ compte_id: K, label_id: "L1" }],
    label_applications: [{ label_id: "L1", application_id: ID_SOPHIA }],
    applications: [{ id: ID_SOPHIA, slug: "sophia", nom: "Sophia", langues: null, actif: true, created_at: "2026-01-01" }],
    contenu_labels: ids.map((id) => ({ contenu_id: id, label_id: "L1" })),
    contenus: ids.map((id, i) => ({
      id,
      titre: `Contenu ${i + 1}`,
      statut: "valide",
      import_statut: "done",
      ugc_compatible: Boolean(args.ugc),
      musique_url: "https://www.tiktok.com/music/x",
      musique_titre: "Son",
      musique_plateforme: "tiktok",
      sujet_id: null,
      structure_slides: [
        { position: 1, media_id: "m1", reference_url: "https://ref/1" },
        { position: 2, media_id: "m2" },
        { position: 3, media_id: "m3" },
      ],
      langue_source: "fr",
      compte_reference_id: null,
      pod: null,
      livre: false,
      passages_prevus: 2,
    })),
    contenu_tier_etat: ids.map((id) => ({ contenu_id: id, tier: "B", tier_cycle: 1, passages_prevus: 2, restants: 2 })),
    contenu_pertinences: [],
    contenu_application_tier_etat: [],
    contenu_tiers_application: [],
    contenu_langue_decks: [],
    contenu_langues: args.langues === false ? ids.map((id, i) => ({
      id: `cl-${i}`,
      contenu_id: id,
      langue: "fr",
      slides: DECK_PRET.map((s) => ({ ...s, position_sophia: false, texte_overlay: s.position === 3 ? "fin" : s.texte_overlay })),
      slides_base: null,
      hashtags: null,
    })) : ids.map((id, i) => ({
      id: `cl-${i}`,
      contenu_id: id,
      langue: "fr",
      slides: DECK_PRET,
      slides_base: null,
      hashtags: "#culture #lecture",
    })),
    passages: [{
      id: "p-autre",
      compte_id: "autre",
      contenu_id: cid(1),
      date_publication_prevue: "2026-09-01",
      post_id: "post-autre",
      application_id: ID_SOPHIA,
    }],
    posts: [{ id: "post-autre", compte_id: "autre", date_publication_prevue: "2026-09-01", est_test: false, type: "contenu", statut: "publie" }],
    post_slides: [],
    media_library: ["m1", "m2", "m3"].map((m, i) => ({
      id: m,
      url: `${URL_TEST}/storage/v1/object/public/medias/propre/${m}.jpg`,
      storage_path: `propre/${m}.jpg`,
      caption: null,
      est_hook: i === 0,
      texte_restant: false,
      visage_premier_plan: true,
      ugc_face_regen: false,
    })),
    media_labels: ["m1", "m2", "m3"].map((m) => ({ media_id: m, label_id: "L1" })),
    ugc_personas: [{
      id: "persona-1",
      image_face_url: "https://img/f.jpg",
      image_left_url: "https://img/l.jpg",
      image_right_url: "https://img/r.jpg",
      image_down_url: "https://img/d.jpg",
    }],
    prompts: [],
    corrections: [],
    comptes_reference: [],
    assignation_journal: [],
  };
}

type Base = ReturnType<typeof baseEssai>;

async function lancer(
  tables: Base,
  opts: { ia?: boolean; jour?: string } = {},
): Promise<{ r: ResultatABlanc; violations: string[]; logs: string[] }> {
  const serveur = fauxServeurPostgrest(tables as unknown as Record<string, Record<string, unknown>[]>, {
    relations: RELATIONS,
  });
  const logs: string[] = [];
  const restaurer = envelopperDecksABlanc();
  try {
    const r = await avecIntercepteur(serveur.fetch, async () => {
      const ctx = creerContexteABlanc({ nature: "run", ia: Boolean(opts.ia) });
      ctx.etat.onEvenement = (t) => logs.push(t);
      return await executerDansContexte(ctx, async () =>
        await executerAssignationABlanc(serviceClient(), ctx, {
          compteId: K,
          jour: opts.jour ?? JOUR,
          ia: Boolean(opts.ia),
          onLog: (d) => logs.push(d),
        })
      );
    });
    return { r, violations: serveur.violations, logs };
  } finally {
    restaurer();
  }
}

const ecriture = (r: ResultatABlanc, table: string, op: string) =>
  r.ecrituresEvitees.find((e) => e.table === table && e.operation === op);

Deno.test("bout en bout : compte Sophia quota 2 — 2 créneaux reconstruits, écritures évitées, base intacte", async () => {
  const tables = baseEssai();
  const avant = instantane(tables);
  const { r, violations, logs } = await lancer(tables);

  assertEquals(violations, []);
  assertEquals(tables, avant, "la base n'a pas bougé d'un octet");
  assertEquals(r.erreurRun, undefined);
  assertEquals(r.resultat.crees, 2);
  assertEquals(r.creneaux.length, 2);
  assertEquals(r.laNuit, { servirait: true, motifs: [] });
  const contenus = new Set(r.creneaux.map((c) => c.contenu.id));
  assertEquals(contenus.size, 2, "deux contenus différents");
  for (const c of r.creneaux) {
    assert(c.contenu.id.startsWith("c0000000"), "contenu du pool");
    assertEquals(c.application, { id: ID_SOPHIA, slug: "sophia", nom: "Sophia" });
    assertEquals(c.langue, "fr");
    assertEquals(c.slides.map((s) => s.texte), DECK_PRET.map((s) => s.texte_overlay));
    assertEquals(c.slidePub, 3);
    assertEquals(c.deck.origine, "existant");
    assert(c.hashtags.startsWith("#culture #lecture"), c.hashtags);
    assertEquals(c.contenu.tier, "B");
    assertEquals(c.contenu.tierCycle, 1);
    assert(c.contenu.titre?.startsWith("Contenu "));
    assert(c.postId, "post fictif lié");
    assertEquals(c.slides[0].mediaId, "m1");
    assertEquals(c.slides[0].mediaUrl, `${URL_TEST}/storage/v1/object/public/medias/propre/m1.jpg`);
    assertEquals(c.musique?.titre, "Son");
    assert(!tables.passages.some((p) => p.id === c.passageId), "id fictif, absent de la base");
  }
  assertEquals(ecriture(r, "passages", "insert")?.lignes, 2);
  assertEquals(ecriture(r, "posts", "insert")?.lignes, 2);
  assertEquals(ecriture(r, "post_slides", "insert")?.lignes, 6);
  assertEquals(ecriture(r, "passages", "update")?.lignes, 2);
  assertEquals(ecriture(r, "assignation_journal", "upsert")?.lignes, 1);
  assert(logs.some((l) => l.startsWith("Évité · INSERT passages")));
  assert(logs.some((l) => l.includes("Passage 2/2 prêt")), "les logs du vrai code");
  assertEquals(r.appelsIA, { autorises: 0, bloques: 0 });
  assert(r.limites.includes(LIMITE_IA_DECOCHEE));
  assert(r.lectures > 10);
});

Deno.test("bout en bout : quota 3 et un seul contenu — baisse de quota SIMULÉE, comptes intact", async () => {
  const tables = baseEssai({ n: 1, compte: { posts_par_jour: 3 } });
  const avant = instantane(tables);
  const { r, violations } = await lancer(tables);
  assertEquals(violations, []);
  assertEquals(tables, avant);
  assertEquals(r.resultat.crees, 1);
  assertEquals(r.resultat.quotaBaisse?.avant, 3);
  assertEquals(r.resultat.quotaBaisse?.apres, 1);
  assertEquals(r.resultat.quotaBaisse?.simule, true);
  assertEquals(ecriture(r, "comptes", "update")?.lignes, 1);
  assertEquals(tables.comptes[0].posts_par_jour, 3, "jamais écrit");
});

Deno.test("bout en bout : compte inactif — aucun run, motif inactif, aucune écriture", async () => {
  const tables = baseEssai({ compte: { is_active: false } });
  const { r, violations } = await lancer(tables);
  assertEquals(violations, []);
  assertEquals(r.laNuit.motifs, ["inactif"]);
  assertEquals(r.creneaux, []);
  assertEquals(r.ecrituresEvitees, []);
  assert(r.resume.includes("Compte inactif"));
});

Deno.test("bout en bout : warmup en cours — simulé quand même, motif signalé", async () => {
  const tables = baseEssai({ compte: { warmup_ends_at: "2099-01-01T00:00:00Z" } });
  const { r, violations, logs } = await lancer(tables);
  assertEquals(violations, []);
  assertEquals(r.laNuit, { servirait: false, motifs: ["warmup_en_cours"] });
  assertEquals(r.resultat.crees, 2);
  assert(logs.some((l) => l.includes("La nuit ne servirait pas")));
});

Deno.test("bout en bout : quota déjà rempli — raison du vrai code, et pré-filtre du drain signalé", async () => {
  const tables = baseEssai();
  for (const i of [1, 2]) {
    tables.posts.push({ id: `post-${i}`, compte_id: K, date_publication_prevue: JOUR, est_test: false, type: "contenu", statut: "assigne" });
    tables.passages.push({ id: `pj-${i}`, compte_id: K, contenu_id: cid(i), date_publication_prevue: JOUR, post_id: `post-${i}`, application_id: ID_SOPHIA });
    tables.post_slides.push({ id: `ps-${i}`, post_id: `post-${i}`, position: 1 } as never);
  }
  const avant = instantane(tables);
  const { r, violations } = await lancer(tables);
  assertEquals(violations, []);
  assertEquals(tables, avant);
  assertEquals(r.resultat.crees, 0);
  assert(r.resultat.raison?.startsWith("Quota déjà rempli (2/2"), r.resultat.raison);
  assertEquals(r.laNuit.motifs, ["quota_nuit"]);
  assertEquals([r.laNuit.postsDuJour, r.laNuit.quota], [2, 2]);
});

Deno.test("bout en bout : coquille legacy du jour sans passage — DELETE posts évité, post toujours là", async () => {
  const tables = baseEssai();
  tables.posts.push({ id: "legacy-1", compte_id: K, date_publication_prevue: JOUR, est_test: false, type: "recycle", statut: "brouillon" });
  const avant = instantane(tables);
  const { r, violations } = await lancer(tables);
  assertEquals(violations, []);
  assertEquals(tables, avant);
  assertEquals(ecriture(r, "posts", "delete")?.lignes, 1);
  assert(tables.posts.some((p) => p.id === "legacy-1"));
  assertEquals(r.resultat.crees, 2);
});

Deno.test("bout en bout : decks à fabriquer (IA décochée) — aperçu sans pub, origine signalée, aucun appel", async () => {
  const tables = baseEssai({ langues: false });
  const avant = instantane(tables);
  const { r, violations } = await lancer(tables);
  assertEquals(violations, []);
  assertEquals(tables, avant);
  assertEquals(r.resultat.crees, 2);
  for (const c of r.creneaux) {
    assertEquals(c.deck.origine, "a_fabriquer");
    assertEquals(c.deck.besoin, "placement Sophia");
    assertEquals(c.slidePub, null);
    assert(c.deck.fabrication?.length);
  }
  assertEquals(r.appelsIA, { autorises: 0, bloques: 0 });
});

Deno.test("bout en bout : compte UGC — face swap tenté sur fal, BLOQUÉ, compté sur le créneau", async () => {
  const tables = baseEssai({ ugc: true, compte: { posts_par_jour: 1 } });
  const avant = instantane(tables);
  const { r, violations } = await lancer(tables);
  assertEquals(violations, []);
  assertEquals(tables, avant);
  assertEquals(r.resultat.crees, 1);
  assert((r.creneaux[0].faceSwap?.appelsBloques ?? 0) >= 1, JSON.stringify(r.appelsBloques));
  assert(r.appelsBloques.some((b) => b.hote === "queue.fal.run" && b.motif === "externe"));
  assert(!r.ecrituresEvitees.some((e) => e.table === "media_library"), "aucun média fabriqué");
});

Deno.test("sonde : fetch qui n'est plus l'intercepteur — le test lève AVANT toute lecture", async () => {
  const tables = baseEssai();
  const serveur = fauxServeurPostgrest(tables as unknown as Record<string, Record<string, unknown>[]>, { relations: RELATIONS });
  await avecIntercepteur(serveur.fetch, async () => {
    const pose = globalThis.fetch;
    const appels: string[] = [];
    globalThis.fetch = (input: RequestInfo | URL) => {
      appels.push(String(input));
      return Promise.reject(new Error("ne doit pas être appelé"));
    };
    try {
      const ctx = creerContexteABlanc({ nature: "run", ia: false });
      await executerDansContexte(ctx, () =>
        assertRejects(
          () => executerAssignationABlanc(serviceClient(), ctx, { compteId: K, jour: JOUR, ia: false }),
          Error,
          "Interception inactive",
        )
      );
      assertEquals(appels, []);
    } finally {
      globalThis.fetch = pose;
    }
  });
  assertEquals(serveur.requetes, []);
});

Deno.test("IA refusée la nuit (fenêtres UTC) et juste après un run de minuit", () => {
  assert(raisonRefusIA(new Date("2026-10-09T22:10:00Z"), null));
  assert(raisonRefusIA(new Date("2026-10-09T00:10:00Z"), null));
  assert(raisonRefusIA(new Date("2026-10-09T04:30:00Z"), null));
  assertEquals(raisonRefusIA(new Date("2026-10-09T11:00:00Z"), null), null);
  assert(raisonRefusIA(new Date("2026-10-09T11:00:00Z"), "2026-10-09T10:45:00Z"));
  assertEquals(raisonRefusIA(new Date("2026-10-09T11:00:00Z"), "2026-10-09T04:00:03Z"), null);
});

Deno.test("demain à Paris, et masquage des clés dans le flux", () => {
  assertEquals(demainParis(new Date("2026-10-09T21:30:00Z")), "2026-10-10");
  assertEquals(demainParis(new Date("2026-10-09T22:30:00Z")), "2026-10-11", "après minuit à Paris");
  assertEquals(demainParis(new Date("2026-12-31T12:00:00Z")), "2027-01-01");
  const erreur = new TypeError(
    "error sending request for url (https://generativelanguage.googleapis.com/v1beta/models/m:generateContent?key=AIzaSECRET-123): dns",
  ).message;
  const masque = masquerSecrets({ detail: erreur, liste: [`x ?key=AIza&y=1`] });
  assert(!JSON.stringify(masque).includes("AIzaSECRET"));
  assert(masque.detail.includes("key=***"));
  assertEquals(masque.liste[0], "x ?key=***&y=1");
});

Deno.test("construireResultat : agrégats d'écritures (lignes inconnues → null) et de blocages", () => {
  const ctx = creerContexteABlanc({ nature: "run", ia: true });
  const e = ctx.etat;
  e.journal.push(
    { seq: 1, at: "", table: "passages", operation: "insert", lignes: 1, cible: "", valeurs: [], cles: [] },
    { seq: 2, at: "", table: "passages", operation: "insert", lignes: 1, cible: "", valeurs: [], cles: [] },
    { seq: 3, at: "", table: "posts", operation: "delete", lignes: null, cible: "", valeurs: [], cles: [] },
  );
  e.bloques.push(
    { seq: 4, at: "", hote: "queue.fal.run", methode: "POST", chemin: "/x", motif: "externe" },
    { seq: 5, at: "", hote: "queue.fal.run", methode: "POST", chemin: "/x", motif: "externe" },
  );
  const r = construireResultat(e, {
    jour: JOUR,
    ia: true,
    debut: Date.now(),
    compte: null,
    laNuit: { servirait: true, motifs: [] },
  });
  assertEquals(r.ecrituresEvitees, [
    { table: "passages", operation: "insert", requetes: 2, lignes: 2 },
    { table: "posts", operation: "delete", requetes: 1, lignes: null },
  ]);
  assertEquals(r.appelsBloques, [{ hote: "queue.fal.run", motif: "externe", nombre: 2 }]);
  assert(!r.limites.includes(LIMITE_IA_DECOCHEE));
  assert(r.resume.endsWith("rien n'a été écrit"));
});
