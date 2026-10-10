/**
 * Choix du label et de la répartition à la création d'un compte : qui peut,
 * ce qui est valide, et quel label peut porter quelle répartition.
 *
 * La règle des DEUX NIVEAUX : le label dit ce que le compte PEUT promouvoir,
 * la répartition choisit parmi ça. Un compte 100 % Unswipe doit donc naître
 * avec un label qui sert Unswipe — partagé Sophia + Unswipe compris, puisque
 * c'est la répartition, pas le label, qui le cantonne à Unswipe.
 */
import { assertEquals } from "jsr:@std/assert@1";

import {
  applicationsRequises,
  choixApplicableAuCompte,
  labelChoisiCompatible,
  labelServitToutes,
  lireChoixCompte,
  peutChoisirCompte,
  validerParts,
} from "./creation_compte_apps.ts";
import { ID_SOPHIA } from "./multi_app.ts";

const UNSWIPE = "00000000-0000-4000-8000-000000000003";
const LABEL = "11111111-2222-4333-8444-555555555555";
const SLUGS = ["sophia", "unswipe"];
const APPS = [
  { id: ID_SOPHIA, slug: "sophia" },
  { id: UNSWIPE, slug: "unswipe" },
];

const liens = [
  { label_id: "unswipe-seul", application_id: UNSWIPE },
  { label_id: "partage", application_id: ID_SOPHIA },
  { label_id: "partage", application_id: UNSWIPE },
];

// ---------------------------------------------------------------------------
// Lecture du corps et rôle
// ---------------------------------------------------------------------------

Deno.test("absents ou null : aucun choix, quel que soit le rôle (chemin historique)", () => {
  for (const role of ["admin", "head_of_ops", "hiring_manager", "directing_manager", ""]) {
    assertEquals(lireChoixCompte({}, role), { ok: true, choix: null }, role);
    assertEquals(
      lireChoixCompte({ label_id: null, parts_applications: null }, role),
      { ok: true, choix: null },
      role,
    );
    assertEquals(lireChoixCompte(undefined, role), { ok: true, choix: null }, role);
  }
});

Deno.test("seuls admin et head_of_ops choisissent ; les autres → 403 CHOIX_COMPTE_ADMIN", () => {
  assertEquals(peutChoisirCompte("admin"), true);
  assertEquals(peutChoisirCompte("head_of_ops"), true);
  for (const role of ["hiring_manager", "directing_manager", "poster", "", null, undefined]) {
    assertEquals(peutChoisirCompte(role), false, String(role));
    for (const body of [
      { label_id: LABEL },
      { parts_applications: { unswipe: 100 } },
      // Une valeur non nulle, même absurde : le rôle passe AVANT la forme.
      { label_id: "" },
      { parts_applications: "n'importe quoi" },
    ]) {
      assertEquals(
        lireChoixCompte(body, role),
        { ok: false, erreur: "CHOIX_COMPTE_ADMIN", statut: 403 },
        `${String(role)} ${JSON.stringify(body)}`,
      );
    }
  }
});

Deno.test("label_id : uuid seulement, normalisé en minuscules", () => {
  assertEquals(lireChoixCompte({ label_id: ` ${LABEL.toUpperCase()} ` }, "admin"), {
    ok: true,
    choix: { labelId: LABEL, partsBrutes: null },
  });
  for (const mauvais of ["", "pas-un-uuid", 42, {}, [LABEL], true]) {
    assertEquals(
      lireChoixCompte({ label_id: mauvais }, "head_of_ops"),
      { ok: false, erreur: "REPARTITION_INVALIDE", statut: 400 },
      JSON.stringify(mauvais),
    );
  }
});

Deno.test("parts_applications reçu tel quel, validé plus tard contre la table applications", () => {
  assertEquals(lireChoixCompte({ parts_applications: { unswipe: 100 } }, "admin"), {
    ok: true,
    choix: { labelId: null, partsBrutes: { unswipe: 100 } },
  });
  assertEquals(
    lireChoixCompte({ label_id: LABEL, parts_applications: { sophia: 70, unswipe: 30 } }, "admin"),
    { ok: true, choix: { labelId: LABEL, partsBrutes: { sophia: 70, unswipe: 30 } } },
  );
});

Deno.test("un choix ne vaut que pour un compte perso slideshow", () => {
  assertEquals(choixApplicableAuCompte({ typeCompte: "perso", ugcAiVideo: false }), true);
  assertEquals(choixApplicableAuCompte({ typeCompte: "perso", ugcAiVideo: true }), false);
  assertEquals(choixApplicableAuCompte({ typeCompte: "cm", ugcAiVideo: false }), false);
  assertEquals(choixApplicableAuCompte({ typeCompte: "aucun", ugcAiVideo: false }), false);
});

// ---------------------------------------------------------------------------
// Validation des parts
// ---------------------------------------------------------------------------

Deno.test("parts valides : entiers 1..100, slugs existants, somme exactement 100", () => {
  assertEquals(validerParts({ unswipe: 100 }, SLUGS), { unswipe: 100 });
  assertEquals(validerParts({ sophia: 70, unswipe: 30 }, SLUGS), { sophia: 70, unswipe: 30 });
  assertEquals(validerParts({ sophia: 1, unswipe: 99 }, SLUGS), { sophia: 1, unswipe: 99 });
});

