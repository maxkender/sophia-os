import { describe, expect, it } from "vitest";

import { exigencesWarmup } from "./exigences";

describe("au moins 5 follows et 2 reposts", () => {
  it("OK seulement si les deux conditions sont remplies", () => {
    expect(exigencesWarmup({ abonnements: 6 }, "2026-10-27T10:00:00Z").ok).toBe(true);
    expect(exigencesWarmup({ abonnements: 5 }, "2026-10-27T10:00:00Z").ok).toBe(true);
  });

  it("ce qui manque : follows, reposts, ou les deux", () => {
    const peu = exigencesWarmup({ abonnements: 3 }, "2026-10-27T10:00:00Z");
    expect([peu.ok, peu.followsOk, peu.repostsOk, peu.followsManquants]).toEqual([false, false, true, 2]);
    const sansReposts = exigencesWarmup({ abonnements: 8 }, null);
    expect([sansReposts.ok, sansReposts.followsOk, sansReposts.repostsOk]).toEqual([false, true, false]);
    const rien = exigencesWarmup({ abonnements: null }, undefined);
    expect([rien.ok, rien.follows, rien.followsManquants]).toEqual([false, null, 5]);
  });
});
