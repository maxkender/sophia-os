import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@/features/moteur/api", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { ajouterExemplesNatifs, relireExempleNatif } from "./api";

describe("ajouterExemplesNatifs", () => {
  beforeEach(() => invoke.mockReset());

  it("envoie tout le collé en un appel : le serveur cherche et lit ensuite tout seul", async () => {
    invoke.mockResolvedValue({ ajoutes: 1, deja: 0, comptes: 9, dejaEnFile: 1, ignorees: [] });
    const comptes = Array.from({ length: 10 }, (_, i) => `@compte${i + 1}`).join("\n");
    const r = await ajouterExemplesNatifs("de", "l1", `https://www.tiktok.com/@x/photo/1\n${comptes}`);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("exemples-natifs", {
      ajouter: { langue: "de", labelId: "l1", texte: `https://www.tiktok.com/@x/photo/1\n${comptes}` },
    });
    expect(r).toEqual({ ajoutes: 1, deja: 0, comptes: 9, dejaEnFile: 1, ignorees: [] });
  });

  it("dit clairement quand rien n'a été reconnu", async () => {
    invoke.mockResolvedValue({ ajoutes: 0, deja: 0, comptes: 0, dejaEnFile: 0, ignorees: ["n'importe quoi"] });
    await expect(ajouterExemplesNatifs("de", null, "n'importe quoi")).rejects.toThrow("Aucun lien TikTok ni compte reconnu.");
  });

  it("remet un exemple en file de lecture", async () => {
    invoke.mockResolvedValue({ ok: true, relances: 1 });
    await relireExempleNatif("e1");
    expect(invoke).toHaveBeenCalledWith("exemples-natifs", { relire: { ids: ["e1"] } });
  });
});
