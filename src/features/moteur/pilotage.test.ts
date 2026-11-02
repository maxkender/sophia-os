import { describe, expect, it } from "vitest";

import { lignesStock, resumeVues, serieVuesParJour, tauxPublication } from "./pilotage";

const jour = (j: string, vues: number | null, provisoire = false) => ({
  jour: j,
  vues,
  posts: 10,
  comptes: 5,
  provisoire,
});

describe("resumeVues", () => {
  it("compare les 7 derniers jours figés aux 7 d'avant, sans les jours provisoires", () => {
    const serie = [
      jour("2026-10-10", 999), // hors des deux semaines
      ...[0, 1, 2, 3, 4, 5, 6].map((d) => jour(`2026-10-${11 + d}`, 100)),
      ...[0, 1, 2, 3, 4, 5, 6].map((d) => jour(`2026-10-${18 + d}`, 150)),
      jour("2026-10-25", 10, true),
      jour("2026-10-26", 5, true),
    ];
    const r = resumeVues(serie)!;
    expect(r.du).toBe("2026-10-18");
    expect(r.au).toBe("2026-10-24");
    expect(r.parJour).toBe(150);
    expect(r.reference).toBe(100);
    expect(r.ecart).toBeCloseTo(0.5);
  });

  it("ignore les jours sans post et tient sans historique", () => {
    expect(resumeVues([jour("2026-10-20", 50), jour("2026-10-21", null), jour("2026-10-22", 70)])).toEqual({
      du: "2026-10-20",
      au: "2026-10-22",
      parJour: 60,
      reference: null,
      ecart: null,
    });
    expect(resumeVues([jour("2026-10-21", 30, true)])).toBeNull();
    expect(resumeVues([])).toBeNull();
  });
});

describe("serieVuesParJour", () => {
  it("remplit les jours sans post d'un trou et marque hier et avant-hier provisoires", () => {
    const serie = serieVuesParJour(
      [
        { jour: "2026-10-30", vues: "1874773", posts_mesures: 421, nb_comptes: 217 },
        { jour: "2026-11-01", vues: 1077972, posts_mesures: 415, nb_comptes: 214 },
        { jour: "2026-10-31", vues: null, posts_mesures: 0, nb_comptes: 0 },
      ],
      "2026-11-02",
    );
    expect(serie.map((s) => [s.jour, s.vues, s.provisoire])).toEqual([
      ["2026-10-30", 1874773, false],
      ["2026-10-31", null, false],
      ["2026-11-01", 1077972, true],
      ["2026-11-02", null, true],
    ]);
    expect(serie[0]!.posts).toBe(421);
    expect(serieVuesParJour([], "2026-11-02")).toEqual([]);
  });

  it("traverse un changement de mois et d'heure", () => {
    const serie = serieVuesParJour([{ jour: "2026-10-24", vues: 5, posts_mesures: 1, nb_comptes: 1 }], "2026-10-27");
    expect(serie.map((s) => s.jour)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
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
