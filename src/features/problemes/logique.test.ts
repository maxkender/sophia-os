import { describe, expect, it } from "vitest";

import { ACTIONS_BOT, botDuJeton, etatSecrets, lireCorps } from "../../../supabase/functions/_shared/bot_propositions";
import type { OptionDecision, Probleme, Situation } from "./api";
import {
  aDiagnosticOuAction, estDecision, optionLibre, planDecision, urlContratUpwork, peutDonnerFeedback, pourcentJuste, raisonObligatoire, regleDepuisFeedback, avecLigneStop, compterParGroupe, compterParNiveau, dansOnglet, etapesManquantes, groupeDe, filtrer, FILTRES_VIDES, gestes, gesteValider, grouper, LIGNE_STOP_UPWORK, peutValiderCategorie, phraseProbleme, rang, trier,
} from "./logique";

const p = (o: Partial<Probleme>): Probleme => ({
  id: "x", poster_id: "00000000-0000-0000-0000-000000000001", contrat_id: null, nom: "Test A", hm: "HM 1", cohorte: null, actif: true,
  categorie: "question_bloquante", niveau: "aujourdhui", resume: "r", sources: [], proprietaire: "control_bot",
  proposition_reponse: null, canal_reponse: null, proposition_action: null, propose_par: null, propose_at: null,
  statut: "ouvert", ferme_raison: null, ferme_at: null, created_at: "2026-11-02T10:00:00Z", maj_at: "2026-11-02T10:00:00Z",
  slack_relie: false, compte_id: null, ...o,
});

describe("Problèmes : Valider", () => {
  it("l'argent ouvre Payroll, jamais d'exécution ; et jamais en lot", () => {
    expect(gesteValider(p({ categorie: "paie" }))).toEqual({ type: "page", vers: "/admin/auto/payroll" });
    expect(gesteValider(p({ categorie: "autre", proposition_action: "open_who_to_fund" })).type).toBe("page");
    expect(peutValiderCategorie("paie")).toBe(false);
    expect(peutValiderCategorie("login")).toBe(true);
  });

  it("kill ouvre le formulaire de Kill (sans posteur : la fiche) ; relire TikTok relit le compte ; sinon réponse ou fermeture", () => {
    expect(gesteValider(p({ categorie: "stop", proposition_action: "kill" }))).toEqual({ type: "kill" });
    expect(gesteValider(p({ categorie: "stop", poster_id: null }))).toEqual({ type: "page", vers: "/admin/posters" });
    expect(gesteValider(p({ categorie: "kill_contrat" }))).toEqual({ type: "page", vers: "/admin/auto/payroll" });
    expect(gesteValider(p({ categorie: "tiktok_setup", proposition_action: "reread_tiktok", compte_id: "c1" }))).toEqual({ type: "releve", compte_id: "c1" });
    expect(gesteValider(p({ proposition_reponse: "Hi, here is how…" }))).toEqual({ type: "reponse" });
    expect(gesteValider(p({}))).toEqual({ type: "fermer" });
  });

  it("la ligne STOP une seule fois sur Upwork", () => {
    expect(avecLigneStop("Hello")).toBe(`Hello\n\n${LIGNE_STOP_UPWORK}`);
    expect(avecLigneStop(avecLigneStop("Hello"))).toBe(`Hello\n\n${LIGNE_STOP_UPWORK}`);
  });

  it("filtres et compteurs par niveau", () => {
    const l = [p({ niveau: "urgent", categorie: "stop" }), p({ niveau: "samedi", categorie: "absence", hm: null }), p({ proprietaire: "pay_bot", categorie: "paie" })];
    expect(compterParNiveau(l)).toEqual({ urgent: 1, aujourdhui: 1, samedi: 1 });
    expect(filtrer(l, { ...FILTRES_VIDES, hm: "—" })).toHaveLength(1);
    expect(filtrer(l, { ...FILTRES_VIDES, proprietaire: "pay_bot" })[0]!.categorie).toBe("paie");
  });
});

