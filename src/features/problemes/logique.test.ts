import { describe, expect, it } from "vitest";

import { botDuJeton, lireCorps } from "../../../supabase/functions/_shared/bot_propositions";
import type { Probleme } from "./api";
import { avecLigneStop, compterParNiveau, filtrer, FILTRES_VIDES, gesteValider, LIGNE_STOP_UPWORK, peutValiderCategorie } from "./logique";

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
