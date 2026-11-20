import { assertEquals } from "jsr:@std/assert@1";

import {
  detecterCas, estDemandeArret, estPasRegle, estProfilUpwork, estQuestionStatut, type EtatReel, ligneStatut, premierJourPostsParis, situation, TEXTES, texteStatut, texteWarmup,
  ditPasRecu, estArretDouteux, estCodeRuul, estQuestionPaie, paieRuulEnRoute, REGLE_PAIE_RUUL, samediDeTraitement, texteArret, texteCodeRuul, textePaieRuul,
} from "./support_regles.ts";

const ruul = { plateforme: "ruul" as const, attenteLienUpwork: false };
const upwork = { plateforme: "upwork" as const, attenteLienUpwork: false };

Deno.test("1. liens de posts : toujours la réponse fixe", () => {
  for (const m of [
    "I get an error when I click Mark as published",
    "my 2nd post is not counted",
    "There is no field to add the link",
    "it says nothing planned for today but I posted",
    "the images changed after I published",
    "I can't add the link of my post",
  ]) assertEquals(detecterCas(m, upwork).cas, "lien_post", m);
  assertEquals(detecterCas("How much do I earn per week?", upwork).cas, null);
});

Deno.test("3. exception Upwork : la demande, le lien, le mauvais lien", () => {
  assertEquals(detecterCas("Can I be paid through Upwork instead?", ruul).cas, "upwork_demande");
  assertEquals(detecterCas("I don't want to use Ruul", ruul).cas, "upwork_demande");
  assertEquals(detecterCas("Can I be paid through Upwork instead?", upwork).cas, null);
  const l = detecterCas("here: https://www.upwork.com/freelancers/~01abcdef123.", { plateforme: "ruul", attenteLienUpwork: true });
  assertEquals(l, { cas: "upwork_lien", lien: "https://www.upwork.com/freelancers/~01abcdef123" });
  assertEquals(estProfilUpwork(l.lien!), true);
  assertEquals(estProfilUpwork("https://www.upwork.com/jobs/~0123"), false);
});

Deno.test("4. parrainage en cash ou par le parrain", () => {
  assertEquals(detecterCas("My friend wants to be paid in cash", upwork).cas, "parrainage_cash");
  assertEquals(detecterCas("can I pay my referral myself, I'll pay him through me", upwork).cas, "parrainage_cash");
  assertEquals(detecterCas("Mon ami veut être payé en espèces", upwork).cas, "parrainage_cash");
});

Deno.test("7. messages flous et « same issue as X »", () => {
  for (const m of ["me too", "Help me", "I have a problem", "hello", "Same!", "+1", "moi aussi", "hola", "???"]) assertEquals(detecterCas(m, upwork).cas, "flou", m);
  assertEquals(detecterCas("same issue as Maria", upwork), { cas: "meme_probleme", meme_que: "Maria" });
  assertEquals(detecterCas("Hello, my Ruul payment for last week did not arrive", upwork).cas, null);
});

Deno.test("6 et 8 : statut, arrêt, pas réglé", () => {
  assertEquals(estQuestionStatut("Am I still in? my account was deleted"), true);
  assertEquals(estQuestionStatut("access denied when I log in"), true);
  assertEquals(estDemandeArret("STOP"), true);
  assertEquals(estDemandeArret("I want to stop, please close my contract"), true);
  assertEquals(estDemandeArret("Should I stop posting during my trip?"), false);
  assertEquals(estPasRegle("it's still not working"), true);
  assertEquals(estPasRegle("thanks it works now"), false);
});

const base: EtatReel = {
  actif: true, canal_paie: "upwork", cohorte: "2026-11-02", comptes: [{ handle: "ana.x", actif: true, non_renouveler: false, raison: null, le: null }],
  comptes_actifs: 1, warmup: { pret: true, abonnements: 12, existe: true, releve_at: null, debut: "2026-11-01" },
  posts_aujourdhui: { prevus: 2, publies: 1 }, posts_semaine: { prevus: 6, publies: 4, liens: 4 }, arret: null,
  contrat_upwork: { id: "c1", etat: "ACTIVE", actif: true, lu_at: null }, ruul: null, paie: [], upwork_exception: null,
};

Deno.test("6. la vraie situation : actif, kill (date, raison, paie), incohérence", () => {
  const actif = situation(base);
  assertEquals(actif.statut, "actif");
  assertEquals(texteStatut(actif, null), TEXTES.actif);
  const kill: EtatReel = {
    ...base, actif: false, comptes_actifs: 0,
    arret: { source: "kill_samedi", motif: "missing posts", le: "2026-11-14T18:00:00Z", statut: "fait", semaine: "2026-11-09" },
    paie: [{ semaine: "2026-11-09", montant: 14, statut: "ok", action: "payer", paye_at: null }],
  };
  const s = situation(kill);
  assertEquals(s.statut, "kill");
  assertEquals(s.incoherences, ["compte désactivé dans l'OS mais contrat Upwork c1 encore actif (ACTIVE)"]);
  assertEquals(texteStatut(s, "of missing posts"),
    "Your account was stopped on 14 Nov because of missing posts. You will still be paid 14 $ for the week of 9 Nov, on Monday 16 Nov.");
  const sansRaison = situation({ ...base, actif: false, comptes_actifs: 0, contrat_upwork: null });
  assertEquals(texteStatut(sansRaison, null), null);
  assertEquals(sansRaison.incoherences, ["compte désactivé sans arrêt ni raison enregistrés dans l'OS"]);
  assertEquals(situation(base, true).incoherences, ["compte actif dans l'OS alors qu'un arrêt lui a déjà été annoncé"]);
  assertEquals(ligneStatut(base), "actif · warm-up fini · cohorte du 2026-11-02 · Upwork · posts semaine 4/6");
});

