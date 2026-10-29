/**
 * Prompt 21, Q : la FAQ par situation.
 *  - la situation se calcule depuis ce que l'OS sait (inconnu = Candidat) ;
 *  - une même question posée depuis 3 situations donne 3 réponses, avec les
 *    bonnes dates ;
 *  - une réponse dont une variable manque ne part pas (la défaut, ou rien) ;
 *  - le mode inconnu retombe en test, jamais en on ;
 *  - la question se reconnaît mot pour mot sans modèle ; un id inventé par le
 *    modèle ne vaut rien.
 */

import { assertEquals } from "jsr:@std/assert@1";

import {
  calculerSituations,
  choisirReponse,
  correspondanceLocale,
  type EntreeFaq,
  type FaitsPosteur,
  lireCorrespondance,
  lireModeSituations,
  montantDollars,
  remplirVariables,
  type ReponseSituation,
  texteManques,
  variablesDe,
  variablesExemple,
} from "./faq_situations.ts";

// Jeudi 29 octobre 2026 : lundi 26, cohorte des candidats lundi 2 novembre.
const BASE: FaitsPosteur = {
  trouve: true,
  aujourdhui: "2026-10-29",
  lundi_semaine: "2026-10-26",
  cohorte_candidat: "2026-11-02",
  posts_min: 6,
  role: "poster",
  prenom: "Anna",
  actif: true,
  nb_comptes: 1,
};

const INCONNU: FaitsPosteur = { trouve: false, aujourdhui: "2026-10-29", lundi_semaine: "2026-10-26", cohorte_candidat: "2026-11-02" };

const recrue = (p: Partial<FaitsPosteur>): FaitsPosteur => ({ ...BASE, cohorte_lundi: "2026-11-02", ...p });

const WHEN: EntreeFaq = {
  id: "e1",
  question: "When do I start?",
  formulations: ["When do I start posting?"],
  actif: true,
};

const MEME = "You start on Monday {lundi_debut} if by Sunday midnight you have: {ce_qui_manque}. Otherwise you start the Monday after.";
const REPONSES: ReponseSituation[] = [
  {
    entree_id: "e1",
    situation: "candidat",
    actif: true,
    texte: "Accept the offer by Saturday, then create your TikTok account, click Start warmup and follow 5 accounts before Sunday midnight: you start on Monday {lundi_debut}. Accept later and you start the Monday after.",
  },
  ...["accepte", "connecte", "compte_cree", "warmup"].map((s) => ({ entree_id: "e1", situation: s, actif: true, texte: MEME })),
  { entree_id: "e1", situation: "pret", actif: true, texte: "You start on Monday {lundi_debut}: your 2 posts a day appear on your dashboard at midnight." },
  { entree_id: "e1", situation: "reporte", actif: true, texte: "You weren't ready on Sunday, so you start on Monday {lundi_debut}. Still missing: {ce_qui_manque}." },
  { entree_id: "e1", situation: "semaine1", actif: true, texte: "You started on {date_debut}." },
  { entree_id: "e1", situation: "poste", actif: true, texte: "You started on {date_debut}." },
];

function repondre(f: FaitsPosteur): string | null {
  const situations = calculerSituations(f);
  return choisirReponse("e1", REPONSES, situations, variablesDe(f)).choisie?.texte ?? null;
}

Deno.test("situations : de l'inconnu à celui qui poste", () => {
  assertEquals(calculerSituations(INCONNU), ["candidat"]);
  assertEquals(calculerSituations(recrue({})), ["accepte"]);
  assertEquals(calculerSituations(recrue({ premiere_connexion_at: "2026-10-27T10:00:00Z" })), ["connecte"]);
  assertEquals(
    calculerSituations(recrue({ premiere_connexion_at: "2026-10-27T10:00:00Z", tiktok_existe: true })),
    ["compte_cree"],
  );
  const lance = { premiere_connexion_at: "2026-10-27T10:00:00Z", tiktok_existe: true, warmup_started_at: "2026-10-28T10:00:00Z" };
  assertEquals(calculerSituations(recrue({ ...lance, abonnements: 3, videos: 0 })), ["warmup"]);
  // Un post pendant le warm-up : pas prête.
  assertEquals(calculerSituations(recrue({ ...lance, abonnements: 7, videos: 1 })), ["warmup"]);
  assertEquals(calculerSituations(recrue({ ...lance, abonnements: 5, videos: 0 })), ["pret"]);
  assertEquals(calculerSituations(recrue({ ...lance, reporte: true, abonnements: 2 })), ["reporte", "warmup"]);
  // 1re semaine : a commencé lundi 26 ; poste depuis plus d'une semaine : depuis le 12.
  assertEquals(calculerSituations({ ...BASE, cohorte_lundi: "2026-10-26", premier_post: "2026-10-26", posts_semaine: 7 }), ["semaine1"]);
  assertEquals(calculerSituations({ ...BASE, cohorte_lundi: "2026-10-12", premier_post: "2026-10-12", posts_semaine: 8 }), ["poste"]);
});

