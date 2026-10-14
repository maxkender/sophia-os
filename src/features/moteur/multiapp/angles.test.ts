import { describe, expect, it } from "vitest";

import { ANGLE_LONGUEUR_MAX, groupesAnglesApplication, MAX_ANGLES_TEST, normaliserAngle } from "./angles";

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
    expect(g.map((x) => [x.nom, x.sert, x.actif, x.tests])).toEqual([
      ["beau_smart_girl", true, null, []],
      ["weird_alpha", true, null, []],
    ]);
  });

  it("Sophia : un label sans aucune ligne la sert (héritage)", () => {
    expect(groupesAnglesApplication(SOPHIA, LABELS, LIENS, []).map((x) => x.nom)).toEqual([
      "smart_girl",
      "weird_alpha",
      "zen",
    ]);
  });

  it("actif et tests rangés par paire, tests du plus ancien au plus récent, autres applications ignorées", () => {
    const angles = [
      angle("t2", "w", "test", 5),
      angle("a", "w", "actif", 1),
      angle("t1", "w", "test", 2),
      angle("sophia", "w", "test", 0, SOPHIA),
      angle("b1", "b", "test", 3),
    ];
    const [b, w] = groupesAnglesApplication(UNSWIPE, LABELS, LIENS, angles);
    expect(w.actif?.id).toBe("a");
    expect(w.tests.map((x) => x.id)).toEqual(["t1", "t2"]);
    expect(b.actif).toBeNull();
    expect(b.tests.map((x) => x.id)).toEqual(["b1"]);
  });

  it("un label qui ne sert plus l'application mais garde des angles : listé en dernier, marqué", () => {
    const g = groupesAnglesApplication(UNSWIPE, LABELS, LIENS, [angle("x", "s", "actif", 1)]);
    expect(g.map((x) => [x.nom, x.sert])).toEqual([
      ["beau_smart_girl", true],
      ["weird_alpha", true],
      ["smart_girl", false],
    ]);
    expect(g[2].actif?.id).toBe("x");
  });

  it("label inconnu ou système : jamais de carte, même avec des angles", () => {
    const g = groupesAnglesApplication(UNSWIPE, LABELS, LIENS, [angle("x", "inconnu", "test", 1), angle("y", "h", "actif", 2)]);
    expect(g.map((x) => x.nom)).toEqual(["beau_smart_girl", "weird_alpha"]);
  });
});