Deno.test("18/11 : « personne ne répond » → escalader soi-même ou Slack", () => {
  const upwork = { plateforme: "upwork" as const, attenteLienUpwork: false };
  for (const m of [
    "Nobody answers my messages!", "I'm still waiting for an answer since Monday", "I didn't get any reply to my question",
    "You never answer", "Personne ne me répond", "Nadie me responde", "Nessuno mi risponde", "Ich habe keine Antwort bekommen",
  ]) assertEquals(detecterCas(m, upwork).cas, "pas_de_reponse", m);
  assertEquals(detecterCas("When will I get paid?", upwork).cas, null);
  assertEquals(detecterCas("Can you answer this: how many posts per day?", upwork).cas, null);
});

// 0751 : le bot dit le warm-up comme le dashboard (minuteur du bandeau + abonnements de l'étape).
Deno.test("texteWarmup : abonnements validés mais minuteur en cours → EN COURS, jamais « fini »", () => {
  const t = texteWarmup({ pret: true, abonnements: 24, existe: true, releve_at: null, debut: "2026-11-17T17:08:18Z", fin: "2026-11-22T23:00:00Z", minuteur: "en_cours" });
  assertEquals(t.startsWith("EN COURS"), true);
  assertEquals(t.includes("23 Nov"), true);
  assertEquals(t.includes("fini"), false);
});
Deno.test("texteWarmup : pas lancé, terminé validé, terminé pas validé", () => {
  assertEquals(texteWarmup({ pret: false, abonnements: null, existe: null, releve_at: null, debut: null, fin: null, minuteur: "attente" }).startsWith("pas lancé"), true);
  assertEquals(texteWarmup({ pret: true, abonnements: 9, existe: true, releve_at: null, debut: "2026-11-01", fin: "2026-11-09T23:00:00Z", minuteur: "termine" }).startsWith("fini"), true);
  assertEquals(texteWarmup({ pret: false, abonnements: 2, existe: true, releve_at: null, debut: "2026-11-01", fin: "2026-11-09T23:00:00Z", minuteur: "termine" }).includes("2 abonnement"), true);
  assertEquals(texteWarmup(null), "aucun compte actif");
});
Deno.test("premierJourPostsParis : fin dimanche 23:00 UTC (lundi 00:00 Paris) → lundi", () => {
  assertEquals(premierJourPostsParis("2026-11-22T23:00:00Z"), "2026-11-23");
  assertEquals(premierJourPostsParis("2026-11-23T10:00:00Z"), "2026-11-24");
});

// ---------------------------------------------------------------------------------------------------------------
// 19/11 (Max) : bot Ruul : arrêt avec dates, code à 6 chiffres, « quand serai-je payé ? ».
// ---------------------------------------------------------------------------------------------------------------

const JEUDI = new Date("2026-11-19T15:00:00Z");
const ruulPret: EtatReel = { ...base, canal_paie: "ruul", contrat_upwork: null, ruul: { onboarding: "READY", statut: "pret", compte: "active" } };

Deno.test("19/11 : demande d'arrêt : samedi, lundi de paie, arrêter de poster (jamais « continue de poster »)", () => {
  const t = texteArret("ruul", JEUDI);
  assertEquals(t, "Your stop request is registered. It will be processed on Saturday 21 Nov. Your last week will be paid on Monday 23 Nov via Ruul. You can stop posting from Saturday 21 Nov.");
  assertEquals(texteArret("upwork", JEUDI).includes("via Upwork"), true);
  assertEquals(t.includes("keep posting"), false);
  assertEquals(samediDeTraitement(new Date("2026-11-21T09:00:00Z")), "2026-11-21");
  assertEquals(samediDeTraitement(new Date("2026-11-22T09:00:00Z")), "2026-11-28");
  // Les demandes d'arrêt en turc (19/11) et dans d'autres langues.
  for (const m of ["Çalışmayı bırakmak istiyorum", "Sözleşmemi feshetmek istiyorum lütfen", "artık devam etmek istemiyorum", "Quero parar, obrigado", "No quiero continuar", "I don't want to continue anymore"]) {
    assertEquals(estDemandeArret(m), true, m);
  }
  assertEquals(estDemandeArret("When will I be paid?"), false);
});

