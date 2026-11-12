import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  depuisAideSlack,
  ficheTexte,
  libelleCategorie,
  parleDeLAutrePlateforme,
  niveauQuestionPersonnelle,
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

Deno.test("12/11 : « my account » (TikTok) n'est plus une question perso ; la paie va à Max", () => {
  assert(!questionPersonnelle(
    "After reaching 1,000 followers, I received a message asking me to add a link to the Links section of my TikTok profile. I've checked my profile settings, but the option simply isn't available on my account.",
  ));
  assert(questionPersonnelle("I can't access my Upwork account"));
  assert(questionPersonnelle("The milestone on Upwork is blocked, I still haven't received my payment"));
  assertEquals(niveauQuestionPersonnelle("I haven't been paid for last week"), { categorie: "paiement", niveau: "max" });
  // 12/11 (Max) : TikTok, les posts ou l'app → réponse directe, jamais « use Help ».
  assert(!questionPersonnelle("My TikTok account got banned, what do I do?"));
  assert(!questionPersonnelle("I can't log in to my TikTok account"));
  assert(!questionPersonnelle("My post got 0 views, is my account shadowbanned?"));
  assert(!questionPersonnelle("I can't find the link section on my profile"));
  assert(!questionPersonnelle("How do I save the photos from the app on my phone?"));
  assert(questionPersonnelle("I posted all week but I haven't been paid"));
  assert(questionPersonnelle("I can't log in to my dashboard"));
  assertEquals(niveauQuestionPersonnelle("I can't log in to my dashboard"), { categorie: "compte", niveau: "adrien" });
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
  assertStringIncludes(a, "paiement / urgent");
  assertStringIncludes(a, "Ruul");
  assertStringIncludes(a, "/admin/auto/support");
  // 12/11 (Support propre) : qui / quoi / ce que dit l'OS / ce que dit le posteur / action proposée.
  const b = texteAlerteMax({ nom: "Ana", plateforme: "upwork", categorie: "autre", texte: "I will report you", raison: "urgent", os: "Menace de plainte.", action: "Answer calmly." }, "https://os.example/");
  assertStringIncludes(b, "🔴 Support : urgent — Ana (Upwork");
  assertStringIncludes(b, "Le posteur : « I will report you »");
  assertStringIncludes(b, "L'OS : Menace de plainte.");
  assertStringIncludes(b, "Action proposée : Answer calmly.");
  assertStringIncludes(b, "https://os.example/admin/auto/support");
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
