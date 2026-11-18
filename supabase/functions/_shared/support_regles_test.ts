import { assertEquals } from "jsr:@std/assert@1";

import {
  detecterCas, estDemandeArret, estPasRegle, estProfilUpwork, estQuestionStatut, type EtatReel, ligneStatut, situation, TEXTES, texteStatut,
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
