import { describe, expect, it } from "vitest";

import { etatSource, type EntreeEtatSource } from "./etatSource";

const base: EntreeEtatSource = {
  actif: true,
  jamaisRelevee: false,
  essaiMax: null,
  essaiVerdict: null,
  importes: 100,
  postsMesures: 0,
  mesuresMin: 10,
  attente: null,
  semaine: null,
};

describe("etatSource", () => {
  it("source inactive : rien d'autre ne compte", () => {
    expect(etatSource({ ...base, actif: false, essaiMax: 30 }).cle).toBe("inactive");
  });

  it("dans la file : dit son jour", () => {
    expect(etatSource({ ...base, attente: { prevuLe: "2026-11-18" } })).toEqual({
      cle: "file",
      ton: "attente",
      valeurs: { jour: "2026-11-18" },
    });
  });

  it("en essai : importés sur le plafond, mesures plafonnées au minimum", () => {
    expect(etatSource({ ...base, essaiMax: 30, importes: 28, postsMesures: 14 })).toEqual({
      cle: "essai",
      ton: "attente",
      valeurs: { importes: 28, max: 30, mesures: 10, mesuresMin: 10 },
    });
  });

  it("essai raté : la source reste à son plafond", () => {
    expect(etatSource({ ...base, essaiMax: 30, essaiVerdict: "ne_tient_pas" })).toMatchObject({
      cle: "essaiRate",
      ton: "alerte",
      valeurs: { max: 30 },
    });
  });

  it("essai levé : la décision du lundi prend le relais", () => {
    expect(
      etatSource({ ...base, essaiVerdict: "tient", semaine: { decision: "pas_maj", raison: null, lanceeLe: null } }).cle,
    ).toBe("pasRetenue");
  });

  it("retenue mais pas encore lancée, puis lancée", () => {
    expect(etatSource({ ...base, semaine: { decision: "maj", raison: "r", lanceeLe: null } })).toMatchObject({
      cle: "majAVenir",
      valeurs: { raison: "r" },
    });
    expect(
      etatSource({ ...base, semaine: { decision: "peu_de_mesures", raison: "ajout", lanceeLe: "2026-11-17T16:36:10+00:00" } }),
    ).toMatchObject({ cle: "majFaite", ton: "bon", valeurs: { raison: "ajout", jour: "2026-11-17" } });
  });

  it("jamais relevée et sans stock", () => {
    expect(etatSource({ ...base, jamaisRelevee: true, importes: 0 }).cle).toBe("jamais");
  });

  it("sans décision cette semaine : à jour", () => {
    expect(etatSource(base).cle).toBe("aJour");
  });
});
