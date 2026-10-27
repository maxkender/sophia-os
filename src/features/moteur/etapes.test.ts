import { describe, expect, it } from "vitest";

import { compterEtapes, etapeCompte, qualiteAffichee } from "./etapes";

// Mardi 27 oct. 2026, 10 h.
const AUJ = "2026-10-27";
const MAINTENANT = new Date("2026-10-27T09:00:00Z");
const base = { compteId: "c", isActive: true };
const etape = (e: Parameters<typeof etapeCompte>[0]) => etapeCompte(e, AUJ, MAINTENANT);

describe("étape d'un compte", () => {
  it("pas de compte, ou warm-up pas lancé sans compte TikTok : Account not created", () => {
    expect(etape({})).toEqual({ etape: "not_created", semaine: null });
    expect(etape({ ...base, tiktokExiste: false }).etape).toBe("not_created");
    expect(etape({ ...base, tiktokExiste: null }).etape).toBe("not_created");
  });

  it("compte TikTok créé, Start warmup pas cliqué : Not warming up", () => {
    expect(etape({ ...base, tiktokExiste: true }).etape).toBe("not_warming_up");
  });

  it("warm-up en cours : Warming up", () => {
    expect(etape({ ...base, warmupStartedAt: "2026-10-25T10:00:00Z", warmupEndsAt: "2026-11-01T23:00:00Z" }).etape).toBe(
      "warming_up",
    );
  });

  it("warm-up fini, attend le lundi de sa cohorte : Ready", () => {
    const fini = { ...base, warmupStartedAt: "2026-10-19T10:00:00Z", warmupEndsAt: "2026-10-26T23:00:00Z" };
    expect(etape({ ...fini, premierJour: null }).etape).toBe("ready");
    expect(etape({ ...fini, premierJour: "2026-11-02" }).etape).toBe("ready");
  });

  it("Posting · week N : 1 la première semaine, 2 la suivante", () => {
    const fini = { ...base, warmupStartedAt: "2026-10-12T10:00:00Z", warmupEndsAt: "2026-10-18T22:00:00Z" };
    expect(etape({ ...fini, premierJour: "2026-10-26" })).toEqual({ etape: "posting", semaine: 1 });
    expect(etape({ ...fini, premierJour: "2026-10-19" })).toEqual({ etape: "posting", semaine: 2 });
  });

  it("désactivé : Stopped s'il est arrêté pour de bon, Dormant sinon (en veille)", () => {
    expect(etape({ ...base, isActive: false, arrete: true }).etape).toBe("stopped");
    expect(etape({ ...base, isActive: false, arrete: false }).etape).toBe("dormant");
    expect(etape({ ...base, isActive: false }).etape).toBe("dormant");
  });

  it("qualité seulement pour un compte qui poste", () => {
    expect(qualiteAffichee({ etape: "posting", semaine: 2 }, "shadowban")).toBe("shadowban");
    expect(qualiteAffichee({ etape: "ready", semaine: null }, "good")).toBeNull();
  });

  it("compteurs par étape", () => {
    const c = compterEtapes([
      { etape: "not_created", semaine: null },
      { etape: "posting", semaine: 1 },
      { etape: "posting", semaine: 3 },
    ]);
    expect(c.not_created).toBe(1);
    expect(c.posting).toBe(2);
    expect(c.stopped).toBe(0);
  });
});
