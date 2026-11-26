import { assertEquals } from "jsr:@std/assert@1";

import { genreDuLabel } from "./label_theme.ts";

Deno.test("genre d'un label d'après son nom : man / men / guy en mots entiers ; jamais un morceau de mot", () => {
  assertEquals(genreDuLabel("looksmaxxing_man"), "homme");
  assertEquals(genreDuLabel("rules_for_men"), "homme");
  assertEquals(genreDuLabel("male_gym"), "homme");
  assertEquals(genreDuLabel("asia_girl"), "femme");
  assertEquals(genreDuLabel("woman_power"), "femme");
  assertEquals(genreDuLabel("human_body"), null);
  assertEquals(genreDuLabel("manga_facts"), null);
  assertEquals(genreDuLabel("History"), null);
});
