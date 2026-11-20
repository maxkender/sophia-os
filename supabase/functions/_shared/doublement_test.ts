import { assert, assertEquals } from "jsr:@std/assert@1";

import { lundiEnClair, reponseDouble, texteDemarrageDouble, texteOffreDouble } from "./doublement.ts";

Deno.test("textes du doublement", () => {
  assertEquals(lundiEnClair("2026-11-23"), "Monday, November 23");
  const o = texteOffreDouble({ prenom: "Ana", handle: "ana.reads", tarif: 14, lundi: "2026-11-23", canal: "upwork" });
  assert(o.startsWith("Hi Ana, @ana.reads is doing great."));
  assert(o.includes("from 14 $ to 28 $"));
  assert(!o.includes("style"));
  assert(o.includes("reply YES here"));
  assert(o.includes("before Sunday 23:59 (Paris time)"));
  assert(texteOffreDouble({ prenom: null, handle: null, tarif: 10, lundi: "2026-11-23", canal: "ruul" }).includes("reply YES to this email"));
  assertEquals(
    texteDemarrageDouble({ handle1: "a1", handle2: "@b2", tarif: 10, lundi: "2026-11-30" }),
    "From Monday, November 30 you manage 2 accounts: @a1 and @b2. Your weekly pay is now 20 $.",
  );
});

Deno.test("réponse courte à la proposition, toutes langues", () => {
  for (const m of ["Yes!", "yes please", "Oui", "Evet", "sí", "Ja", "ok 👍", "Hi, yes", "yes, thanks", "JAH", "Jā"]) {
    assertEquals(reponseDouble(m.replace(" please", "")), "oui", m);
  }
  for (const m of ["No", "non merci", "Hayır", "no thanks"]) assertEquals(reponseDouble(m), "non", m);
  // Une phrase avec une question ou une condition : le support normal.
  assertEquals(reponseDouble("Yes but how much will I be paid for the second account exactly?"), null);
  assertEquals(reponseDouble("I can't post today"), null);
  assertEquals(reponseDouble("no posts on my dashboard"), null);
});
