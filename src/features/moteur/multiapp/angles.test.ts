import { describe, expect, it } from "vitest";

import {
  angleDuLien,
  anglesPerdus,
  ANGLE_LONGUEUR_MAX,
  lignesAnglesApplication,
  normaliserAngle,
} from "./angles";

const SOPHIA = "00000000-0000-4000-8000-000000000001";
const UNSWIPE = "00000000-0000-4000-8000-000000000003";

const LABELS = [
  { id: "w", nom: "weird_alpha", slug: "weird-alpha" },
  { id: "b", nom: "beau_smart_girl", slug: "beau-smart-girl" },
  { id: "h", nom: "hook", slug: "hook" },
  { id: "s", nom: "smart_girl", slug: "smart-girl" },
];

const LIENS = [
  { label_id: "w", application_id: SOPHIA, angle: null },
  { label_id: "w", application_id: UNSWIPE, angle: "  insister sur la discipline  " },
  { label_id: "b", application_id: UNSWIPE, angle: "" },
  { label_id: "h", application_id: UNSWIPE, angle: "système, jamais affiché" },
  { label_id: "s", application_id: SOPHIA },
];

describe("angles de placement", () => {
  it("borne identique à celle du moteur", () => {
    expect(ANGLE_LONGUEUR_MAX).toBe(500);
  });

  it("normaliserAngle : blancs de bord retirés, null = vide", () => {
    expect(normaliserAngle("  x \n")).toBe("x");
    expect(normaliserAngle(null)).toBe("");
    expect(normaliserAngle(undefined)).toBe("");
  });

  it("angleDuLien : l'angle de la paire, vide sinon", () => {
    expect(angleDuLien(LIENS, "w", UNSWIPE)).toBe("insister sur la discipline");
    expect(angleDuLien(LIENS, "w", SOPHIA)).toBe("");
    expect(angleDuLien(LIENS, "x", UNSWIPE)).toBe("");
  });

  it("lignesAnglesApplication : labels qui servent l'application, sans système, triés par nom", () => {
    expect(lignesAnglesApplication(UNSWIPE, LABELS, LIENS)).toEqual([
      { labelId: "b", nom: "beau_smart_girl", angle: "" },
      { labelId: "w", nom: "weird_alpha", angle: "insister sur la discipline" },
    ]);
    expect(lignesAnglesApplication(SOPHIA, LABELS, LIENS).map((l) => l.nom)).toEqual([
      "smart_girl",
      "weird_alpha",
    ]);
  });

  it("anglesPerdus : décocher une application qui a un angle le signale, pas les autres", () => {
    expect(anglesPerdus("w", LIENS, [SOPHIA])).toEqual([
      { applicationId: UNSWIPE, angle: "insister sur la discipline" },
    ]);
    expect(anglesPerdus("w", LIENS, [SOPHIA, UNSWIPE])).toEqual([]);
    expect(anglesPerdus("b", LIENS, [SOPHIA]), "angle vide : rien à perdre").toEqual([]);
  });
});
