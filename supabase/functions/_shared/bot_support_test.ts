import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  accuseReception, ACTIONS, appliquerGardeFous, type DecisionBot, lireDecision, lireTop10, promptBot, signer, testOk, TEXTE_ON_VERIFIE, texteBugMax, texteListeAdrien, texteTop10,
  troisPhrases,
} from "./bot_support.ts";

const base: DecisionBot = {
  langue: "en", categorie: "paie", personnel: false, reponse: "You are paid every Monday.", action: null, action_valeur: null,
  niveau: "bot", regle: "paie_ruul", risque: [], raison: "",
};
const o = { source: "help" as const, plateforme: "ruul" as const, lienHelp: "https://os/createur/help", nbMemeSujet: 0 };

Deno.test("bot v2 : la décision du modèle est lue, une action hors liste est ignorée", () => {
  const d = lireDecision('x {"langue":"fr","categorie":"login","personnel":true,"reponse":"Done.","action":"supprimer_compte","niveau":"bot","risque":["scam","nimporte"],"raison":"r"}');
  assertEquals(d?.action, null);
  assertEquals(d?.risque, ["scam"]);
  assertEquals(lireDecision('{"niveau":"chef"}'), null);
});

Deno.test("bot v2 : risque d'argent ou de fraude → Max ; autre risque → Adrien ; 3e fois → Adrien", () => {
  assertEquals(appliquerGardeFous({ ...base, risque: ["argent_tiers"] }, o).niveau, "max");
  assertEquals(appliquerGardeFous({ ...base, risque: ["enerve"] }, o).niveau, "adrien");
  assertEquals(appliquerGardeFous({ ...base, risque: ["scam"] }, o).niveau, "adrien");
  const r = appliquerGardeFous(base, { ...o, nbMemeSujet: 2 });
  assertEquals(r.niveau, "adrien");
  assert(r.risque.includes("repetition"));
});

Deno.test("bot v2 : jamais l'autre plateforme, jamais « bot » ni « IA », 3 phrases au plus", () => {
  const r = appliquerGardeFous({ ...base, reponse: "Check your Upwork milestone." }, o);
  assertEquals(r.reponse, TEXTE_ON_VERIFIE);
  assertEquals(r.niveau, "adrien");
  assertEquals(appliquerGardeFous({ ...base, reponse: "I'm an AI assistant. You are paid on Monday." }, o).reponse, "You are paid on Monday.");
  assertEquals(troisPhrases("One. Two! Three? Four."), "One. Two! Three?");
  assertEquals(troisPhrases("See https://a.notion.site/x. Then post."), "See https://a.notion.site/x. Then post.");
});

Deno.test("bot v2 : salon public, sujet perso ou montant → Help, jamais de montant", () => {
  const s = { ...o, source: "slack_salon" as const };
  assertStringIncludes(appliquerGardeFous({ ...base, personnel: true }, s).reponse, "Please use Help on your dashboard");
  assertStringIncludes(appliquerGardeFous({ ...base, reponse: "You'll get 14 $ on Monday." }, s).reponse, "Please use Help");
  assertEquals(appliquerGardeFous({ ...base, reponse: "Post 2 a day." }, s).reponse, "Post 2 a day.");
});

Deno.test("bot v2 : signature, prompt, test vert / rouge", () => {
  assertStringIncludes(signer("Hi."), "the Vik Studios team");
  const p = promptBot({ message: "hi", source: "help", plateforme: "upwork", fiche: "F", contexte: "", infos: [{ titre: "Paie", valeur: "Monday" }], catalogue: [], historique: [] });
  assertStringIncludes(p, "N'invente JAMAIS");
  assertStringIncludes(p, "Plateforme de paie du posteur : Upwork");
  assert(testOk({ niveau: "bot", reponse: "Paid on Monday", action: null }, { attendu_niveau: "bot", attendu_contient: ["monday"], attendu_action: null }));
  assert(!testOk({ niveau: "adrien", reponse: "x", action: null }, { attendu_niveau: "bot", attendu_contient: [], attendu_action: null }));
});

