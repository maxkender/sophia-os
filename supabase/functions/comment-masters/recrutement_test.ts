import { assert, assertEquals } from "jsr:@std/assert@1";

import { NOMS_LANGUES, textesOffre } from "./recrutement.ts";

Deno.test("recrutement : le texte de Max, titulaire et suppléant, montant par commentaire", () => {
  const t = textesOffre("es", "titulaire", 0.35);
  assertEquals(t.texte,
    "Become the Comment Master for Spanish: you'll get a Slack message when one of our posts takes off, you post the comment we give you from your account within 3 hours, and you earn 0.35 $ per comment.");
  assertEquals(t.accepter, "Accept");
  assertEquals(t.refuser, "No thanks");
  assert(textesOffre("pl", "suppleant", 0.5).titre.includes("backup Comment Master for Polish"));
  for (const l of ["es", "ro", "sv", "cs", "sr", "pl", "sl", "lt", "bg", "no", "he", "nl", "fi", "et", "lv", "ar"]) assert(NOMS_LANGUES[l], l);
  assert(!JSON.stringify(t).toLowerCase().match(/\bbot\b|\bai\b|automat/));
});
