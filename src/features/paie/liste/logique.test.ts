import { describe, expect, it } from "vitest";

import type { LigneListePaie } from "./api";
import {
  actionAffichee,
  besoinPaye,
  besoinSuivante,
  consigne,
  csvListe,
  parEquipe,
  postsParCompte,
  raisonsLigne,
  resteAFaire,
  totauxPaie,
  trierLignes,
} from "./logique";

function ligne(o: Partial<LigneListePaie>): LigneListePaie {
  return {
    id: "l",
    poster_id: "p",
    poster_nom: "Ana",
    hm_id: "hm",
    hm_prenom: "Lucia",
    equipe: "Zone – Greece",
    contrat_url: "https://www.upwork.com/c/1",
    nb_comptes: 1,
    comptes_payes: 1,
    prevus: 14,
    faits: 14,
    tarif: 10,
    retenue: 0,
    montant_calcule: 10,
    montant: 10,
    montant_corrige: null,
    raison_correction: null,
    statut: "ok",
    raison: null,
    action: "payer",
    detail_comptes: [{ compte_id: "c", handle: "ana", attendus: 14, faits: 14, rates: 0, retenue: 0, montant: 10, warmup: false }],
    exclu: false,
    exclu_raison: null,
    premiere_semaine: false,
    bonus: 0,
    suivante_action: "financer",
    suivante_comptes: 1,
    suivante_montant: 10,
    suivante_raison: null,
    upwork_compte: null,
    paye_at: null,
    semaine_suivante_faite_at: null,
    ...o,
  };
}

