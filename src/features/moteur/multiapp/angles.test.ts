import { describe, expect, it } from "vitest";

import {
  ANGLE_LONGUEUR_MAX,
  anglesTestCompares,
  groupesAnglesApplication,
  MAX_ANGLES_TEST,
  normaliserAngle,
} from "./angles";

const SOPHIA = "00000000-0000-4000-8000-000000000001";
const UNSWIPE = "00000000-0000-4000-8000-000000000003";

const LABELS = [
  { id: "w", nom: "weird_alpha", slug: "weird-alpha" },
  { id: "b", nom: "beau_smart_girl", slug: "beau-smart-girl" },
  { id: "h", nom: "hook", slug: "hook" },
  { id: "s", nom: "smart_girl", slug: "smart-girl" },
  { id: "z", nom: "zen", slug: "zen" },
];

// w : Sophia + Unswipe ; b : Unswipe ; h : système ; s : Sophia ; z : aucune ligne (sert Sophia).
const LIENS = [
  { label_id: "w", application_id: SOPHIA },
  { label_id: "w", application_id: UNSWIPE },
  { label_id: "b", application_id: UNSWIPE },
  { label_id: "h", application_id: UNSWIPE },
  { label_id: "s", application_id: SOPHIA },
];

const angle = (id: string, label_id: string, statut: string, minute: number, application_id = UNSWIPE) => ({
  id,
  label_id,
  application_id,
  texte: `angle ${id}`,
  statut,
  created_at: `2026-10-14T08:${String(minute).padStart(2, "0")}:00Z`,
});

describe("angles de placement", () => {
  it("bornes identiques à celles du moteur", () => {
    expect(ANGLE_LONGUEUR_MAX).toBe(500);
    expect(MAX_ANGLES_TEST).toBe(4);
  });

  it("normaliserAngle : blancs de bord retirés, null = vide", () => {
    expect(normaliserAngle("  x \n")).toBe("x");
    expect(normaliserAngle(null)).toBe("");
    expect(normaliserAngle(undefined)).toBe("");
  });

  it("une carte par label qui sert l'application, système exclu, ceux qui servent d'abord puis par nom", () => {
    const g = groupesAnglesApplication(UNSWIPE, LABELS, LIENS, []);
    expect(g.map((x) => [x.nom, x.sert, x.actifs, x.tests])).toEqual([
      ["beau_smart_girl", true, [], []],
      ["weird_alpha", true, [], []],
    ]);
  });

  it("Sophia : un label sans application cochée ne la sert pas (21/10)", () => {
    expect(groupesAnglesApplication(SOPHIA, LABELS, LIENS, []).map((x) => x.nom)).toEqual([
      "smart_girl",
      "weird_alpha",
    ]);
  });

  it("actifs et tests rangés par paire, du plus ancien au plus récent, autres applications ignorées", () => {
    const angles = [
      angle("t2", "w", "test", 5),
      angle("a2", "w", "actif", 4),
      angle("a", "w", "actif", 1),
      angle("t1", "w", "test", 2),
      angle("sophia", "w", "test", 0, SOPHIA),
      angle("b1", "b", "test", 3),
    ];
    const [b, w] = groupesAnglesApplication(UNSWIPE, LABELS, LIENS, angles);
    expect(w.actifs.map((x) => x.id)).toEqual(["a", "a2"]);
    expect(w.tests.map((x) => x.id)).toEqual(["t1", "t2"]);
    expect(b.actifs).toEqual([]);
    expect(b.tests.map((x) => x.id)).toEqual(["b1"]);
  });

  it("un label qui ne sert plus l'application mais garde des angles : listé en dernier, marqué", () => {
    const g = groupesAnglesApplication(UNSWIPE, LABELS, LIENS, [angle("x", "s", "actif", 1)]);
    expect(g.map((x) => [x.nom, x.sert])).toEqual([
      ["beau_smart_girl", true],
      ["weird_alpha", true],
      ["smart_girl", false],
    ]);
    expect(g[2].actifs.map((x) => x.id)).toEqual(["x"]);
  });

  it("label inconnu ou système : jamais de carte, même avec des angles", () => {
    const g = groupesAnglesApplication(UNSWIPE, LABELS, LIENS, [angle("x", "inconnu", "test", 1), angle("y", "h", "actif", 2)]);
    expect(g.map((x) => x.nom)).toEqual(["beau_smart_girl", "weird_alpha"]);
  });

  it("anglesTestCompares : même règle que le moteur — sans copie d'un actif, sans doublon, les plus anciens d'abord", () => {
    const a = (id: string, texte: string) => ({ id, texte });
    const actifs = [a("actif", "insister sur le temps"), a("actif2", "parler du sommeil")];
    const tests = [
      a("t1", " insister sur le temps "),
      a("t0", "parler du sommeil"),
      a("t2", "montrer la fierté"),
      a("t3", "montrer la fierté"),
      a("t4", "b"),
      a("t5", "c"),
      a("t6", "d"),
      a("t7", "e"),
    ];
    const { compares, nonCompares } = anglesTestCompares(actifs, tests);
    expect(compares.map((x) => x.id)).toEqual(["t2", "t4", "t5", "t6"]);
    expect(Object.fromEntries(nonCompares)).toEqual({
      t1: "identique_actif",
      t0: "identique_actif",
      t3: "doublon",
      t7: "au_dela_max",
    });
    expect(anglesTestCompares([], [a("x", "y")]).compares.map((x) => x.id)).toEqual(["x"]);
  });
});