Deno.test("situations : à risque, Double, pause, Kill, HM, forcée, désactivée", () => {
  const ancien = { ...BASE, cohorte_lundi: "2026-10-12", premier_post: "2026-10-12" };
  // Jeudi, 3 posts : à risque. Mardi, 3 posts : pas encore.
  assertEquals(calculerSituations({ ...ancien, posts_semaine: 3 }), ["a_risque", "poste"]);
  assertEquals(calculerSituations({ ...ancien, aujourdhui: "2026-10-27", posts_semaine: 3 }), ["poste"]);
  assertEquals(calculerSituations({ ...ancien, posts_semaine: 9, nb_comptes: 2 }), ["double", "poste"]);
  assertEquals(calculerSituations({ ...ancien, posts_semaine: 9, pause_jusqu_au: "2026-11-01T00:00:00Z" }), ["pause", "poste"]);
  // Kill, arrêt ou profil désactivé : seule.
  assertEquals(calculerSituations({ ...ancien, posts_semaine: 1, arret: { source: "kill_samedi", at: null } }), ["kill"]);
  assertEquals(calculerSituations({ ...ancien, actif: false }), ["kill"]);
  assertEquals(calculerSituations({ ...BASE, role: "hiring_manager" }), ["hm"]);
  assertEquals(calculerSituations({ ...BASE, role: "head_of_ops" }), ["hm"]);
  assertEquals(calculerSituations({ ...BASE, role: "admin" }), []);
  // Forcée par l'admin : en tête.
  assertEquals(
    calculerSituations({ ...ancien, posts_semaine: 9, forcee: { situation: "vacances", jusqu_au: null } }),
    ["vacances", "poste"],
  );
  // « double » désactivée : la suivante prend le relais.
  assertEquals(calculerSituations({ ...ancien, posts_semaine: 9, nb_comptes: 2 }, new Set(["poste", "semaine1"])), ["poste"]);
});

Deno.test("When do I start? : 3 situations, 3 réponses, les bonnes dates", () => {
  const candidat = repondre(INCONNU);
  const warmup = repondre(recrue({
    premiere_connexion_at: "2026-10-27T10:00:00Z",
    tiktok_existe: true,
    warmup_started_at: "2026-10-28T10:00:00Z",
    abonnements: 2,
    videos: 0,
  }));
  const reporte = repondre(recrue({
    cohorte_lundi: "2026-11-09",
    reporte: true,
    premiere_connexion_at: "2026-10-20T10:00:00Z",
    tiktok_existe: false,
    handle: "anna.reads",
  }));
  const pret = repondre(recrue({
    premiere_connexion_at: "2026-10-27T10:00:00Z",
    tiktok_existe: true,
    warmup_started_at: "2026-10-28T10:00:00Z",
    abonnements: 6,
    videos: 0,
  }));
  const poste = repondre({ ...BASE, cohorte_lundi: "2026-10-19", premier_post: "2026-10-19", posts_semaine: 9 });

  assertEquals(
    candidat,
    "Accept the offer by Saturday, then create your TikTok account, click Start warmup and follow 5 accounts before Sunday midnight: you start on Monday 2 November. Accept later and you start the Monday after.",
  );
  assertEquals(
    warmup,
    "You start on Monday 2 November if by Sunday midnight you have: 3 more accounts followed. Otherwise you start the Monday after.",
  );
  assertEquals(
    reporte,
    "You weren't ready on Sunday, so you start on Monday 9 November. Still missing: your TikTok account @anna.reads created, \"Start warmup\" clicked on your dashboard, 5 accounts followed.",
  );
  assertEquals(pret, "You start on Monday 2 November: your 2 posts a day appear on your dashboard at midnight.");
  assertEquals(poste, "You started on Monday 19 October.");
  assertEquals(new Set([candidat, warmup, reporte, pret, poste]).size, 5);
});

