import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@/features/moteur/api", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { ajouterExemplesNatifs, LIGNES_PAR_APPEL } from "./api";

describe("ajouterExemplesNatifs", () => {
  beforeEach(() => invoke.mockReset());

  it("envoie les lignes collées par paquets de 4 et additionne les résumés", async () => {
    invoke.mockImplementation((_nom: string, corps?: { ajouter: { texte: string } }) => {
      const lignes = (corps?.ajouter.texte ?? "").split("\n");
      return Promise.resolve({
        ajoutes: lignes.length * 5,
        deja: 1,
        comptes: lignes.map((l) => ({ pseudo: l.replace("@", ""), slideshows: 5 })),
        ignorees: [],
      });
    });
    const comptes = Array.from({ length: 10 }, (_, i) => `@compte${i + 1}`);
    const r = await ajouterExemplesNatifs("de", "l1", `${comptes.slice(0, 9).join("\n")}\n\n${comptes[9]}, `);

    expect(LIGNES_PAR_APPEL).toBe(4);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke.mock.calls.map((c) => c[1].ajouter.texte.split("\n").length)).toEqual([4, 4, 2]);
    expect(invoke.mock.calls[0]).toEqual([
      "exemples-natifs",
      { ajouter: { langue: "de", labelId: "l1", texte: "@compte1\n@compte2\n@compte3\n@compte4" } },
    ]);
    expect(r.ajoutes).toBe(50);
    expect(r.deja).toBe(3);
    expect(r.comptes).toHaveLength(10);
  });

  it("dit clairement quand rien n'a été reconnu", async () => {
    invoke.mockResolvedValue({ ajoutes: 0, deja: 0, comptes: [], ignorees: ["n'importe quoi"] });
    await expect(ajouterExemplesNatifs("de", null, "n'importe quoi")).rejects.toThrow("Aucun lien TikTok ni compte reconnu.");
  });
});
