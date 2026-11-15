import { describe, expect, it } from "vitest";

import { cycleRituel, faitDansCycle, vuesCompte, type RituelFait } from "./rituelsFaits";

const fait = (rituel: RituelFait["rituel"], fait_at: string): RituelFait => ({ id: fait_at, rituel, lundi: "2026-11-02", fait_at, resume: {} });

describe("0540 : un rituel fait le reste jusqu'au même jour de la semaine suivante", () => {
  it("le cycle : du dernier jour du rituel (aujourd'hui compris) au suivant", () => {
    expect(cycleRituel("jeudi", "2026-11-05")).toEqual({ debut: "2026-11-05", prochain: "2026-11-12" });
    expect(cycleRituel("jeudi", "2026-11-10")).toEqual({ debut: "2026-11-05", prochain: "2026-11-12" });
    expect(cycleRituel("samedi", "2026-11-05")).toEqual({ debut: "2026-10-31", prochain: "2026-11-07" });
    expect(cycleRituel("dimanche", "2026-11-08")).toEqual({ debut: "2026-11-08", prochain: "2026-11-15" });
  });

  it("le jeudi fait le 5/11 reste fait jusqu'au mercredi 11/11, plus le jeudi 12/11", () => {
    const l = [fait("jeudi", "2026-11-05T13:36:00Z")];
    expect(faitDansCycle(l, "jeudi", "2026-11-05")).not.toBeNull();
    expect(faitDansCycle(l, "jeudi", "2026-11-11")).not.toBeNull();
    expect(faitDansCycle(l, "jeudi", "2026-11-12")).toBeNull();
    expect(faitDansCycle(l, "samedi", "2026-11-05")).toBeNull();
  });

  it("les vues pour la confirmation : la médiane des derniers posts mesurés", () => {
    expect(vuesCompte([{ vues: 300 }, { vues: null }, { vues: 900 }, { vues: 858 }])).toBe(858);
    expect(vuesCompte([])).toBeNull();
  });
});
