import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@/features/moteur/api", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { choixDepuisCote, couvertureLot, decksAffiches, decompteVotes, preparerDuel, servirLot, verdictCandidat } from "./api";

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

describe("votes des relecteurs (0626)", () => {
  it("compte les votes par version et moyenne les notes", () => {
    const d = decompteVotes([
      { choix: "candidat", note_actuel: 2, note_candidat: 5 },
      { choix: "candidat", note_actuel: 3, note_candidat: 4 },
      { choix: "egal", note_actuel: null, note_candidat: null },
      { choix: "actuel", note_actuel: 4, note_candidat: 3 },
    ]);
    expect(d).toEqual({ votes: 4, candidat: 2, actuel: 1, egal: 1, noteActuel: 3, noteCandidat: 4 });
  });

  it("le verdict suit la règle D8 : 55 % des duels tranchés, au moins 10 votes tranchés", () => {
    expect(verdictCandidat({ part_candidat: 0.7, candidat_gagne: 7, actuel_gagne: 3 })).toBe("retenu");
    expect(verdictCandidat({ part_candidat: 0.5, candidat_gagne: 5, actuel_gagne: 5 })).toBe("ecarte");
    expect(verdictCandidat({ part_candidat: 1, candidat_gagne: 3, actuel_gagne: 0 })).toBe("insuffisant");
    expect(verdictCandidat({ part_candidat: null, candidat_gagne: 0, actuel_gagne: 0 })).toBe("insuffisant");
  });
});

describe("lot commun (0627)", () => {
  beforeEach(() => invoke.mockReset());

  it("la couverture compte les contenus par label, les plus fournis d'abord", () => {
    expect(couvertureLot([{ label: "RH" }, { label: "smart_girl" }, { label: "RH" }, { label: null }])).toEqual([
      { label: "RH", n: 2 },
      { label: "smart_girl", n: 1 },
      { label: "—", n: 1 },
    ]);
  });

  it("un tour du serveur passe par l'action lot_servir", async () => {
    invoke.mockResolvedValue({ ok: true, faits: [], restants: 0, langues: ["fr"], sans_circuit: [] });
    await expect(servirLot()).resolves.toMatchObject({ ok: true, langues: ["fr"] });
    expect(invoke).toHaveBeenCalledWith("ab-traduction", { action: "lot_servir" });
  });
});
