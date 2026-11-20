import { assertEquals } from "jsr:@std/assert@1";

import { effetDeclaration } from "./podz_langues.ts";

Deno.test("rien ne change : la même liste qu'hier", () => {
  assertEquals(effetDeclaration(["en", "de"], ["en", "de"], ["en", "de"]), { pretes: null, aOuvrir: [], premiere: false });
});

Deno.test("la soupape a ouvert une langue : la déclaration de l'atelier ne la referme pas", () => {
  // Dorian le 20/11 : hu ouvert à 4 h 40, l'atelier déclare ses 7 langues à 6 h.
  const e = effetDeclaration(["en", "de", "it", "hu"], ["en", "de", "it"], ["en", "de", "it"]);
  assertEquals(e, { pretes: null, aOuvrir: [], premiere: false });
});

Deno.test("l'atelier ajoute une langue à LANGUES : elle s'ouvre, comme avant", () => {
  const e = effetDeclaration(["en", "de"], ["en", "de"], ["en", "de", "tr"]);
  assertEquals(e, { pretes: ["en", "de", "tr"], aOuvrir: ["tr"], premiere: false });
});

Deno.test("l'atelier prépare une langue déjà ouverte : prête, rien à ouvrir", () => {
  const e = effetDeclaration(["en", "de", "hu"], ["en", "de"], ["en", "de", "hu"]);
  assertEquals(e, { pretes: ["en", "de", "hu"], aOuvrir: [], premiere: false });
});

Deno.test("l'atelier retire une langue : elle reste ouverte, seule la liste prête change", () => {
  const e = effetDeclaration(["en", "de", "it"], ["en", "de", "it"], ["en", "de"]);
  assertEquals(e, { pretes: ["en", "de"], aOuvrir: [], premiere: false });
});

Deno.test("la casse ne compte pas (pt-BR, pt-br)", () => {
  const e = effetDeclaration(["en", "pt-BR"], ["en", "pt-br"], ["en", "pt-BR"]);
  assertEquals(e.aOuvrir, []);
});

Deno.test("avant le remplissage de langues_pretes : on ne rouvre rien de ce qui est ouvert", () => {
  const e = effetDeclaration(["en", "de"], null, ["en", "de", "it"]);
  assertEquals(e, { pretes: ["en", "de", "it"], aOuvrir: ["it"], premiere: false });
});

Deno.test("première déclaration d'un podz sans liste", () => {
  assertEquals(effetDeclaration(null, null, ["en"]), { pretes: ["en"], aOuvrir: [], premiere: true });
});
