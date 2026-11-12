import { assert, assertEquals } from "jsr:@std/assert@1";

import { documentsDansLePlafond, pourPlateforme, reponseCtx } from "./support_sources.ts";
import { notesSupport } from "./faq_moteur.ts";

Deno.test("0680 : la réponse d'une ligne du bot FAQ, sans « Question : »", () => {
  assertEquals(reponseCtx("Question : Hi what to answer here?\n\nRéponse : Do not answer"), "Do not answer");
  assertEquals(reponseCtx("Juste un texte"), "Juste un texte");
  assertEquals(reponseCtx("Question : x\n\nReponse : <b>Yes</b> sure"), "Yes  sure");
});

Deno.test("0680 : une ligne Upwork ne sert pas à un posteur Ruul", () => {
  assert(pourPlateforme("tous", "ruul"));
  assert(pourPlateforme("ruul", "ruul"));
  assert(!pourPlateforme("upwork", "ruul"));
  assert(pourPlateforme("upwork", null));
  assert(pourPlateforme(null, "upwork"));
});

Deno.test("0680 : documents dans l'ordre, coupés au plafond, les vides sautés", () => {
  const docs = [{ titre: "A", texte: "a".repeat(600) }, { titre: "Vide", texte: "  " }, { titre: "B", texte: "b".repeat(2000) }, { titre: "C", texte: "c" }];
  const r = documentsDansLePlafond(docs, 1500);
  assertEquals(r.map((d) => d.titre), ["A", "B"]);
  assert(r[1].texte.endsWith("[…coupé]"));
  assertEquals(documentsDansLePlafond(docs, 100_000).map((d) => d.titre), ["A", "B", "C"]);
});

Deno.test("0680 : les consignes et documents de Support entrent dans la base des autres bots", () => {
  const notes = notesSupport([{ titre: "Comment fonctionne", contenu: "x", audience: "poster" }, { titre: "HM", contenu: "y", audience: "hm" }],
    [{ texte: "Ne promets jamais de date." }], [{ regle: "Ne parle jamais de bot." }]);
  assertEquals(notes.map((n) => n.audience), ["all", "poster", "hiring_manager"]);
  assert(notes[0].contenu.includes("- Ne promets jamais de date.\n- Ne parle jamais de bot."));
  assertEquals(notesSupport(null, null, null), []);
});
