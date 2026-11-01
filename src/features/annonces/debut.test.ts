import { describe, expect, it } from "vitest";

import { type EtatDebut, texteDebut } from "./debut";

const base: EtatDebut = {
  cas: "mardi", debut: "2026-11-03", handle: "ana.studies", existe: true, abonnements: 2, videos: 0,
  warmup_started_at: "2026-10-31T10:00:00Z", textes: null,
};

describe("0494 : le pop-up Start Tuesday, calculé d'après le dernier relevé", () => {
  it("abonnements manquants", () => {
    expect(texteDebut(base)).toBe(
      "You can't post yet: you still need to follow 3 more accounts with @ana.studies (you have 2/5). Do it before Monday 12:00 (Paris) and you start posting on Tuesday 3 November.",
    );
  });
  it("compte introuvable (et Start warmup pas cliqué)", () => {
    expect(texteDebut({ ...base, existe: false, abonnements: null, warmup_started_at: null })).toBe(
      "You can't post yet: we can't find your TikTok account: create @ana.studies exactly (same spelling); click Start warmup on your dashboard. Do it before Monday 12:00 (Paris) and you start posting on Tuesday 3 November.",
    );
  });
  it("posts pendant le warm-up", () => {
    expect(texteDebut({ ...base, abonnements: 7, videos: 2 })).toBe(
      "You can't post yet: you posted during the warm-up: delete those posts and don't post before your start date. Do it before Monday 12:00 (Paris) and you start posting on Tuesday 3 November.",
    );
  });
  it("Postpone : la nouvelle date ; tout fait : plus de pop-up ; texte modifié dans Settings", () => {
    expect(texteDebut({ ...base, cas: "reporter", debut: "2026-11-09" })).toContain("you start posting on Monday 9 November");
    expect(texteDebut({ ...base, abonnements: 5 })).toBeNull();
    expect(texteDebut({ ...base, textes: { debut_popup_follows: "follow {n} more" } })).toContain("You can't post yet: follow 3 more.");
  });
  it("0498 : 0 follow plus de 24 h après Start warmup : le conseil « TikTok limite les comptes neufs » en paragraphe à part", () => {
    const maintenant = new Date("2026-11-01T20:00:00Z");
    const texte = texteDebut({ ...base, abonnements: 0 }, maintenant)!;
    expect(texte).toContain("you have 0/5). Do it before Monday 12:00");
    expect(texte).toContain("\n\nTikTok sometimes limits new accounts.");
    // Moins de 24 h, ou des follows lus : pas de conseil.
    expect(texteDebut({ ...base, abonnements: 0, warmup_started_at: "2026-11-01T10:00:00Z" }, maintenant)).not.toContain("TikTok sometimes");
    expect(texteDebut({ ...base, abonnements: 2 }, maintenant)).not.toContain("TikTok sometimes");
    // Le texte modifié dans Settings l'emporte.
    expect(texteDebut({ ...base, abonnements: 0, textes: { debut_popup_follows_bloque: "Custom tip." } }, maintenant)).toMatch(/\n\nCustom tip\.$/);
  });
});
