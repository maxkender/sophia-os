import { describe, expect, it } from "vitest";

import { botDuJeton, lireCorps } from "../../../supabase/functions/_shared/bot_propositions";
import type { Probleme, Situation } from "./api";
import {
  avecLigneStop, compterParNiveau, filtrer, FILTRES_VIDES, gestes, gesteValider, grouper, LIGNE_STOP_UPWORK, peutValiderCategorie, phraseProbleme, rang, trier,
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

  it("kill et recréer ouvrent la fiche ; relire TikTok relit le compte ; sinon réponse ou fermeture", () => {
    expect(gesteValider(p({ categorie: "stop", proposition_action: "kill" }))).toEqual({ type: "page", vers: "/admin/posters?poster=00000000-0000-0000-0000-000000000001" });
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
    expect(lireCorps({ action: "valider", probleme_id: "x" })).toEqual({ erreur: "action refusée : proposer ou creer seulement" });
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