describe("Problèmes : l'entrée des bots", () => {
  const secrets = { control_bot: "c".repeat(32), pay_bot: "p".repeat(32), new_cohort_bot: undefined };
  it("un jeton par bot, sinon refusé", () => {
    expect(botDuJeton(`Bearer ${"p".repeat(32)}`, secrets)).toBe("pay_bot");
    expect(botDuJeton(`Bearer ${"x".repeat(32)}`, secrets)).toBeNull();
    expect(botDuJeton(null, secrets)).toBeNull();
    expect(botDuJeton("Bearer court", secrets)).toBeNull();
  });

  it("seulement proposer ou créer (posteur obligatoire) ; jamais valider, envoyer, kill ou payer", () => {
    expect(lireCorps({ action: "valider", probleme_id: "x" })).toEqual({ erreur: "action refusée : lire, proposer ou creer seulement" });
    expect(lireCorps({ action: "lire" })).toEqual({ action: "lire", args: {} });
    expect(lireCorps({ action: "lire", probleme_id: "00000000-0000-0000-0000-000000000009" })).toEqual({ action: "lire", args: { probleme_id: "00000000-0000-0000-0000-000000000009" } });
    expect(lireCorps({ action: "lire", probleme_id: "x" })).toHaveProperty("erreur");
    expect(lireCorps({ action: "payer" })).toHaveProperty("erreur");
    expect(lireCorps({ action: "creer", categorie: "login", resume: "r" })).toEqual({ erreur: "poster_id ou contrat_id obligatoire" });
    expect(lireCorps({ action: "proposer", probleme_id: "00000000-0000-0000-0000-000000000009" })).toHaveProperty("erreur");
    const ok = lireCorps({ action: "proposer", probleme_id: "00000000-0000-0000-0000-000000000009", reponse: "Hi", action_proposee: "mark_read" });
    expect(ok).toMatchObject({ action: "proposer", args: { probleme_id: "00000000-0000-0000-0000-000000000009", reponse: "Hi", action: "mark_read" } });
  });
});

describe("3/11 : une carte = un diagnostic", () => {
  const sit = (o: Partial<Situation> = {}): Situation => ({
    actif: true, pays: "DE", comptes: 1, lundi: "2026-11-02", posts: 4, attendus: 6, devrait_poster: true, bloque: false,
    etapes: { login: true, slack: true, tiktok: true, warmup: true },
    paie_passee: { semaine: "2026-10-26", montant: 14, paye_at: "2026-11-02T12:00:00Z", action: "payer", api: null, ligne: true },
    paye_passee: true, attendu_semaine: 14, finances: [], finance_ok: false, jalons_lus_at: null, contrat_id: "c1", contrat_actif: true,
    message: null, a_ecrit: false, ...o,
  });

  it("paie : payée la semaine passée mais rien de financé → la phrase le dit, le geste ouvre Who to fund", () => {
    const p = { categorie: "paie", resume: "x", situation: sit(), poster_id: "p1", compte_id: null, contrat_id: "c1" };
    expect(phraseProbleme(p)?.cle).toBe("diag.paieRienFinance");
    expect(gestes(p).map((g) => g.cle)).toEqual(["geste.whoToFund", "geste.contrat"]);
    const mauvais = { ...p, situation: sit({ finances: [{ nom: "Week 45", montant: 7, etat: "Active" }] }) };
    expect(phraseProbleme(mauvais)).toMatchObject({ cle: "diag.paieMauvaisMontant", vars: { nom: "Week 45", finance: 7, attendu: 14 } });
    const nonPayee = { ...p, situation: sit({ paye_passee: false }) };
    expect(gestes(nonPayee)[0]).toMatchObject({ type: "page", vers: "/admin/auto/payroll" });
  });

  it("tri : qui a écrit et attend, puis qui est bloqué(e), puis le reste ; plus vieux d'abord", () => {
    const c = (id: string, o: Partial<Situation>, created_at: string) => ({ id, categorie: "question_bloquante", created_at, situation: sit(o) });
    const liste = [
      c("reste", {}, "2026-11-01T00:00:00Z"),
      c("bloque", { bloque: true }, "2026-11-02T00:00:00Z"),
      c("ecrit-recent", { a_ecrit: true, message: { at: "2026-11-03T08:00:00Z", canal: "upwork", texte: "?", lien: null, repondu_at: null } }, "2026-10-30T00:00:00Z"),
      c("ecrit-vieux", { a_ecrit: true, message: { at: "2026-11-01T08:00:00Z", canal: "upwork", texte: "?", lien: null, repondu_at: null } }, "2026-11-02T00:00:00Z"),
    ];
    expect(trier(liste).map((x) => x.id)).toEqual(["ecrit-vieux", "ecrit-recent", "bloque", "reste"]);
    expect(rang(liste[0]!)).toBe(2);
    const g = grouper([...liste, { id: "s", categorie: "slack", created_at: "2026-11-01T00:00:00Z", situation: sit() }]);
    expect(g.map((x) => [x.categorie, x.cartes.length])).toEqual([["question_bloquante", 4], ["slack", 1]]);
  });
});