describe("la liste de paie", () => {
  it("les totaux : une ligne retirée ne compte pas ; reste = pas encore payé", () => {
    expect(
      totauxPaie([
        ligne({ id: "1", montant: 10 }),
        ligne({ id: "2", montant: 5, paye_at: "2026-11-02T10:00:00Z" }),
        ligne({ id: "3", montant: 7, exclu: true, exclu_raison: "payé à part" }),
      ]),
    ).toEqual({ total: 15, reste: 10, lignes: 2, payees: 1 });
  });

  it("un bloc par équipe, son total, sans HM à la fin", () => {
    const g = parEquipe([
      ligne({ id: "1", equipe: "Zone – Greece", montant: 10 }),
      ligne({ id: "2", equipe: "Zone – DACH & Nordics", montant: 14 }),
      ligne({ id: "3", equipe: null, montant: 7 }),
      ligne({ id: "4", equipe: "Zone – Greece", montant: 5 }),
    ]);
    expect(g.map((e) => [e.equipe, e.totaux.total, e.lignes.length])).toEqual([
      ["Zone – DACH & Nordics", 14, 1],
      ["Zone – Greece", 15, 2],
      [null, 7, 1],
    ]);
  });

  it("l'ordre : ce qui demande une action d'abord, puis payé, puis retiré", () => {
    const t = trierLignes([
      ligne({ id: "paye", paye_at: "x" }),
      ligne({ id: "payer" }),
      ligne({ id: "retire", exclu: true }),
      ligne({ id: "kill", action: "kill" }),
      ligne({ id: "annuler", action: "annuler" }),
    ]);
    expect(t.map((l) => l.id)).toEqual(["annuler", "kill", "payer", "paye", "retire"]);
  });

  it("posts faits sur 14, compte par compte (2 comptes)", () => {
    const l = ligne({
      detail_comptes: [
        { compte_id: "a", handle: "ana", attendus: 14, faits: 14, rates: 0, retenue: 0, montant: 10, warmup: false },
        { compte_id: "b", handle: "ana.2", attendus: 14, faits: 8, rates: 6, retenue: 6, montant: 4, warmup: false },
      ],
    });
    expect(postsParCompte(l)).toBe("@ana 14/14 · @ana.2 8/14");
  });

  it("le CSV : une ligne par posteur, montant corrigé et raison, retirée signalée", () => {
    const csv = csvListe(
      [ligne({ montant: 12, montant_corrige: 12, raison_correction: "bonus", montant_calcule: 10 })],
      (l) => l.action,
      "2026-10-26",
    );
    const [entete, l1] = csv.replace("﻿", "").split("\r\n");
    expect(entete!.split(",")).toContain("amount_correction_reason");
    expect(entete!.split(",")).toContain("instruction");
    expect(l1).toBe(
      "Zone – Greece,Ana,https://www.upwork.com/c/1,,1,@ana 14/14,10,0,0,10,12,bonus,payer,Approve Week 44: $12 · Fund Week 45: $10,no,no,no,",
    );
  });

  describe("prompt 15, point 5 : la consigne exacte (semaine du 26 oct. = Week 44)", () => {
    const S = "2026-10-26";

    it("Payer : approuver la semaine, financer la suivante", () => {
      expect(consigne(ligne({ montant: 14, suivante_montant: 14 }), S)).toBe("Approve Week 44: $14 · Fund Week 45: $14");
    });

    it("Payer moins : le montant après retenue, la suivante au tarif", () => {
      expect(consigne(ligne({ action: "payer_moins", montant: 12, retenue: 2, suivante_montant: 14 }), S)).toBe(
        "Approve Week 44: $12 · Fund Week 45: $14",
      );
    });

    it("Double : la suivante au double, avec le nombre de comptes", () => {
      expect(
        consigne(ligne({ action: "modifier", montant: 14, suivante_action: "financer_double", suivante_comptes: 2, suivante_montant: 28 }), S),
      ).toBe("Approve Week 44: $14 · Fund Week 45 (2 acc): $28");
    });

    it("Kill : approuver, ne pas financer, fermer le contrat", () => {
      expect(consigne(ligne({ action: "kill", montant: 14, suivante_action: "ne_pas_financer" }), S)).toBe(
        "Approve Week 44: $14 · Don't fund · End the contract",
      );
    });

    it("Annuler : remboursement, rien d'approuvé", () => {
      expect(consigne(ligne({ action: "annuler", faits: 0, montant: 0 }), S)).toBe(
        "Don't approve Week 44 · Ask for a refund · Don't fund",
      );
    });

    it("warm-up : rien à payer, la 1re semaine est financée à l'embauche", () => {
      expect(consigne(ligne({ action: "rien", nb_comptes: 0, faits: 0, prevus: 0, montant: 0 }), S)).toBe(
        "Nothing to pay · Week 45 funded at hiring",
      );
    });

    it("0 post : rien à payer, la suivante à voir", () => {
      expect(consigne(ligne({ action: "rien", faits: 0, montant: 0, suivante_action: "a_voir", suivante_montant: null }), S)).toBe(
        "Nothing to pay · Week 45: check before funding",
      );
    });

    it("1re semaine : le montant à approuver contient le bonus (tarif + 1 $)", () => {
      expect(consigne(ligne({ montant: 15, bonus: 1, premiere_semaine: true, suivante_montant: 14 }), S)).toBe(
        "Approve Week 44: $15 · Fund Week 45: $14",
      );
    });

    it("tarif manquant : « À vérifier », jamais « Pay $0 », aucune case", () => {
      const l = ligne({ tarif: null, montant: 0, suivante_montant: null });
      expect(actionAffichee(l)).toBe("a_verifier");
      expect(consigne(l, S)).toBeNull();
      expect(raisonsLigne(l)).toEqual(["tarif_manquant"]);
      expect(besoinPaye(l)).toBe(false);
      expect(besoinSuivante(l)).toBe(false);
      expect(resteAFaire(l)).toBe(true);
    });

    it("les cases : cachées quand l'action n'en a pas besoin", () => {
      expect(besoinSuivante(ligne({ action: "kill" }))).toBe(false);
      expect(besoinPaye(ligne({ action: "rien", faits: 0 }))).toBe(false);
      expect(besoinPaye(ligne({ action: "annuler", faits: 0 }))).toBe(false);
      expect(besoinSuivante(ligne({ suivante_action: "deja_financee" }))).toBe(false);
      expect(besoinPaye(ligne({}))).toBe(true);
      expect(besoinSuivante(ligne({}))).toBe(true);
    });

    it("« À faire » : cache rien à payer, retirée, et terminée", () => {
      expect(resteAFaire(ligne({}))).toBe(true);
      expect(resteAFaire(ligne({ paye_at: "x" }))).toBe(true);
      expect(resteAFaire(ligne({ paye_at: "x", semaine_suivante_faite_at: "x" }))).toBe(false);
      expect(resteAFaire(ligne({ action: "kill", paye_at: "x" }))).toBe(false);
      expect(resteAFaire(ligne({ action: "rien", faits: 0 }))).toBe(false);
      expect(resteAFaire(ligne({ exclu: true }))).toBe(false);
    });
  });
});
