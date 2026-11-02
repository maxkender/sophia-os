import { describe, expect, it } from "vitest";

import { composerNudge, joignable, lireNudges, NUDGES_DEFAUT, situation } from "./nudges";
import type { RecrueOnboarding } from "./api";

const r = {
  nom: "Ana Silva", email: "anas@sophia.com", handle: "ana.livros12", slack: false, cohorte_lundi: "2026-11-02", contrat_id: "44700001",
} as unknown as RecrueOnboarding;

describe("Onboarding posters : les nudges", () => {
  it("le message rempli ; sur Upwork, pas sur Slack : le lien Slack est ajouté", () => {
    const t = composerNudge("Hi {prenom}, create @{handle} ({url}), Monday {cohorte}. {inconnu}", r, "upwork", "https://join.slack.com/x");
    expect(t).toContain("Hi Ana, create @ana.livros12 (https://sophia-marketing-orga.vercel.app), Monday 2 November. {inconnu}");
    expect(t).toContain("Join our Slack: https://join.slack.com/x");
    // Déjà dans le texte, ou sur Slack : pas de 2e lien.
    expect(composerNudge("Join {slack}", r, "upwork", "https://join.slack.com/x").match(/join\.slack/g)?.length).toBe(1);
    expect(composerNudge("Hi", { ...r, slack: true }, "upwork", "https://join.slack.com/x")).toBe("Hi");
    expect(composerNudge("Hi", r, "slack", "https://join.slack.com/x")).toBe("Hi");
  });

  it("la situation, les messages par défaut, qui est joignable", () => {
    expect(lireNudges(null)).toEqual(NUDGES_DEFAUT);
    expect(lireNudges({ slack: "Custom", tiktok: " " }).slack).toBe("Custom");
    expect(lireNudges({ tiktok: " " }).tiktok).toBe(NUDGES_DEFAUT.tiktok);
    expect(joignable(r, "slack")).toBe(false);
    expect(joignable(r, "upwork")).toBe(true);
    expect(situation({ ...r, slack: false, connexion_at: null, tiktok_at: null, warmup_at: null, pret: false } as RecrueOnboarding)).toBe("slack");
  });
});
