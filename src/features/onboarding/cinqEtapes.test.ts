import { describe, expect, it } from "vitest";

import { CINQ_ETAPES, dimancheAvant, etatsCinqEtapes, jourAnglais, premierPostLe, premiereSemaineFinie } from "./cinqEtapes";

describe("les 5 étapes (28 oct., G)", () => {
  it("5 étapes, dans l'ordre demandé", () => {
    expect(CINQ_ETAPES).toEqual(["connexion", "slack", "tiktok", "warmup", "post"]);
  });

  it("le 1er post : la fin du warm-up s'il est lancé, sinon le lundi de cohorte à venir, sinon le lundi suivant", () => {
    const maintenant = new Date("2026-10-28T10:00:00Z"); // mercredi
    const base = { maintenant, aujourdhui: "2026-10-28" };
    expect(premierPostLe({ ...base, warmupEndsAt: "2026-11-01T22:59:00Z", cohorteLundi: "2026-11-09" })).toBe("2026-11-02");
    expect(premierPostLe({ ...base, warmupEndsAt: null, cohorteLundi: "2026-11-09" })).toBe("2026-11-09");
    expect(premierPostLe({ ...base, warmupEndsAt: null, cohorteLundi: "2026-10-26" })).toBe("2026-11-02");
    expect(premierPostLe({ ...base, warmupEndsAt: null, cohorteLundi: null })).toBe("2026-11-02");
  });

  it("le warm-up se finit le dimanche minuit avant le 1er post", () => {
    expect(dimancheAvant("2026-11-02")).toBe("2026-11-01");
    expect(jourAnglais("2026-11-02")).toBe("Monday 2 November");
  });

  it("états : connexion faite, Slack recommandé, le clic Start warmup vaut TikTok créé", () => {
    const avant = etatsCinqEtapes({ slackLie: false, warmupStartedAt: null, premierPost: "2026-11-02", aujourdhui: "2026-10-28" });
    expect(avant).toEqual({ connexion: "fait", slack: "recommande", tiktok: "en_cours", warmup: "a_venir", post: "a_venir" });
    const lance = etatsCinqEtapes({
      slackLie: true,
      warmupStartedAt: "2026-10-28T11:00:00Z",
      premierPost: "2026-11-02",
      aujourdhui: "2026-10-29",
    });
    expect(lance).toEqual({ connexion: "fait", slack: "fait", tiktok: "fait", warmup: "en_cours", post: "a_venir" });
    const lundi = etatsCinqEtapes({ slackLie: true, warmupStartedAt: "x", premierPost: "2026-11-02", aujourdhui: "2026-11-02" });
    expect(lundi.warmup).toBe("fait");
    expect(lundi.post).toBe("en_cours");
  });

  it("la carte s'efface après la 1re semaine de posts", () => {
    expect(premiereSemaineFinie("2026-11-02", "2026-11-08")).toBe(false);
    expect(premiereSemaineFinie("2026-11-02", "2026-11-09")).toBe(true);
  });
});
