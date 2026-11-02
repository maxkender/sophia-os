import { assertEquals } from "jsr:@std/assert@1";

import { couperTexte, texteBienForme, texteBienFormeOuNull } from "./texte_sur.ts";

Deno.test("couperTexte : une coupe au milieu d'un emoji retire la moitié restée seule", () => {
  const legende = "a".repeat(159) + "😀 suite";
  // .slice(0, 160) garde la première moitié de 😀 : c'est ce qui faisait PGRST102.
  assertEquals(legende.slice(0, 160).length, 160);
  const coupe = couperTexte(legende, 160);
  assertEquals(coupe, "a".repeat(159));
  assertEquals(JSON.stringify(coupe).includes("\\ud"), false);
});

Deno.test("couperTexte : un emoji entier avant la limite reste entier", () => {
  assertEquals(couperTexte("ok 😀 fin", 5), "ok 😀");
  assertEquals(couperTexte("court", 160), "court");
});

Deno.test("texteBienForme : retire les moitiés orphelines, garde les emojis entiers", () => {
  assertEquals(texteBienForme("a\uD83Db"), "ab");
  assertEquals(texteBienForme("a\uDE00b"), "ab");
  assertEquals(texteBienForme("Hello 😀 👋🏽 !"), "Hello 😀 👋🏽 !");
  assertEquals(texteBienFormeOuNull(null), null);
  assertEquals(texteBienFormeOuNull("x\uD83D"), "x");
});
