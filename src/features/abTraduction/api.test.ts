import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@/features/moteur/api", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { choixDepuisCote, decksAffiches, preparerDuel } from "./api";

const actuel = [{ position: 1, texte_overlay: "publié", position_sophia: false }];
const candidat = [{ position: 1, texte_overlay: "nouveau", position_sophia: false }];

describe("duel à l'aveugle", () => {
  it("le côté voté redevient la version gagnante, quel que soit le tirage", () => {
    expect(choixDepuisCote({ gauche: "actuel" }, "gauche")).toBe("actuel");
    expect(choixDepuisCote({ gauche: "actuel" }, "droite")).toBe("candidat");
    expect(choixDepuisCote({ gauche: "candidat" }, "gauche")).toBe("candidat");
    expect(choixDepuisCote({ gauche: "candidat" }, "droite")).toBe("actuel");
    expect(choixDepuisCote({ gauche: "candidat" }, "egal")).toBe("egal");
  });

  it("les decks s'affichent dans l'ordre tiré", () => {
    expect(decksAffiches({ gauche: "actuel", slides_actuel: actuel, slides_candidat: candidat })).toEqual([actuel, candidat]);
    expect(decksAffiches({ gauche: "candidat", slides_actuel: actuel, slides_candidat: candidat })).toEqual([candidat, actuel]);
  });
});

describe("preparerDuel", () => {
  beforeEach(() => invoke.mockReset());

  it("prépare un duel par appel, pour une langue et un candidat", async () => {
    invoke.mockResolvedValue({ ok: true, duel_id: "d1" });
    await expect(preparerDuel("de", "ancree")).resolves.toEqual({ ok: true, duel_id: "d1" });
    expect(invoke).toHaveBeenCalledWith("ab-traduction", { action: "duel_preparer", langue: "de", candidat: "ancree" });
  });
});
