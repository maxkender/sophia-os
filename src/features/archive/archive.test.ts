import { describe, expect, it } from "vitest";

import { estPosteurArchive, repartirArchive } from "./archive";

const posteur = (id: string, is_active = true) => ({ id, is_active });
const compte = (id: string, poster_id: string, is_active = true) => ({ id, poster_id, is_active });

describe("estPosteurArchive", () => {
  it("archive un posteur désactivé", () => {
    expect(estPosteurArchive(posteur("p", false), [compte("c", "p")])).toBe(true);
  });

  it("archive un posteur dont tous les comptes dorment", () => {
    expect(estPosteurArchive(posteur("p"), [compte("a", "p", false), compte("b", "p", false)])).toBe(true);
  });

  it("garde un posteur avec au moins un compte actif", () => {
    expect(estPosteurArchive(posteur("p"), [compte("a", "p", false), compte("b", "p")])).toBe(false);
  });

  it("garde un posteur actif sans compte (pas encore commencé)", () => {
    expect(estPosteurArchive(posteur("p"), [])).toBe(false);
  });
});

describe("repartirArchive", () => {
  it("sort les posteurs archivés et les comptes dormants des posteurs actifs", () => {
    const { actifs, archive } = repartirArchive(
      [posteur("meltem"), posteur("ana"), posteur("eve", false), posteur("neuf")],
      [
        compte("ege", "meltem", false),
        compte("a1", "ana"),
        compte("a2", "ana", false),
        compte("e1", "eve", false),
      ],
    );
    expect(actifs.map((p) => p.id)).toEqual(["ana", "neuf"]);
    expect(
      archive.map((e) => [e.posteur.id, e.posteurArchive, e.comptes.map((c) => c.id)]),
    ).toEqual([
      ["meltem", true, ["ege"]],
      ["ana", false, ["a2"]],
      ["eve", true, ["e1"]],
    ]);
  });

  it("sans les comptes chargés, seul le profil décide", () => {
    const { actifs, archive } = repartirArchive([posteur("a"), posteur("b", false)], undefined);
    expect(actifs.map((p) => p.id)).toEqual(["a"]);
    expect(archive.map((e) => e.posteur.id)).toEqual(["b"]);
  });
});
