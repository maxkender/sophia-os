/** Code langue canonique quelle que soit la casse saisie. */
import { assertEquals } from "jsr:@std/assert@1";

import { canoniserLangue, LANGUES_CIBLES } from "./langues_cibles.ts";

Deno.test("canoniserLangue : la variante régionale garde sa casse canonique", () => {
  assertEquals(canoniserLangue("pt-br"), "pt-BR");
  assertEquals(canoniserLangue(" PT-BR "), "pt-BR");
  assertEquals(canoniserLangue("ES-419"), "es-419");
  assertEquals(canoniserLangue("FR"), "fr");
  assertEquals(canoniserLangue("pt"), "pt");
});

Deno.test("canoniserLangue : inconnu en minuscules, vide reste vide", () => {
  assertEquals(canoniserLangue("XX"), "xx");
  assertEquals(canoniserLangue(""), "");
  assertEquals(canoniserLangue(null), "");
  assertEquals(canoniserLangue(undefined), "");
});

Deno.test("canoniserLangue : chaque langue cible est son propre code canonique", () => {
  for (const code of LANGUES_CIBLES) {
    assertEquals(canoniserLangue(code), code);
    assertEquals(canoniserLangue(code.toUpperCase()), code);
  }
});
