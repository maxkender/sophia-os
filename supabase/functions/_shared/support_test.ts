import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  depuisAideSlack,
  ficheTexte,
  libelleCategorie,
  parleDeLAutrePlateforme,
  questionPersonnelle,
  texteAlerteMax,
  texteProblemeRecu,
  texteRenvoiHelp,
  urgence,
} from "./support.ts";

Deno.test("0671 : « compte » dit Ruul account ou Upwork contract, jamais l'autre", () => {
  assertEquals(libelleCategorie("compte", "ruul"), "Ruul account");
  assertEquals(libelleCategorie("compte", "upwork"), "Upwork contract");
  assertEquals(libelleCategorie("paiement", "ruul"), "Payment");
  assertEquals(libelleCategorie(null, "upwork"), "Other");
});

Deno.test("0671 : urgence rouge = paiement, orange = compte et login, gris = le reste", () => {
  assertEquals(urgence("paiement"), "rouge");
  assertEquals(urgence("compte"), "orange");
  assertEquals(urgence("connexion"), "orange");
  assertEquals(urgence("tiktok"), "gris");
  assertEquals(urgence(null), "gris");
});

Deno.test("0671 : la fiche dit la plateforme et la règle (jamais l'autre)", () => {
  const ruul = ficheTexte({ nom: "Ana", plateforme: "ruul", debut: "2026-11-16", manque: ["finish your Ruul account"], ruul: { statut: "invite", email_ruul: true } });
  assertStringIncludes(ruul, "Plateforme de paie : Ruul");
  assertStringIncludes(ruul, "Ne parle JAMAIS d'Upwork");
  assertStringIncludes(ruul, "2026-11-16");
  assertStringIncludes(ruul, "finish your Ruul account");
  const up = ficheTexte({ nom: "Bo", plateforme: "upwork", contrat_upwork: "44000000", manque: [] });
  assertStringIncludes(up, "Ne parle JAMAIS de Ruul");
  assertStringIncludes(up, "Étapes manquantes : aucune");
  assertEquals(ficheTexte(null), "Fiche du posteur : inconnue.");
});

Deno.test("0671 : garde-fou Ruul / Upwork sur la réponse du bot", () => {
  assert(parleDeLAutrePlateforme("Check your Upwork milestone.", "ruul"));
  assert(!parleDeLAutrePlateforme("You are paid every Monday via Ruul.", "ruul"));
  assert(parleDeLAutrePlateforme("Your Ruul invoice", "upwork"));
  assert(!parleDeLAutrePlateforme("Your milestone is funded on Monday.", "upwork"));
});

Deno.test("0671 : question personnelle sur Slack → renvoi vers Help", () => {
  assert(questionPersonnelle("Hi, I haven't been paid for last week"));
  assert(questionPersonnelle("my contract was closed?"));
  assert(questionPersonnelle("I can't login to my account"));
  assert(!questionPersonnelle("How many posts per day should we do?"));
  assert(!questionPersonnelle("What time do the slides come out?"));
  assertStringIncludes(texteRenvoiHelp("https://os.example/"), "https://os.example/createur/help");
});

Deno.test("0671 : I need help (Slack) → question ou problème", () => {
  assertEquals(depuisAideSlack("paie"), { type: "probleme", categorie: "paiement" });
  assertEquals(depuisAideSlack("connexion"), { type: "probleme", categorie: "connexion" });
  assertEquals(depuisAideSlack("tiktok"), { type: "probleme", categorie: "tiktok" });
  assertEquals(depuisAideSlack("post"), { type: "question", categorie: "posting" });
  assertEquals(depuisAideSlack("autre"), { type: "question", categorie: "autre" });
});

Deno.test("0671 : textes au posteur (anglais) et alerte à Max (français)", () => {
  assertStringIncludes(texteProblemeRecu("connexion", "lien_envoye"), "emailed you a link");
  assertStringIncludes(texteProblemeRecu("paiement", null), "Payment issues are checked first");
  const a = texteAlerteMax({ nom: "Ana", plateforme: "ruul", categorie: "paiement", texte: "Not paid", raison: "paiement" }, "https://os.example");
  assertStringIncludes(a, "problème de paiement");
  assertStringIncludes(a, "Ruul");
  assertStringIncludes(a, "/admin/auto/support");
});

Deno.test("0673 : contexte coupé, verdict lu (et refusé s'il est invalide)", async () => {
  const { contexteTexte, lireVerdict, promptVerdict } = await import("./support.ts");
  assertEquals(contexteTexte(null), "");
  assert(contexteTexte({ x: "a".repeat(10_000) }, 500).length <= 501);
  assertEquals(lireVerdict('ok {"verdict":"pas_de_probleme","phrase":"Payé le 10/11, 25 $."}'), { verdict: "pas_de_probleme", phrase: "Payé le 10/11, 25 $." });
  assertEquals(lireVerdict('{"verdict":"peut-etre","phrase":"x"}'), null);
  assertEquals(lireVerdict('{"verdict":"incertain","phrase":""}'), null);
  assertStringIncludes(promptVerdict({ categorie: "paiement", texte: "not paid", fiche: "F", contexte: "C" }), "Jamais d'invention");
});
