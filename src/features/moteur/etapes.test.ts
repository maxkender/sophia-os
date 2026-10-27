import { describe, expect, it } from "vitest";

import { compterEtapes, etapeCompte, qualiteAffichee, tempsRestant } from "./etapes";

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

describe("Inactive et temps restant du warm-up", () => {
  const fini = { ...base, warmupStartedAt: "2026-09-28T10:00:00Z", warmupEndsAt: "2026-10-04T22:00:00Z", premierJour: "2026-10-05" };

  it("plus de 4 jours sans post publié : Inactive, avec la date du dernier post", () => {
    expect(etape({ ...fini, dernierPublie: "2026-10-15" })).toEqual({
      etape: "inactive",
      semaine: 4,
      dernierPost: "2026-10-15",
    });
  });

  it("4 jours pile : encore Posting", () => {
    expect(etape({ ...fini, dernierPublie: "2026-10-23" }).etape).toBe("posting");
    expect(etape({ ...fini, dernierPublie: "2026-10-22" }).etape).toBe("inactive");
  });

  it("aucun post : compté depuis le premier jour prévu", () => {
    expect(etape({ ...fini, premierJour: "2026-10-26", dernierPublie: null }).etape).toBe("posting");
    expect(etape({ ...fini, dernierPublie: null })).toMatchObject({ etape: "inactive", dernierPost: null });
  });

  it("dernier post inconnu (données absentes) : jamais Inactive", () => {
    expect(etape({ ...fini }).etape).toBe("posting");
  });

  it("la qualité reste affichée sur un compte Inactive", () => {
    expect(qualiteAffichee({ etape: "inactive", semaine: 4 }, "good")).toBe("good");
  });

  it("warm-up : la fin est rendue pour le temps restant", () => {
    const e = etape({ ...base, warmupStartedAt: "2026-10-25T10:00:00Z", warmupEndsAt: "2026-11-01T23:00:00Z" });
    expect(e).toMatchObject({ etape: "warming_up", warmupFin: "2026-11-01T23:00:00Z" });
    expect(tempsRestant("2026-11-01T23:00:00Z", MAINTENANT)).toEqual({ jours: 5, heures: 14 });
    expect(tempsRestant("2026-10-27T13:30:00Z", MAINTENANT)).toEqual({ jours: 0, heures: 5 });
    expect(tempsRestant("2026-10-27T08:00:00Z", MAINTENANT)).toEqual({ jours: 0, heures: 0 });
  });
});
