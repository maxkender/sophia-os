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

Deno.test("0682 : la ligne Ruul vient du statut lu dans Ruul, avec sa date ; vieux de 7 jours = on vérifie", async () => {
  const { ligneRuul } = await import("./support.ts");
  const maintenant = new Date("2026-11-12T16:00:00Z");
  const active = ligneRuul({ compte_ruul: "active", compte_ruul_vu_at: "2026-11-12T15:48:00Z", ajoute_at: "2026-11-12T15:48:00Z", email_ruul: true }, maintenant);
  assert(active.includes("Active (compte relié à Vik Studios)") && active.includes("il y a 0 jour"));
  assert(!active.includes("PLUS DE 7 JOURS"));
  assert(ligneRuul({ compte_ruul: "invited", compte_ruul_vu_at: "2026-11-01T10:00:00Z" }, maintenant).includes("PLUS DE 7 JOURS"));
  assert(ligneRuul({ ajoute_at: null }, maintenant).includes("pas encore ajouté dans Ruul"));
});

Deno.test("0682 : le prompt oblige à vérifier avant d'affirmer et à lire ce qu'on a déjà répondu", async () => {
  const { promptBot } = await import("./bot_support.ts");
  const p = promptBot({ message: "I wasn't paid", source: "help", plateforme: "ruul", fiche: "f", contexte: "c", infos: [], catalogue: [],
    historique: [{ cree_at: "2026-11-10T10:00:00Z", categorie: "paie", texte: "Where is my pay?", bot_reponse: "Finish your Ruul account." }] });
  assert(p.includes("VÉRIFIER AVANT D'AFFIRMER"));
  assert(p.includes("Un compte Ruul « Active » n'est PAS à créer"));
  assert(p.includes("→ on a répondu : Finish your Ruul account."));
});

Deno.test("0683 : plainte de paie Upwork sans aucune paie connue → Max ; pas pour Ruul ni pour une simple question", async () => {
  const { plainteSansDonnees } = await import("./bot_support.ts");
  assert(plainteSansDonnees("My weekly milestone is not funded on Upwork. When will I be paid?", "upwork", true));
  assert(plainteSansDonnees("I haven't received my payment", "upwork", true));
  assert(!plainteSansDonnees("I haven't received my payment", "upwork", false));
  assert(!plainteSansDonnees("I haven't received my payment", "ruul", true));
  assert(!plainteSansDonnees("When do I get paid?", "upwork", true));
});

Deno.test("0683 : jamais « automatic » ni « automated » dans une réponse au posteur", async () => {
  const { appliquerGardeFous } = await import("./bot_support.ts");
  const d = appliquerGardeFous({ langue: "en", categorie: "posting", personnel: true, reponse: "We automatically check account views. You got a new account, keep posting.",
    action: null, action_valeur: null, niveau: "bot", regle: null, risque: [], raison: "x" }, { source: "help", plateforme: "upwork", lienHelp: "l", nbMemeSujet: 0 });
  assert(!/automat/i.test(d.reponse));
  assert(d.reponse.includes("keep posting"));
});
