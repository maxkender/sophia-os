import { describe, expect, it } from "vitest";

import type { Probleme } from "../api";
import { couverture, echeances, groupeAction, grouperJournal, raisonClaire, raisonUrgent, type ActionBot } from "./logique";

const p = (o: Partial<Probleme>): Probleme => ({
  id: "x", poster_id: "p1", contrat_id: null, nom: "Test A", hm: "HM 1", cohorte: null, actif: true,
  categorie: "question_bloquante", niveau: "urgent", resume: "r", sources: [], proprietaire: "control_bot",
  proposition_reponse: null, canal_reponse: null, proposition_action: null, propose_par: null, propose_at: null,
  statut: "ouvert", ferme_raison: null, ferme_at: null, created_at: "2026-11-06T10:00:00Z", maj_at: "2026-11-06T10:00:00Z",
  slack_relie: false, compte_id: null, ...o,
});
const a = (o: Partial<ActionBot>): ActionBot => ({
  id: "a", bot: "control_bot", action: "reponse", statut: "fait", at: "2026-11-06T09:00:00Z", canal: "slack",
  message: "Hi", raison: null, probleme_id: null, poster_id: "p1", nom: "Lia Test", ...o,
});
const maintenant = Date.parse("2026-11-06T18:00:00Z");

describe("6/11 : la nouvelle page Problèmes", () => {
  it("le journal des bots regroupé par type, en français", () => {
    expect(groupeAction("resend_password_link")).toBe("mdp");
    expect(groupeAction("relink_slack")).toBe("slack");
    const g = grouperJournal([a({ id: "1" }), a({ id: "2", nom: "Stamen X" }), a({ id: "3", action: "stop", statut: "refuse", raison: "réponse obligatoire : le posteur attend" })]);
    expect(g.regles).toBe(2);
    expect(g.faits[0]!.groupe.cle).toBe("reponse");
    expect(g.refuses).toHaveLength(1);
    expect(raisonClaire(g.refuses[0]!.raison)).toContain("attend une réponse");
  });

  it("pourquoi une carte est urgente ; aucune raison = pas en Urgent", () => {
    expect(raisonUrgent(p({ categorie: "paie" }), maintenant)).toBe("argent");
    expect(raisonUrgent(p({ confiance: 0.5 }), maintenant)).toBe("le bot n'est pas sûr");
    const sr = { texte: "Where?", canal: "upwork" as const, at: "2026-11-05T10:00:00Z", depuis_heures: 32, question: true, attend: true };
    expect(raisonUrgent(p({ sans_reponse: sr }), maintenant)).toBe("sans réponse depuis 32 h");
    expect(raisonUrgent(p({}), maintenant)).toBeNull();
  });

  it("les échéances de la semaine, la plus proche d'abord", () => {
    const e = echeances(new Date("2026-11-06T15:00:00"));
    expect(e[0]!.quoi).toContain("kills");
    expect(e.map((x) => x.lien)).toContain("/admin/auto/payroll");
  });

  it("est-ce que tout est couvert : vert quand tout va bien", () => {
    const lignes = couverture([], { depuis: "", journal: [], passages: { new_cohort_bot: "2026-11-06T17:00:00Z", control_bot: "2026-11-06T17:00:00Z", pay_bot: "2026-11-06T17:00:00Z" }, bonus: { a_payer: 0, montant: 0 }, semaine: {} }, maintenant);
    expect(lignes.every((l) => l.niveau === "vert")).toBe(true);
    const enRetard = couverture([], { depuis: "", journal: [], passages: {}, bonus: { a_payer: 2, montant: 20 }, semaine: {} }, maintenant);
    expect(enRetard.find((l) => l.cle === "bots")!.niveau).toBe("rouge");
    expect(enRetard.find((l) => l.cle === "bonus")!.n).toBe(2);
  });
});
