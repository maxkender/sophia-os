import { describe, expect, it } from "vitest";

import { avancement, formatDuree, tempsRestant, tonLigne, tourne } from "./nettoyageStickers";

describe("avancement", () => {
  it("compte le scan, la liste à jeter et les remplacements", () => {
    const a = avancement({
      slideshows: { a_analyser: 5, analyse: 2, propre: 80, pub: 6, retrait: 1, repeche: 2, erreur: 1, retire: 3 },
      posts: { a_remplacer: 1, remplacement: 1, remplace: 4, sans_remplacant: 1, ignore: 1 },
    });
    expect(a.total).toBe(100);
    expect(a.analyses).toBe(93);
    expect(a.pubs).toBe(7);
    expect(a.repeches).toBe(2);
    expect(a.erreurs).toBe(1);
    expect(a.retires).toBe(3);
    expect(a.posts).toEqual({ total: 8, faits: 6, remplaces: 4, sansRemplacant: 1, ignores: 1, erreurs: 0 });
  });

  it("sans compteurs : tout à zéro", () => {
    expect(avancement(null).total).toBe(0);
    expect(avancement(undefined).posts.total).toBe(0);
  });
});

describe("statut et journal", () => {
  it("seuls le scan et le retrait tournent côté serveur", () => {
    expect(tourne("scan")).toBe(true);
    expect(tourne("retrait")).toBe(true);
    expect(tourne("a_confirmer")).toBe(false);
    expect(tourne("termine")).toBe(false);
    expect(tourne(null)).toBe(false);
  });

  it("couleur des lignes", () => {
    expect(tonLigne("✗ PUB slide 2 — titre")).toBe("alerte");
    expect(tonLigne("⚠ titre — erreur : 503")).toBe("alerte");
    expect(tonLigne("↻ post abc → nouveau post def")).toBe("action");
    expect(tonLigne("↩ repêché : titre")).toBe("action");
    expect(tonLigne("✓ titre")).toBe("neutre");
  });

  it("durées et temps restant", () => {
    expect(formatDuree(65_000)).toBe("1:05");
    expect(formatDuree(3_725_000)).toBe("1:02:05");
    expect(tempsRestant(0, 10, 5_000)).toBeNull();
    expect(tempsRestant(5, 10, 10_000)).toBe(10_000);
    expect(tempsRestant(10, 10, 10_000)).toBe(0);
  });
});
