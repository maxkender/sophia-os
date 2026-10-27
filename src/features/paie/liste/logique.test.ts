import { describe, expect, it } from "vitest";

import type { LigneListePaie } from "./api";
import { csvListe, parEquipe, postsParCompte, totauxPaie, trierLignes } from "./logique";

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
    );
    const [entete, l1] = csv.replace("﻿", "").split("\r\n");
    expect(entete!.split(",")).toContain("amount_correction_reason");
    expect(l1).toBe("Zone – Greece,Ana,https://www.upwork.com/c/1,1,@ana 14/14,10,0,10,12,bonus,payer,no,no,no,");
  });
});
