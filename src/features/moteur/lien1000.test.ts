import { describe, expect, it } from "vitest";

import { compterActions, type LigneLien1000, trierLignes } from "./lien1000";

const ligne = (handle: string, action: LigneLien1000["action"], abonnes: number | null): LigneLien1000 => ({
  compte_id: handle,
  handle,
  poster: "P",
  langue: "de",
  abonnes,
  bio_lien: null,
  application: "sophia",
  lien: "taap.it/sophia",
  action,
  message_at: null,
  relance_at: null,
  fait_at: null,
  releve_at: null,
});

describe("lien à 1 000 abonnés", () => {
  it("compte chaque action, zéro pour les absentes", () => {
    const n = compterActions([ligne("a", "message", 1200), ligne("b", "message", 1500), ligne("c", "fait", 3000)]);
    expect(n.message).toBe(2);
    expect(n.fait).toBe(1);
    expect(n.relance).toBe(0);
  });

  it("ce qui part au prochain envoi d'abord, puis par abonnés", () => {
    const tri = trierLignes([
      ligne("fait", "fait", 9000),
      ligne("petit", "message", 1100),
      ligne("relance", "relance", 1300),
      ligne("gros", "message", 5000),
      ligne("sans", "pas_de_releve", null),
    ]);
    expect(tri.map((l) => l.handle)).toEqual(["gros", "petit", "relance", "fait", "sans"]);
  });
});