Deno.test("parts invalides → null (REPARTITION_INVALIDE)", () => {
  const invalides: unknown[] = [
    null,
    undefined,
    {},
    [],
    [100],
    "sophia",
    100,
    { sophia: 70, unswipe: 20 }, // somme 90
    { sophia: 70, unswipe: 40 }, // somme 110
    { sophia: 100, unswipe: 0 }, // 0 hors bornes
    { sophia: 110, unswipe: -10 }, // hors bornes, même si la somme fait 100
    { sophia: 50.5, unswipe: 49.5 }, // pas des entiers
    { sophia: "70", unswipe: 30 }, // chaîne
    { micabo: 100 }, // slug supprimé
    { inconnue: 50, sophia: 50 },
    { Sophia: 100 }, // casse exacte
    { sophia: Number.NaN },
  ];
  for (const brut of invalides) {
    assertEquals(validerParts(brut, SLUGS), null, JSON.stringify(brut));
  }
});

// ---------------------------------------------------------------------------
// Applications requises et compatibilité du label
// ---------------------------------------------------------------------------

Deno.test("applications requises = ids des applications à part > 0, triés", () => {
  assertEquals(applicationsRequises(null, APPS), []);
  assertEquals(applicationsRequises({ unswipe: 100 }, APPS), [UNSWIPE]);
  assertEquals(applicationsRequises({ sophia: 70, unswipe: 30 }, APPS), [ID_SOPHIA, UNSWIPE].sort());
  // Slug sans application connue : ignoré (validerParts l'a déjà refusé).
  assertEquals(applicationsRequises({ fantome: 100 }, APPS), []);
});

Deno.test("label partagé Sophia + Unswipe : porte un compte 100 % Unswipe (deux niveaux)", () => {
  assertEquals(labelServitToutes("partage", liens, [UNSWIPE]), true);
  assertEquals(labelServitToutes("partage", liens, [ID_SOPHIA, UNSWIPE]), true);
  assertEquals(labelServitToutes("partage", liens, []), true);
});

Deno.test("label Unswipe seul : jamais un compte qui a une part Sophia", () => {
  assertEquals(labelServitToutes("unswipe-seul", liens, [UNSWIPE]), true);
  assertEquals(labelServitToutes("unswipe-seul", liens, [ID_SOPHIA]), false);
  assertEquals(labelServitToutes("unswipe-seul", liens, [ID_SOPHIA, UNSWIPE]), false);
});

Deno.test("label sans ligne label_applications : sert Sophia seule (héritage)", () => {
  assertEquals(labelServitToutes("ancien", liens, [ID_SOPHIA]), true);
  assertEquals(labelServitToutes("ancien", liens, [UNSWIPE]), false);
  assertEquals(labelServitToutes("ancien", [], [ID_SOPHIA]), true);
});

Deno.test("label choisi : inexistant, système ou UGC AI VIDEO → LABEL_INCOMPATIBLE", () => {
  assertEquals(labelChoisiCompatible(null, liens, []), false);
  assertEquals(labelChoisiCompatible(undefined, liens, []), false);
  assertEquals(labelChoisiCompatible({ id: "hook", slug: "hook", nom: "Hook" }, [], []), false);
  assertEquals(
    labelChoisiCompatible({ id: "marque", slug: "ugc-ai-video", nom: "UGC AI VIDEO" }, [], []),
    false,
  );
  assertEquals(
    labelChoisiCompatible({ id: "video", slug: "test", nom: "test", ugc_ai_video: true }, [], []),
    false,
  );
});

Deno.test("label choisi slideshow : compatible ssi il sert toutes les applications à part > 0", () => {
  const partage = { id: "partage", slug: "partage", nom: "Partagé", ugc_ai_video: false };
  const unswipeSeul = { id: "unswipe-seul", slug: "u", nom: "U", ugc_ai_video: false };
  const ancien = { id: "ancien", slug: "ancien", nom: "Ancien", ugc_ai_video: null };

  // Sans répartition : tout label slideshow passe (le défaut fera avec).
  for (const l of [partage, unswipeSeul, ancien]) {
    assertEquals(labelChoisiCompatible(l, liens, []), true, l.id);
  }
  // 100 % Unswipe.
  assertEquals(labelChoisiCompatible(partage, liens, [UNSWIPE]), true);
  assertEquals(labelChoisiCompatible(unswipeSeul, liens, [UNSWIPE]), true);
  assertEquals(labelChoisiCompatible(ancien, liens, [UNSWIPE]), false);
  // 70 / 30.
  assertEquals(labelChoisiCompatible(partage, liens, [ID_SOPHIA, UNSWIPE]), true);
  assertEquals(labelChoisiCompatible(unswipeSeul, liens, [ID_SOPHIA, UNSWIPE]), false);
  assertEquals(labelChoisiCompatible(ancien, liens, [ID_SOPHIA, UNSWIPE]), false);
});
