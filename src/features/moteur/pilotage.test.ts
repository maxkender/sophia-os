import { describe, expect, it } from "vitest";

import { lignesStock, resumeVues, tauxPublication } from "./pilotage";

const releve = (jour: string, vues_delta: number | null) => ({
  jour,
  vues_totales: 0,
  vues_delta,
  nb_comptes: 10,
});

describe("resumeVues", () => {
  it("compare le dernier relevé à la moyenne des 7 précédents", () => {
    const serie = [
      releve("2026-10-14", 999), // hors fenêtre : 8 relevés avant le dernier
      ...[1, 2, 3, 4, 5, 6, 7].map((d) => releve(`2026-10-${14 + d}`, 100)),
      releve("2026-10-22", 150),
    ];
    const r = resumeVues(serie)!;
    expect(r.jour).toBe("2026-10-22");
    expect(r.delta).toBe(150);
    expect(r.reference).toBe(100);
    expect(r.ecart).toBeCloseTo(0.5);
  });

  it("saute les relevés sans Δ et tient sans historique", () => {
    expect(resumeVues([releve("2026-10-20", 50), releve("2026-10-21", null)])).toEqual({
      jour: "2026-10-20",
      delta: 50,
      reference: null,
      ecart: null,
    });
    expect(resumeVues([])).toBeNull();
  });
});

describe("tauxPublication", () => {
  it("prend le dernier jour pour hier et garde la tendance", () => {
    const t = tauxPublication([
      { jour: "2026-10-22", prevus: 20, publies: 10 },
      { jour: "2026-10-23", prevus: 0, publies: 0 },
      { jour: "2026-10-24", prevus: 24, publies: 22 },
    ]);
    expect(t).toMatchObject({ prevus: 24, publies: 22 });
    expect(t.taux).toBeCloseTo(22 / 24);
    // Un jour sans rien de prévu est un trou, pas un 0 %.
    expect(t.tendance).toEqual([0.5, null, 22 / 24]);
  });

  it("ne divise pas par zéro", () => {
    expect(tauxPublication([]).taux).toBeNull();
  });
});

describe("lignesStock", () => {
  const reserves = [
    { label_id: "a", nom: "white_bg", comptes: 4, reserve_jours: 3 },
    { label_id: "b", nom: "RH", comptes: 2, reserve_jours: 2 },
    { label_id: "c", nom: "dormant", comptes: 0, reserve_jours: null },
    { label_id: "h", nom: "Hook", comptes: 9, reserve_jours: 1 },
  ];

  it("trie du stock le plus court au plus long et met les dormants à part", () => {
    const { lignes, dormants } = lignesStock(reserves, null);
    expect(lignes.map((l) => l.nom)).toEqual(["Hook", "RH", "white_bg"]);
    expect(dormants).toEqual(["dormant"]);
  });

  it("ne garde que les labels visibles (pas les labels système)", () => {
    const { lignes } = lignesStock(reserves, new Set(["a", "b", "c"]));
    expect(lignes.map((l) => l.nom)).toEqual(["RH", "white_bg"]);
  });
});
