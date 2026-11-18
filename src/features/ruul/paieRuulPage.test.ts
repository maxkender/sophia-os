import { describe, expect, it } from "vitest";

import { compter, etapesLot, grouperParRaison, libelleSemaine, libelleStatutRuul, type LignePaieRuul, type LotPaieRuul } from "./paieRuulPage";

const ligne = (p: Partial<LignePaieRuul>): LignePaieRuul => ({
  poster_id: "p", semaine: "2026-11-09", nom: "Posteur test", pays: "FR", ruul_onboarding: "READY", montant: 10, bonus: 0, retenue: 0,
  faits: 14, prevus: 14, nb_comptes: 1, rattrapage: false, ruul_statut: null, ruul_echec: null, paye_at: null, categorie: "dans_lot", raison: null, ...p,
});

describe("page Paie Ruul", () => {
  it("compte les posteurs et les montants par catégorie (bonus compris)", () => {
    const c = compter([ligne({ montant: 7 }), ligne({ montant: 10, bonus: 5 }), ligne({ categorie: "exclu", montant: 0 }), ligne({ categorie: "pas_pret", montant: 14 })]);
    expect(c.dans_lot).toEqual({ nb: 2, total: 22 });
    expect(c.exclu.nb).toBe(1);
    expect(c.pas_pret.total).toBe(14);
    expect(c.paye.nb).toBe(0);
  });

  it("regroupe les exclus par raison, la plus fréquente d'abord", () => {
    const g = grouperParRaison([
      ligne({ categorie: "exclu", raison: "0 post" }),
      ligne({ categorie: "exclu", raison: "Semaine de warm-up" }),
      ligne({ categorie: "exclu", raison: "Semaine de warm-up" }),
      ligne({ categorie: "exclu", raison: null }),
    ]);
    expect(g.map((x) => [x.raison, x.lignes.length])).toEqual([["Semaine de warm-up", 2], ["0 post", 1], ["Sans raison notée", 1]]);
  });

  it("dit le statut Ruul en clair", () => {
    expect(libelleStatutRuul("AWAITING_FUNDING")).toEqual({ texte: "En attente du virement", ton: "attente" });
    expect(libelleStatutRuul("COMPLETED").ton).toBe("ok");
    expect(libelleStatutRuul(null).texte).toBe("Pas encore créé chez Ruul");
  });

  it("suit les 4 étapes du lot", () => {
    const lot = { statut: "saisi", ruul_statut: "AWAITING_FUNDING", prepare_at: "2026-11-17T11:43:00Z", cree_at: "2026-11-17T11:54:00Z", ruul_batch_id: 1 } as LotPaieRuul;
    expect(etapesLot(lot).map((e) => e.fait)).toEqual([true, true, false, false]);
    expect(etapesLot(null).every((e) => !e.fait)).toBe(true);
  });

  it("écrit la semaine du lundi au dimanche", () => {
    expect(libelleSemaine("2026-11-09")).toBe("9 – 15 nov.");
    expect(libelleSemaine("2026-10-26")).toBe("26 oct. – 1 nov.");
  });
});
