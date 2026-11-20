import { assert, assertEquals } from "jsr:@std/assert@1";

import { decisionUpwork, detecterCasRuul, emailDansMessage, escalader, reponseCasRuul, separerNomLegal, TEXTES_RUUL, texteEtape } from "./ruul_bot.ts";

Deno.test("cas connus Ruul : règles en anglais et en turc", () => {
  assertEquals(detecterCasRuul("I can't log in to Ruul, no code"), "code");
  assertEquals(detecterCasRuul("anything", { estCode: true }), "code");
  assertEquals(detecterCasRuul("I already have a Ruul account with another email"), "autre_email");
  assertEquals(detecterCasRuul("My name doesn't match on Ruul"), "nom");
  assertEquals(detecterCasRuul("Ruul rejected my ID"), "identite");
  assertEquals(detecterCasRuul("My country is not supported on Ruul"), "pays");
  assertEquals(detecterCasRuul("I can't submit my bank details on Ruul, it's stuck"), "bug");
  assertEquals(detecterCasRuul("Kimliğim reddedildi"), "identite");
  assertEquals(detecterCasRuul("Ülkem desteklenmiyor"), "pays");
  assertEquals(detecterCasRuul("Bonjour, je veux savoir quand je poste"), null);
  // La catégorie du modèle (toutes les langues).
  assertEquals(detecterCasRuul("…", { categorie: "ruul_nom" }), "nom");
});

Deno.test("Je veux Upwork : pays refusé → exception ; 1re demande → réponse ; 2e → exception", () => {
  assertEquals(decisionUpwork({ paysRefuse: true, demandesAvant: 0 }), "exception");
  assertEquals(decisionUpwork({ paysRefuse: false, demandesAvant: 0 }), "persuasion");
  assertEquals(decisionUpwork({ paysRefuse: false, demandesAvant: 1 }), "exception");
  assert(TEXTES_RUUL.persuasion.includes("no fees for you"));
  assertEquals(texteEtape({ inscrit: false, identite: false, banque: false }, "a@b.co"), "sign up on app.ruul.io with a@b.co");
  assertEquals(texteEtape({ inscrit: true, identite: true, banque: false }, null), "add your bank account on app.ruul.io");
});

Deno.test("réponses aux cas connus et actions automatiques", () => {
  const base = { email: "ana@example.com", refusIdentite: 0, demandesAvant: 0 };
  assert(reponseCasRuul("code", { ...base, message: "" }).texte.includes("ana@example.com"));
  const e = reponseCasRuul("autre_email", { ...base, message: "my ruul account is Ana.Old@Mail.com" });
  assertEquals(e.action, { type: "email_ruul", valeur: "ana.old@mail.com" });
  assertEquals(reponseCasRuul("autre_email", { ...base, message: "other email" }).action, null);
  assertEquals(reponseCasRuul("nom", { ...base, message: "", nomPropose: "Ana María López" }).action, { type: "nom_legal", valeur: "Ana María López" });
  assertEquals(reponseCasRuul("identite", { ...base, message: "" }).upwork, false);
  assertEquals(reponseCasRuul("identite", { ...base, message: "", refusIdentite: 2 }).upwork, true);
  assertEquals(reponseCasRuul("pays", { ...base, message: "" }).upwork, true);
  assertEquals(reponseCasRuul("bug", { ...base, message: "" }).texte, TEXTES_RUUL.capture);
});

Deno.test("escalade au 3e message sur le même problème ; outils", () => {
  assert(!escalader(1));
  assert(escalader(2));
  assertEquals(emailDansMessage("it's x@y.io thanks"), "x@y.io");
  assertEquals(separerNomLegal("Ana María  López"), { prenom: "Ana", nom: "María López" });
  assertEquals(separerNomLegal("Ana"), null);
});
