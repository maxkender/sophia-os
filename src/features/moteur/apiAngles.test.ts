import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: (...a: unknown[]) => from(...a),
  },
}));

import { activerAnglePlacement, creerAnglePlacement } from "./apiAngles";

describe("apiAngles", () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
    rpc.mockResolvedValue({ data: "id-cree", error: null });
  });

  it("créer : UNE seule fonction transactionnelle, texte nettoyé, actif ou test", async () => {
    await creerAnglePlacement("L", "A", "  insister sur le temps  ", "actif");
    await creerAnglePlacement("L", "A", "montrer la fierté", "test");
    expect(rpc.mock.calls).toEqual([
      ["ajouter_angle_placement", { p_label_id: "L", p_application_id: "A", p_texte: "insister sur le temps", p_actif: true }],
      ["ajouter_angle_placement", { p_label_id: "L", p_application_id: "A", p_texte: "montrer la fierté", p_actif: false }],
    ]);
    expect(from).not.toHaveBeenCalled();
  });

  it("créer : vide ou trop long refusé avant tout appel", async () => {
    await expect(creerAnglePlacement("L", "A", "   ", "test")).rejects.toThrow(/vide/);
    await expect(creerAnglePlacement("L", "A", "x".repeat(501), "test")).rejects.toThrow(/500/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("une erreur de la base remonte (rien n'est annoncé enregistré)", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "duplicate key value violates unique constraint" } });
    await expect(creerAnglePlacement("L", "A", "x", "actif")).rejects.toMatchObject({ message: /duplicate/ });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "angle introuvable" } });
    await expect(activerAnglePlacement("id")).rejects.toMatchObject({ message: /introuvable/ });
  });
});
