import { describe, expect, it } from "vitest";

import type { CompteCohorte } from "./api";
import { etatCohorte } from "./etapeCohorte";

function compte(partiel: Partial<CompteCohorte>): CompteCohorte {
  return {
    compte_id: "c",
    poster_id: "p",
    hm_id: null,
    handle: "h",
    pays: "PL",
    langue: "pl",
    application: "sophia",
    is_active: true,
    cree_le: "2026-10-24T10:00:00Z",
    warmup_lance_le: null,
    warmup_fin: null,
    premier_jour: null,
    glisse_de: null,
    seuil_mort: 50,
    seuil_bon: 5000,
    posts: [],
    releves: [],
    ...partiel,
  };
}

const releve = (existe: boolean | null) => ({
  at: "2026-10-26T07:00:00Z",
  existe,
  cree_tiktok_at: null,
  abonnements: 0,
  likes: 0,
  abonnes: 0,
  videos: 0,
});

const MAINTENANT = new Date("2026-10-27T09:00:00Z");

describe("étape d'un compte de cohorte", () => {
  it("relevé : pas de compte TikTok → Account not created ; créé → Not warming up", () => {
    expect(etatCohorte(compte({ releves: [releve(false)] }), "2026-10-27", MAINTENANT).etape).toBe("not_created");
    expect(etatCohorte(compte({ releves: [releve(true), releve(null)] }), "2026-10-27", MAINTENANT).etape).toBe(
      "not_warming_up",
    );
  });

  it("Start cliqué → Warming up ; cohorte qui poste → Posting · week 1 ; désactivé → Stopped", () => {
    expect(
      etatCohorte(compte({ warmup_lance_le: "2026-10-26T10:00:00Z", warmup_fin: "2026-11-01T23:00:00Z" }), "2026-10-27", MAINTENANT)
        .etape,
    ).toBe("warming_up");
    const poste = compte({
      warmup_lance_le: "2026-10-19T10:00:00Z",
      warmup_fin: "2026-10-25T23:00:00Z",
      premier_jour: "2026-10-26",
    });
    expect(etatCohorte(poste, "2026-10-27", MAINTENANT)).toEqual({ etape: "posting", semaine: 1 });
    expect(etatCohorte({ ...poste, is_active: false }, "2026-10-27", MAINTENANT).etape).toBe("stopped");
  });
});