Deno.test("19/11 : code à 6 chiffres Ruul (plusieurs langues)", () => {
  for (const m of ["I didn't receive the 6-digit code from Ruul", "Ruul kodu gelmedi", "no me llega el código de verificación", "the verification code never arrives", "6 haneli kod gelmiyor"]) {
    assertEquals(estCodeRuul(m), true, m);
  }
  assertEquals(estCodeRuul("When will I be paid?"), false);
  const t = texteCodeRuul("ana@example.com");
  assertEquals(t.includes("sent by Ruul, not by Vik Studios"), true);
  assertEquals(t.includes("Resend code"), true);
  assertEquals(t.includes("spam"), true);
});

Deno.test("19/11 : « quand serai-je payé ? » : le vrai statut Ruul", () => {
  for (const m of ["When will I be paid?", "when the pending invoices will be paid?", "Ne zaman ödeme alacağım?", "¿Cuándo me pagan?", "I haven't been paid"]) {
    assertEquals(estQuestionPaie(m), true, m);
  }
  // Payé.
  const paye = textePaieRuul({ ...ruulPret, paie: [{ semaine: "2026-11-09", total: 10, statut: "paye", ruul_statut: "PAID", paye_at: "2026-11-18T15:06:15Z" }] }, JEUDI);
  assertEquals(paye.startsWith("Your payment of 10 $ for the week of 9 Nov was paid on 18 Nov via Ruul."), true);
  assertEquals(paye.includes("Monday 23 Nov"), true);
  // Envoyé, en attente de son action.
  const envoye = textePaieRuul({ ...ruulPret, ruul: { onboarding: "PENDING_KYC", statut: "invite", compte: "active" }, paie: [{ semaine: "2026-11-09", total: 10, statut: "a_payer", ruul_statut: "PENDING", paye_at: null }] }, JEUDI);
  assertEquals(envoye.includes("waiting for your action there (identity or bank)"), true);
  // Pas encore payable : KYC, banque, compte.
  assertEquals(textePaieRuul({ ...ruulPret, ruul: { onboarding: "PENDING_KYC", statut: "invite", compte: "active" } }, JEUDI).startsWith("Not payable yet: you still need to verify your identity (KYC)"), true);
  assertEquals(textePaieRuul({ ...ruulPret, ruul: { onboarding: "PENDING_COLLECTION_ACCOUNT", statut: "pret", compte: "active" } }, JEUDI).includes("add your bank account"), true);
  assertEquals(textePaieRuul({ ...ruulPret, ruul: null }, JEUDI, "ana@example.com").includes("create your Ruul account"), true);
  // Prêt, rien de payé encore : chaque lundi.
  assertEquals(textePaieRuul(ruulPret, JEUDI), `${REGLE_PAIE_RUUL} Your Ruul account is ready, so your next payment is on Monday 23 Nov.`);
  // 21/11 : lot parti, compte prêt : la validation bancaire (1 à 2 jours ouvrés), escalade à partir du jeudi.
  const envoi = { ...ruulPret, paie: [{ semaine: "2026-11-09", total: 10, statut: "a_payer", ruul_statut: "PROCESSING", paye_at: null }] };
  const mardi = paieRuulEnRoute(envoi, new Date("2026-11-17T10:00:00Z"));
  assertEquals(mardi?.escalader, false);
  assertEquals(mardi?.texte, "Your payment of 10 $ for the week of 9 Nov was sent on Monday 16 Nov. It usually arrives within 1 to 2 business days (by Wednesday 18 Nov), because of bank validation.");
  assertEquals(paieRuulEnRoute(envoi, new Date("2026-11-19T10:00:00Z"))?.escalader, true);
  assertEquals(paieRuulEnRoute({ ...envoi, paie: [{ ...envoi.paie[0]!, ruul_statut: "FAILED" }] }, new Date("2026-11-17T10:00:00Z"))?.escalader, true);
  assertEquals(ditPasRecu("I have not received my payment"), true);
  // Apostrophe typographique, « the payment », factures Ruul.
  assertEquals(estQuestionPaie("I haven’t received the payment—which is supposed to be made every Monday—for the past two weeks"), true);
  assertEquals(estQuestionPaie("there are 4 invoices on my Ruul account, but I have only received one payment."), true);
  assertEquals(ditPasRecu("I haven’t received the payment"), true);
  assertEquals(ditPasRecu("4 invoices but I have only received one payment"), true);
  assertEquals(estDemandeArret("I don’t want to continue anymore"), true);
});

Deno.test("21/11 : arrêt clair, doute (une question) et faux stop", () => {
  for (const m of ["STOP", "I want to end the contract", "I want to stop", "I quit", "Bırakmak istiyorum"]) assertEquals(estDemandeArret(m), true, m);
  for (const m of ["I'm going to stop if I don't get paid", "Maybe I will quit, this is too much", "Ödeme gelmezse bırakacağım"]) {
    assertEquals(estArretDouteux(m), true, m);
    assertEquals(estDemandeArret(m), false, m);
  }
  for (const m of ["The app stopped working", "Please stop sending me emails", "My video upload stops at 50%", "Uygulama durdu"]) {
    assertEquals(estDemandeArret(m), false, m);
    assertEquals(estArretDouteux(m), false, m);
  }
});