Deno.test("une variable sans valeur : la réponse ne part pas, la défaut prend le relais", () => {
  const reponses: ReponseSituation[] = [
    { entree_id: "p", situation: "poste", actif: true, texte: "Last payment: {derniere_paie_montant} on {derniere_paie_date}." },
    { entree_id: "p", situation: null, actif: true, texte: "You're paid every Monday ({tarif} a week)." },
    { entree_id: "p", situation: "semaine1", actif: false, texte: "Retirée." },
  ];
  const f = { ...BASE, cohorte_lundi: "2026-10-12", premier_post: "2026-10-12", posts_semaine: 9, tarif: 14 };
  const r = choisirReponse("p", reponses, ["poste"], variablesDe(f));
  assertEquals(r.choisie?.texte, "You're paid every Monday ($14 a week).");
  assertEquals(r.choisie?.situation, null);
  assertEquals(r.sautees, [{ situation: "poste", manquantes: ["derniere_paie_montant", "derniere_paie_date"] }]);

  const paye = choisirReponse("p", reponses, ["poste"], variablesDe({
    ...f,
    derniere_paie: { montant: 14, paye_at: "2026-10-26T09:00:00Z", semaine: "2026-10-19" },
  }));
  assertEquals(paye.choisie?.texte, "Last payment: $14 on Monday 26 October.");

  // Ni tarif ni paie : rien ne convient, « New questions ».
  assertEquals(choisirReponse("p", reponses, ["poste"], variablesDe({ ...f, tarif: null })).choisie, null);
  // Une réponse retirée (actif = false) ne sert jamais.
  assertEquals(choisirReponse("p", reponses, ["semaine1"], { tarif: "$14" }).choisie?.situation, null);
});

Deno.test("variables : formats et exemples", () => {
  assertEquals(montantDollars(14), "$14");
  assertEquals(montantDollars(14.5), "$14.50");
  assertEquals(montantDollars(null), null);
  assertEquals(remplirVariables("Hi {prenom}, {inconnue}", { prenom: "Anna" }), {
    texte: "Hi Anna, {inconnue}",
    manquantes: ["inconnue"],
  });
  assertEquals(texteManques({ connexion: true, tiktok: true, start: true, follows: 5, posts: false }, null),
    'a first login to your dashboard, your TikTok account created, "Start warmup" clicked on your dashboard, 5 accounts followed');
  const v = variablesDe({ ...BASE, cohorte_lundi: "2026-10-19", premier_post: "2026-10-19", handle: "anna", milestone: { nom: "Week 44", montant: 10, etat: "Active" } });
  assertEquals(v.handle, "@anna");
  assertEquals(v.milestone_suivante, "Week 44 ($10)");
  assertEquals(v.ce_qui_manque, undefined);
  const ex = variablesExemple("candidat", "2026-10-29", "2026-11-02");
  assertEquals(ex.lundi_debut, "2 November");
  assertEquals(variablesExemple("semaine1", "2026-10-29", "2026-11-02").date_debut, "Monday 26 October");
});

Deno.test("mode : off / test / on, tout le reste en test", () => {
  assertEquals(lireModeSituations(null), "test");
  assertEquals(lireModeSituations({ mode_os: "actif" }), "test");
  assertEquals(lireModeSituations({ situations: "on" }), "on");
  assertEquals(lireModeSituations({ situations: "off" }), "off");
  assertEquals(lireModeSituations({ situations: "ON" }), "test");
  assertEquals(lireModeSituations({ situations: true }), "test");
});

Deno.test("reconnaître la question", () => {
  const autre: EntreeFaq = { id: "e2", question: "When do I get paid?", formulations: [], actif: true };
  const entrees = [WHEN, autre];
  assertEquals(correspondanceLocale("when do I start ?", entrees)?.id, "e1");
  assertEquals(correspondanceLocale("When do I start posting", entrees)?.id, "e1");
  assertEquals(correspondanceLocale("When do I start and how much?", entrees), null);
  assertEquals(correspondanceLocale("When do I start?", [{ ...WHEN, actif: false }]), null);
  assertEquals(lireCorrespondance('{"entree": "e2"}', entrees)?.id, "e2");
  assertEquals(lireCorrespondance('Voici : {"entree": null}', entrees), null);
  assertEquals(lireCorrespondance('{"entree": "inventee"}', entrees), null);
  assertEquals(lireCorrespondance("pas du json", entrees), null);
});
