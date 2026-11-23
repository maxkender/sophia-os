import { assert, assertEquals } from "jsr:@std/assert@1";

import { MODELES_V2, problemesModele, requeteModele } from "./whatsapp_modeles_v2.ts";

Deno.test("les 5 modèles v2 respectent les règles de Meta et les nôtres", () => {
  assertEquals(MODELES_V2.length, 5);
  for (const m of MODELES_V2) assertEquals(problemesModele(m), [], m.nom);
});

Deno.test("le warm-up dit la niche, Ruul ne dépend pas d'un email", () => {
  const w = MODELES_V2.find((m) => m.nom === "warmup_start")!;
  assert(w.corps.includes("Follow at least 5 accounts about {{3}}"));
  const r = MODELES_V2.find((m) => m.nom === "ruul_payment_setup")!;
  assert(!/email/i.test(r.corps));
});

Deno.test("la requête Meta : corps, exemples et boutons lien", () => {
  const q = requeteModele(MODELES_V2[0]);
  assertEquals(q.category, "UTILITY");
  assertEquals(q.components.length, 2);
  assertEquals((q.components[0] as { example: { body_text: string[][] } }).example.body_text[0].length, 5);
});

Deno.test("les garde-fous attrapent un modèle invalide", () => {
  const p = problemesModele({ nom: "x", variables: ["a"], corps: "{{1}} hello bot", exemples: ["a"], boutons: [] });
  assert(p.includes("commence ou finit par une variable"));
  assert(p.includes("mot interdit (bot / AI / automatique)"));
});
