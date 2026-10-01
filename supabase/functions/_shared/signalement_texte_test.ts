/**
 * Les règles qui empêchent un signalement de poster d'abîmer autre chose que
 * la photo signalée : posts publiés intouchables, propagation par media_id et
 * non par position, jamais de doublon d'image dans un post ou un contenu.
 */

import { assertEquals } from "jsr:@std/assert@1";

import {
  choisirRemplacant,
  positionsAPatcher,
  slidesAPropager,
} from "./signalement_texte.ts";

const SALE = "media-sale";
const NEUF = "media-neuf";

function medias(entrees: Record<string, string[]>): Map<string, Set<string>> {
  return new Map(Object.entries(entrees).map(([post, ids]) => [post, new Set(ids)]));
}

Deno.test("un post publié garde sa photo, même signalée", () => {
  const cibles = slidesAPropager({
    slides: [
      { id: "s-publie", post_id: "p-publie" },
      { id: "s-demain", post_id: "p-demain" },
    ],
    postsPublies: new Set(["p-publie"]),
    mediasParPost: medias({ "p-publie": [SALE], "p-demain": [SALE] }),
    remplacant: NEUF,
    dejaTraitees: new Set(),
  });
  assertEquals(cibles, ["s-demain"]);
});

Deno.test("la slide déjà remplacée côté poster n'est pas comptée deux fois", () => {
  const cibles = slidesAPropager({
    slides: [{ id: "s-poster", post_id: "p-poster" }],
    postsPublies: new Set(),
    mediasParPost: medias({ "p-poster": [SALE] }),
    remplacant: NEUF,
    dejaTraitees: new Set(["s-poster"]),
  });
  assertEquals(cibles, []);
});

Deno.test("un post qui porte déjà le remplaçant ne reçoit pas de doublon", () => {
  const cibles = slidesAPropager({
    slides: [
      { id: "s-a", post_id: "p-a" },
      { id: "s-b", post_id: "p-b" },
    ],
    postsPublies: new Set(),
    mediasParPost: medias({ "p-a": [SALE, NEUF], "p-b": [SALE] }),
    remplacant: NEUF,
    dejaTraitees: new Set(),
  });
  assertEquals(cibles, ["s-b"]);
});

Deno.test("deux slides d'un même post sur la photo signalée : une seule remplacée", () => {
  const cibles = slidesAPropager({
    slides: [
      { id: "s-1", post_id: "p" },
      { id: "s-2", post_id: "p" },
    ],
    postsPublies: new Set(),
    mediasParPost: medias({ p: [SALE] }),
    remplacant: NEUF,
    dejaTraitees: new Set(),
  });
  assertEquals(cibles, ["s-1"]);
});

Deno.test("contenu : on repointe la position qui porte la photo, pas une autre", () => {
  // Les positions arrivent parfois en chaîne depuis le JSONB.
  const structure = [
    { position: 1, media_id: "hook" },
    { position: "2", media_id: SALE },
    { position: 3, media_id: "autre" },
  ];
  assertEquals(positionsAPatcher(structure, SALE, NEUF), [2]);
});

Deno.test("contenu qui porte déjà le remplaçant : rien n'est repointé", () => {
  const structure = [
    { position: 1, media_id: NEUF },
    { position: 2, media_id: SALE },
  ];
  assertEquals(positionsAPatcher(structure, SALE, NEUF), []);
});

Deno.test("contenu sans la photo signalée : rien n'est repointé", () => {
  assertEquals(positionsAPatcher([{ position: 1, media_id: "x" }], SALE, NEUF), []);
});

Deno.test("remplaçant : même rôle d'abord, et jamais une photo exclue", () => {
  const hooks = [{ id: "h1", caption: "man lifting weights" }];
  const pool = [
    { id: "p1", caption: "man lifting weights in a gym" },
    { id: "p2", caption: "bowl of salad" },
  ];
  const exclus = new Set([SALE, "p1"]);
  // Slide de contenu : p1 colle mieux mais il est déjà sur le post → p2.
  assertEquals(choisirRemplacant(hooks, pool, false, "weights gym", exclus, () => 0)?.id, "p2");
  // Accroche : on reste chez les hooks.
  assertEquals(choisirRemplacant(hooks, pool, true, "weights gym", exclus, () => 0)?.id, "h1");
});

Deno.test("remplaçant : le rôle voisin sert de repli, puis rien", () => {
  const hooks = [{ id: "h1", caption: "" }];
  assertEquals(choisirRemplacant(hooks, [], false, "", new Set(), () => 0)?.id, "h1");
  assertEquals(choisirRemplacant([], [], false, "", new Set(), () => 0), null);
});

Deno.test("remplaçant : la caption de la photo signalée guide le choix", () => {
  const pool = [
    { id: "salade", caption: "bowl of salad on a table" },
    { id: "salle", caption: "man lifting weights in a gym" },
  ];
  assertEquals(
    choisirRemplacant([], pool, false, "a man lifting heavy weights", new Set(), () => 0)?.id,
    "salle",
  );
});
