import { describe, expect, it } from "vitest";

import { absenceLongue, type CarteRuul, choixRuulImpose, texteAway } from "./ruulDecisions";

const carte = (x: Partial<CarteRuul> = {}): CarteRuul => ({ poster_id: "p", absences: [], attend_reponse: false, jamais_trouve: false, ...x });

describe("cartes Décisions Ruul — 21/11 (point 5)", () => {
  it("Away du X au Y (raison), et la panne de notre côté", () => {
    expect(texteAway({ debut: "2026-11-20", fin: "2026-11-23", raison: "Holiday", source: "absence" })).toBe("Away du 20/11 au 23/11 (Holiday)");
    expect(texteAway({ debut: "2026-11-20", fin: "2026-11-20", raison: "x", source: "panne" })).toContain("Panne de notre côté le 20/11");
  });

  it("Keep imposé : absence de plus de 7 jours, attente de notre réponse, compte jamais trouvé ; sinon rien", () => {
    const longue = carte({ absences: [{ debut: "2026-11-25", fin: "2026-12-10", raison: null, source: "absence" }] });
    expect(absenceLongue(longue, "2026-11-23")?.fin).toBe("2026-12-10");
    expect(choixRuulImpose(longue, "2026-11-23")).toBe("keep");
    expect(choixRuulImpose(carte({ absences: [{ debut: "2026-11-24", fin: "2026-11-25", raison: null, source: "absence" }] }), "2026-11-23")).toBeNull();
    expect(choixRuulImpose(carte({ attend_reponse: true }), "2026-11-23")).toBe("keep");
    expect(choixRuulImpose(carte({ jamais_trouve: true }), "2026-11-23")).toBe("keep");
    expect(choixRuulImpose(undefined, "2026-11-23")).toBeNull();
  });
});
