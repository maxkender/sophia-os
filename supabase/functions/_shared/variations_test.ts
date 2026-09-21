/**
 * Les variations ne décident plus sur une lecture ratée.
 *
 * Aucun `error` n'était relu dans `variations.ts`. Or postgrest RÉSOUT sur
 * échec — 400, timeout, panne réseau — avec `{ data: null, error }` : le code
 * lisait donc `data = null` comme « rien trouvé ». C'est la confusion du 20/08
 * (un pool plein pris pour un pool vide), reproduite ici sur trois décisions
 * différentes, et la plus coûteuse est silencieuse : lue comme « pas encore de
 * variation », elle en refabrique une à chaque run — traduction Gemini
 * comprise — puisque la table ne porte aucune contrainte d'unicité
 * (parent_id, variation_langue).
 *
 * La lecture non bornée de `contenu_labels` corrigée dans le même passage
 * (`visuelsAlternatifsLabel` → `contenuIdsDesLabels`) est couverte par
 * `assignation_contenu_test.ts`, qui teste le helper lui-même : c'est
 * exactement le même code, appelé depuis deux fichiers.
 */

import { assertEquals, assertRejects } from "jsr:@std/assert@1";

import { chargerVariationReglages, trouverCandidatVariation } from "./variations.ts";

interface Reponse {
  data: unknown;
  error: { message: string } | null;
}

/**
 * Faux PostgREST minimal, adressé par (table, colonnes filtrées). Chaque
 * réponse est décrite par le test : c'est la panne qu'on injecte, pas un
 * comportement moyen.
 */
function fauxClient(reponses: Record<string, Reponse>) {
  const from = (table: string) => {
    const filtres: string[] = [];
    const cle = () => `${table}:${[...filtres].sort().join("+")}`;

    const maillon = {
      select: (_c: string) => maillon,
      eq: (colonne: string, _v: unknown) => {
        filtres.push(colonne);
        return maillon;
      },
      gte: (_c: string, _v: unknown) => maillon,
      order: (_c: string, _o?: unknown) => maillon,
      limit: (_n: number) => maillon,
      maybeSingle: () => maillon,
      then: (
        onfulfilled?: (v: Reponse) => unknown,
        _onrejected?: (r: unknown) => unknown,
      ) => {
        const r = reponses[cle()];
        if (!r) throw new Error(`réponse non décrite par le test : ${cle()}`);
        return Promise.resolve(onfulfilled?.(r));
      },
    };
    return maillon;
  };

  // deno-lint-ignore no-explicit-any
  return { from } as any;
}

const REGLAGES = {
  seuil_score: 80,
  min_passages: 3,
  age_jours: 5,
  profondeur_max: 2,
  score_prior: 50,
};

/** Un candidat plausible : vieux, bien noté, deck non vide. */
function ligneLangue() {
  return {
    contenu_id: "c1",
    langue: "fr",
    score: 95,
    nb_passages: 12,
    slides: [{ position: 1, texte_overlay: "hook" }],
  };
}

function ligneContenu() {
  return {
    id: "c1",
    titre: "Un titre",
    profondeur: 0,
    compte_reference_id: null,
    application_id: null,
    structure_slides: [{ position: 1, media_id: "m1" }],
    musique_url: null,
    musique_titre: null,
    musique_plateforme: null,
    // Antérieur à `age_jours` : le candidat est mûr.
    created_at: "2020-01-01T00:00:00.000Z",
  };
}

Deno.test("réglages illisibles : on lève au lieu de varier sur des seuils inventés", async () => {
  const supabase = fauxClient({
    "reglages:cle": { data: null, error: { message: "statement timeout" } },
  });

  // Retomber sur les défauts codés, c'est fabriquer des variations selon des
  // règles que l'admin n'a jamais écrites (seuil de score, profondeur max).
  await assertRejects(
    () => chargerVariationReglages(supabase),
    Error,
    "statement timeout",
  );
});

Deno.test("réglages lus : les valeurs de l'admin l'emportent sur les défauts", async () => {
  const supabase = fauxClient({
    "reglages:cle": {
      data: { valeur: { variation_seuil_score: 91, score_prior: 60 } },
      error: null,
    },
  });

  const r = await chargerVariationReglages(supabase);
  assertEquals(r.seuil_score, 91);
  assertEquals(r.score_prior, 60);
  assertEquals(r.min_passages, 3, "les clés absentes gardent bien leur défaut");
});

Deno.test("« une variation existe déjà ? » illisible : on lève au lieu d'en créer un doublon", async () => {
  const supabase = fauxClient({
    "contenu_langues:": { data: [ligneLangue()], error: null },
    "contenus:id+import_statut+statut": { data: ligneContenu(), error: null },
    // LA lecture du fichier dont l'échec coûte le plus cher.
    "contenus:parent_id+variation_langue": {
      data: null,
      error: { message: "statement timeout" },
    },
  });

  await assertRejects(
    () => trouverCandidatVariation(supabase, REGLAGES),
    Error,
    "statement timeout",
  );
});

Deno.test("parent illisible : on lève au lieu de le traiter comme non éligible", async () => {
  const supabase = fauxClient({
    "contenu_langues:": { data: [ligneLangue()], error: null },
    "contenus:id+import_statut+statut": {
      data: null,
      error: { message: "canceling statement due to statement timeout" },
    },
  });

  // Ignoré, l'échec fait glisser au candidat suivant : le meilleur contenu de
  // la liste est écarté en silence chaque fois que la base tousse.
  await assertRejects(
    () => trouverCandidatVariation(supabase, REGLAGES),
    Error,
    "statement timeout",
  );
});

Deno.test("tout lisible et aucune variation existante : le candidat est rendu", async () => {
  const supabase = fauxClient({
    "contenu_langues:": { data: [ligneLangue()], error: null },
    "contenus:id+import_statut+statut": { data: ligneContenu(), error: null },
    "contenus:parent_id+variation_langue": { data: null, error: null },
  });

  const candidat = await trouverCandidatVariation(supabase, REGLAGES);
  assertEquals(candidat?.contenuId, "c1");
  assertEquals(candidat?.langue, "fr");
});

Deno.test("une variation existe déjà : le candidat est écarté, sans erreur", async () => {
  const supabase = fauxClient({
    "contenu_langues:": { data: [ligneLangue()], error: null },
    "contenus:id+import_statut+statut": { data: ligneContenu(), error: null },
    "contenus:parent_id+variation_langue": { data: { id: "var1" }, error: null },
  });

  assertEquals(await trouverCandidatVariation(supabase, REGLAGES), null);
});
