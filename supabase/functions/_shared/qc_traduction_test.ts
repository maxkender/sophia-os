import { assertEquals } from "jsr:@std/assert@1";

import { estAnglais, lireTraduction, promptTraduction } from "./qc_traduction.ts";

const posts = [
  { id: "a", langue: "fr", slides: [{ texte: "Bonjour" }, { texte: "Télécharge Sophia" }] },
  { id: "b", langue: "de", slides: [{ texte: "Hallo" }] },
];

Deno.test("QC : anglais d'origine repris tel quel", () => {
  assertEquals([estAnglais("en"), estAnglais("en-US"), estAnglais("es"), estAnglais(null)], [true, true, false, false]);
});

Deno.test("QC : le prompt contient chaque post et ses slides", () => {
  const p = promptTraduction(posts);
  assertEquals(p.includes('"id":"a"'), true);
  assertEquals(p.includes("Télécharge Sophia"), true);
});

Deno.test("QC : réponse lue, avec ou sans bloc de code ; nombre de slides vérifié", () => {
  const r = lireTraduction('```json\n{"posts":[{"id":"a","slides":["Hello","Download Sophia"]},{"id":"b","slides":["Hi","extra"]}]}\n```', posts);
  assertEquals(r.get("a"), ["Hello", "Download Sophia"]);
  assertEquals(r.has("b"), false);
  assertEquals(lireTraduction("pas du json", posts).size, 0);
});