describe("Problèmes v4 : groupes, diagnostic, bots", () => {
  const sit = (o: Partial<Situation>) => ({ etapes: { login: true, slack: true, tiktok: true, warmup: true }, ...o }) as Situation;

  it("le groupe vient de la situation lue à l'instant, sinon du dernier passage ; la paie est transversale", () => {
    expect(groupeDe(p({ groupe: "actifs", situation: sit({ groupe: "nouveaux_actifs" }) }))).toBe("nouveaux_actifs");
    expect(groupeDe(p({ groupe: "onboarding" }))).toBe("onboarding");
    expect(groupeDe(p({ categorie: "accueil", poster_id: null }))).toBe("onboarding");
    const liste = [p({ groupe: "onboarding" }), p({ groupe: "actifs", categorie: "paie" }), p({ groupe: "actifs" })];
    expect(compterParGroupe(liste)).toEqual({ onboarding: 1, nouveaux_actifs: 0, actifs: 2, paie: 1 });
    expect(liste.filter((x) => dansOnglet(x, "paie"))).toHaveLength(1);
  });

  it("étapes manquantes, dans l'ordre", () => {
    expect(etapesManquantes(sit({ etapes: { login: true, slack: false, tiktok: false, warmup: true } }))).toEqual(["slack", "tiktok"]);
    expect(etapesManquantes(sit({}))).toEqual([]);
  });

  it("pas de diagnostic et pas d'action : pas de carte", () => {
    const msg = [{ type: "reponse", ref: "1", texte: "hello" }];
    expect(aDiagnosticOuAction(p({ categorie: "autre", sources: msg }))).toBe(false);
    // Le diagnostic de repli de l'OS (le résumé) ne suffit pas à montrer une carte.
    expect(aDiagnosticOuAction(p({ categorie: "autre", sources: msg, diagnostic: "hello", diagnostic_par: "os" }))).toBe(false);
    expect(aDiagnosticOuAction(p({ categorie: "autre", sources: msg, diagnostic: "Asks for the app link; FAQ answer exists." }))).toBe(true);
    expect(aDiagnosticOuAction(p({ categorie: "autre", sources: msg, proposition_action: "close" }))).toBe(true);
    expect(aDiagnosticOuAction(p({ categorie: "autre", sources: [{ type: "needs_you", ref: "n" }] }))).toBe(true);
    expect(aDiagnosticOuAction(p({ categorie: "stop", sources: msg }))).toBe(true);
  });

  it("Valider : le lien de mot de passe part depuis la page ; postpone ouvre la fiche ; close ferme", () => {
    expect(gesteValider(p({ proposition_action: "resend_password_link" }))).toEqual({ type: "motDePasse", poster_id: "00000000-0000-0000-0000-000000000001" });
    expect(gesteValider(p({ proposition_action: "postpone" })).type).toBe("page");
    expect(gesteValider(p({ proposition_action: "close" }))).toEqual({ type: "fermer" });
  });

  it("bot_propositions : diagnostic (300 car.), groupe suggéré validé, secrets lus sans valeur", () => {
    const id = "00000000-0000-0000-0000-000000000009";
    const r = lireCorps({ action: "proposer", probleme_id: id, diagnostic: "d".repeat(400), groupe_suggere: "actifs", action_proposee: "close" });
    expect(r).toMatchObject({ action: "proposer", args: { groupe_suggere: "actifs", action: "close" } });
    expect((r as { args: { diagnostic: string } }).args.diagnostic).toHaveLength(300);
    expect(lireCorps({ action: "proposer", probleme_id: id, diagnostic: "x" })).toHaveProperty("action", "proposer");
    expect(lireCorps({ action: "proposer", probleme_id: id, diagnostic: "x", action_proposee: "none" })).toMatchObject({ args: { action: "none" } });
    expect(lireCorps({ action: "proposer", probleme_id: id, diagnostic: "x", groupe_suggere: "vip" })).toHaveProperty("erreur");
    expect(etatSecrets({ new_cohort_bot: "a".repeat(32), control_bot: "" })).toEqual({ new_cohort_bot: true, control_bot: false, pay_bot: false });
  });
});

describe("Feedback aux bots", () => {
  it("seulement les cartes d'un bot (ouvertes, ou fermées par lui avec close)", () => {
    expect(peutDonnerFeedback({ propose_par: "control_bot", statut: "ouvert", proposition_action: null })).toBe(true);
    expect(peutDonnerFeedback({ propose_par: "admin", statut: "ouvert", proposition_action: null })).toBe(false);
    expect(peutDonnerFeedback({ propose_par: "os", statut: "ouvert", proposition_action: null })).toBe(false);
    expect(peutDonnerFeedback({ propose_par: "pay_bot", statut: "valide", proposition_action: "close" })).toBe(true);
    expect(peutDonnerFeedback({ propose_par: "pay_bot", statut: "valide", proposition_action: "kill" })).toBe(false);
  });
  it("raison obligatoire sauf 👍 ; % de 👍 ; règle pré-remplie", () => {
    expect(raisonObligatoire("juste")).toBe(false);
    expect(raisonObligatoire("mauvaise_action")).toBe(true);
    expect(pourcentJuste({ total: 0, justes: 0 })).toBeNull();
    expect(pourcentJuste({ total: 3, justes: 2 })).toBe(67);
    expect(regleDepuisFeedback({ id: "f", bot: "control_bot", raison: " Pas un bug. ", diagnostic_du_bot: null, action_du_bot: "close", categorie: null }))
      .toEqual({ id: null, bot: "control_bot", regle: "Pas un bug.", exemple: "close", sources: ["f"], active: true });
  });
});

