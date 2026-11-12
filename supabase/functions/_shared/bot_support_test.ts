import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import { appliquerGardeFous, type DecisionBot, lireDecision, promptBot, signer, testOk, TEXTE_ON_VERIFIE, troisPhrases } from "./bot_support.ts";

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
