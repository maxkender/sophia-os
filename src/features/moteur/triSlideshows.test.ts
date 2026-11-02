import { describe, expect, it } from "vitest";

import {
  TRIS_SLIDESHOWS,
  filtrerParBleo,
  handleDuContenu,
  trierSlideshows,
  type InfosBleoTri,
  type SlideshowTriable,
} from "./triSlideshows";

const slideshow = (id: string, created_at: string, extra: Partial<SlideshowTriable> = {}): SlideshowTriable => ({
  id,
  created_at,
  compte_reference_id: null,
  ...extra,
});

const bleo = (b: Partial<InfosBleoTri>): InfosBleoTri => ({
  verdict: "en_attente",
  etat_bleo: "a_juger",
  valeur_max: null,
  vues_moyenne: null,
  r_moyen: null,
  ...b,
});

const ids = (liste: SlideshowTriable[]) => liste.map((c) => c.id);

// a, b, c, d : du plus ancien au plus récent ; d est hors BLEO.
const liste = [
  slideshow("a", "2026-10-01T00:00:00Z", { nb_posts: 3, compte_reference_id: "cz" }),
  slideshow("b", "2026-10-02T00:00:00Z", { nb_posts: 9, compte_reference_id: "ca" }),
  slideshow("c", "2026-10-03T00:00:00Z", { nb_posts: 3 }),
  slideshow("d", "2026-10-04T00:00:00Z", { nb_posts: 0, compte_reference_id: "ca" }),
];
const bleoParId = new Map<string, InfosBleoTri>([
  ["a", bleo({ verdict: "gagnant", etat_bleo: "juge", valeur_max: 1.5, vues_moyenne: 12_000, r_moyen: 0.8 })],
  ["b", bleo({ verdict: "non_gagnant", etat_bleo: "juge", valeur_max: 0.4, vues_moyenne: 30_000, r_moyen: 2.4 })],
  ["c", bleo({ verdict: "en_attente", etat_bleo: "en_test", valeur_max: 1.5, vues_moyenne: null, r_moyen: 1.1 })],
]);
const handleParId = new Map([
  ["ca", "alice"],
  ["cz", "zoe"],
]);
const ctx = { handleParId, bleoParId };

describe("trierSlideshows", () => {
  it("la valeur BLEO d'abord (le tri par défaut) : décroissante, à égalité le plus récent, hors BLEO en dernier", () => {
    expect(TRIS_SLIDESHOWS[0]).toBe("valeur");
    expect(TRIS_SLIDESHOWS).not.toContain("tier");
    expect(ids(trierSlideshows(liste, "valeur", ctx))).toEqual(["c", "a", "b", "d"]);
  });

  it("vues moyennes et r moyen : décroissants, sans chiffre en dernier", () => {
    expect(ids(trierSlideshows(liste, "vues", ctx))).toEqual(["b", "a", "d", "c"]);
    expect(ids(trierSlideshows(liste, "r", ctx))).toEqual(["b", "c", "a", "d"]);
  });

  it("sans aucune ligne BLEO (pas encore lue), les tris BLEO retombent sur le plus récent", () => {
    expect(ids(trierSlideshows(liste, "valeur", { handleParId, bleoParId: new Map() }))).toEqual(["d", "c", "b", "a"]);
  });

  it("garde les tris d'avant : récent, posts, compte", () => {
    expect(ids(trierSlideshows(liste, "recent", ctx))).toEqual(["d", "c", "b", "a"]);
    expect(ids(trierSlideshows(liste, "posts", ctx))).toEqual(["b", "c", "a", "d"]);
    // Comme avant : sans compte (handle vide) d'abord, puis alice (d puis b, du plus récent), puis zoe (a).
    expect(ids(trierSlideshows(liste, "compte", ctx))).toEqual(["c", "d", "b", "a"]);
  });

  it("ne touche pas la liste reçue", () => {
    const copie = [...liste];
    trierSlideshows(liste, "valeur", ctx);
    expect(liste).toEqual(copie);
  });
});

describe("filtrerParBleo", () => {
  it("« tous » partout : tout passe, hors BLEO compris", () => {
    expect(ids(filtrerParBleo(liste, { verdict: "tous", etat: "tous" }, bleoParId))).toEqual(["a", "b", "c", "d"]);
  });

  it("par verdict, par état, ou les deux ; un filtre posé écarte les hors BLEO", () => {
    expect(ids(filtrerParBleo(liste, { verdict: "gagnant", etat: "tous" }, bleoParId))).toEqual(["a"]);
    expect(ids(filtrerParBleo(liste, { verdict: "tous", etat: "juge" }, bleoParId))).toEqual(["a", "b"]);
    expect(ids(filtrerParBleo(liste, { verdict: "non_gagnant", etat: "juge" }, bleoParId))).toEqual(["b"]);
    expect(ids(filtrerParBleo(liste, { verdict: "gagnant", etat: "en_test" }, bleoParId))).toEqual([]);
  });
});

describe("handleDuContenu", () => {
  it("le @ du compte source, vide sans compte ou compte inconnu", () => {
    expect(handleDuContenu({ compte_reference_id: "ca" }, handleParId)).toBe("alice");
    expect(handleDuContenu({ compte_reference_id: null }, handleParId)).toBe("");
    expect(handleDuContenu({ compte_reference_id: "x" }, handleParId)).toBe("");
  });
});