describe("0528 : décisions", () => {
  const opt = (o: Partial<OptionDecision>): OptionDecision => ({ libelle: "x", ...o });
  const q = { poster_id: "00000000-0000-0000-0000-000000000001", contrat_id: "44222098", destinataire: "posteur" as const };

  it("une option paie n'ouvre que le contrat Upwork, rien d'autre", () => {
    expect(planDecision(opt({ paie: true, reponse: "Hi" }), q, "on")).toMatchObject({ ouvrir: urlContratUpwork("44222098"), envoyer: null, motDePasse: null });
  });

  it("mode test : rien ne part ; mode on : réponse au posteur avec la ligne STOP, lien de mot de passe", () => {
    expect(planDecision(opt({ reponse: "Hi", action: "resend_password_link" }), q, "test")).toMatchObject({ envoyer: null, motDePasse: null });
    const on = planDecision(opt({ reponse: "Hi", action: "resend_password_link" }), q, "on");
    expect(on.envoyer).toBe(avecLigneStop("Hi"));
    expect(on.motDePasse).toBe(q.poster_id);
    expect(planDecision(opt({ action: "saturday" }), q, "on").samedi).toBe(true);
    expect(planDecision(opt({ action: "kill" }), q, "on").page).toBe(`/admin/posters?poster=${q.poster_id}`);
  });

  it("HM : la réponse est à copier, jamais envoyée ; option libre", () => {
    expect(planDecision(opt({ reponse: "Hi HM" }), { ...q, destinataire: "hm" }, "on")).toMatchObject({ aCopier: "Hi HM", envoyer: null });
    expect(optionLibre(opt({}))).toBe(true);
    expect(optionLibre(opt({ paie: true }))).toBe(false);
    expect(planDecision(opt({}), q, "on", " Mon texte ").envoyer).toBe(avecLigneStop("Mon texte"));
  });

  it("une question est toujours une carte", () => {
    expect(estDecision({ question: "Q ?", options: [opt({}), opt({})] })).toBe(true);
    expect(estDecision({ question: null, options: null })).toBe(false);
    expect(aDiagnosticOuAction(p({ question: "Q ?", resume: "hello" }))).toBe(true);
  });

  it("bot_propositions : decision (question + options), sujet hm / offre sans posteur", () => {
    const id = "00000000-0000-0000-0000-000000000009";
    expect(lireCorps({ action: "proposer", probleme_id: id, action_proposee: "decision" })).toEqual({ erreur: "decision : question et options (2 à 4) obligatoires" });
    expect(lireCorps({ action: "proposer", probleme_id: id, action_proposee: "decision", question: "Q ?", options: [{ libelle: "A" }, { libelle: "B" }] }))
      .toMatchObject({ action: "proposer", args: { question: "Q ?", options: [{ libelle: "A" }, { libelle: "B" }] } });
    expect(lireCorps({ action: "creer", sujet: "hm", categorie: "hm", resume: "r" })).toEqual({ erreur: "sujet hm : hm_id, hm_nom, offre_lien ou offre_id obligatoire" });
    expect(lireCorps({ action: "creer", sujet: "offre", offre_id: "2116086859812462592", categorie: "offre", resume: "r" })).toMatchObject({ action: "creer", args: { sujet: "offre" } });
    expect(lireCorps({ action: "creer", sujet: "vip", poster_id: id, categorie: "autre", resume: "r" })).toEqual({ erreur: "sujet : posteur, hm, offre" });
    expect(ACTIONS_BOT).toEqual(expect.arrayContaining(["pay_check", "saturday", "decision", "close", "none"]));
  });
});

describe("0531 : Doubler et Recréer vont au rituel", () => {
  it("recreate → jeudi, double → samedi ; rien n'est exécuté depuis la carte", () => {
    expect(gesteValider(p({ proposition_action: "recreate" }))).toEqual({ type: "rituel", choix: "recreate" });
    expect(gesteValider(p({ proposition_action: "double" }))).toEqual({ type: "rituel", choix: "double" });
    expect(ACTIONS_BOT).toContain("double");
  });
});
