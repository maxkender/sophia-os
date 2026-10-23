import { assertEquals } from "jsr:@std/assert@1";

import {
  formaterAncres,
  parseJsonModele,
  slidesDepuisTexte,
  texteAncre,
} from "./traduction_native.ts";

Deno.test("slides depuis un texte collé : blocs séparés par une ligne vide ou ---", () => {
  assertEquals(
    slidesDepuisTexte("hook\n\nconseil 1\nsuite\n\n---\n\nconseil 2"),
    [
      { position: 1, original: "hook" },
      { position: 2, original: "conseil 1\nsuite" },
      { position: 3, original: "conseil 2" },
    ],
  );
  assertEquals(slidesDepuisTexte("  seule slide  "), [{
    position: 1,
    original: "seule slide",
  }]);
  assertEquals(slidesDepuisTexte(""), []);
});

Deno.test("JSON du modèle avec ou sans bloc de code", () => {
  assertEquals(parseJsonModele<{ a: number }>('```json\n{"a":1}\n```'), {
    a: 1,
  });
  assertEquals(parseJsonModele<{ a: number }>('{"a":2}'), { a: 2 });
  assertEquals(parseJsonModele("pas du json"), null);
});

Deno.test("ancre : slides dans l'ordre, sans la slide Sophia, sans les vides", () => {
  const slides = [
    {
      position: 3,
      texte_overlay: "Essaie l'appli Sophia",
      position_sophia: true,
    },
    {
      position: 2,
      texte_overlay: "deuxième  \n ligne",
      position_sophia: false,
    },
    { position: 1, texte_overlay: "accroche" },
    { position: 4, texte_overlay: "   " },
  ];
  assertEquals(texteAncre(slides), "accroche\ndeuxième\nligne");
  assertEquals(texteAncre(null), "");
  const f = formaterAncres([{ texte: "a\nb", vues: 12345 }, {
    texte: "c",
    vues: null,
  }]);
  assertEquals(f.startsWith("--- Exemple natif 1 (12"), true);
  assertEquals(f.includes("--- Exemple natif 2 ---\nc"), true);
});