Deno.test("accuseReception : les simples merci / ok ne reçoivent rien", () => {
  for (const t of ["ok", "Thanks!", "thank you so much", "👍", ":pray:", "merci", "Got it."]) assertEquals(accuseReception(t), true, t);
  for (const t of ["ok but when do I get paid?", "Thanks, I can't log in", "Is the warm-up paid?"]) assertEquals(accuseReception(t), false, t);
  // 13/11 (Max) : les promesses et accusés courts ne créent pas de demande.
  for (const t of ["I'll do it tonight", "Ok thanks, I will do it tomorrow!", "Will do", "On it.", "Understood, thank you", "I'm doing it now", "Thank you, I'll finish it later"]) {
    assertEquals(accuseReception(t), true, t);
  }
  for (const t of ["I'll do it tonight but where is the warm-up button?", "I will not do it", "I can't do it, my account is banned", "I'll do it tonight, can you send the link?"]) {
    assertEquals(accuseReception(t), false, t);
  }
});

Deno.test("top 10 : lecture du JSON et texte du lundi", () => {
  const top = lireTop10('voici {"top": [{"question": "Can I post twice a day?", "fois": 4, "reponse": "Yes."}, {"bad": 1}]}');
  assertEquals(top, [{ question: "Can I post twice a day?", fois: 4, reponse: "Yes." }]);
  assertEquals(lireTop10("rien"), []);
  const t = texteTop10(top, "https://os.test/");
  assertEquals(t.includes("1. Can I post twice a day? (4×)"), true);
  assertEquals(t.endsWith("https://os.test/admin/bot"), true);
});

Deno.test("liste d'Adrien : vide et remplie", () => {
  assertEquals(texteListeAdrien([], "https://os.test").startsWith("Support : rien d'ouvert"), true);
  const t = texteListeAdrien([{ nom: "Alex T", plateforme: "ruul", categorie: "compte", texte: "My  account\nis blocked", attente: true, heures: 30 }], "https://os.test");
  assertEquals(t.includes("1. Alex T (Ruul, compte, 1 j) · attend le posteur : « My account is blocked »"), true);
});

Deno.test("prevenir_max : action reconnue et DM à Max pour un bug", () => {
  assertEquals(ACTIONS.includes("prevenir_max"), true);
  const d = lireDecision('{"langue":"en","categorie":"bug","personnel":false,"reponse":"Press and hold the text to copy it.","action":"prevenir_max","niveau":"bot","risque":[],"raison":"r"}');
  assertEquals(d?.action, "prevenir_max");
  const t = texteBugMax({ nom: "Alex T", plateforme: "upwork", message: "the tap  to copy\nbutton doesnt work", reponse: "Press and hold.", raison: "Bouton copier." }, "https://os.test/");
  assertStringIncludes(t, "🛠️ Bug du dashboard — Alex T (Upwork)");
  assertStringIncludes(t, "« the tap to copy button doesnt work »");
  assertStringIncludes(t, "https://os.test/admin/bot");
});

Deno.test("0677 : les consignes de Max passent dans le prompt, avant le catalogue", () => {
  const entree = {
    message: "When am I paid?", source: "help" as const, plateforme: "ruul" as const, fiche: "f", contexte: "", infos: [],
    catalogue: [], historique: [], consignes: ["Never promise a pay date other than Monday"],
  };
  const p = promptBot(entree);
  assertStringIncludes(p, "- Never promise a pay date other than Monday");
  assert(p.indexOf("CONSIGNES DE MAX") < p.indexOf("CATALOGUE"));
  assertStringIncludes(promptBot({ ...entree, consignes: [] }), "CONSIGNES DE MAX (elles passent avant tout le reste, y compris le catalogue)\n(aucune)");
});
