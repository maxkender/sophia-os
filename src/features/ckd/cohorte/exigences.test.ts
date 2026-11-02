import { describe, expect, it } from "vitest";

import { exigencesWarmup } from "./exigences";

describe("au moins 5 follows (plus de reposts depuis le 28 oct.)", () => {
  it("5 follows suffisent", () => {
    expect(exigencesWarmup({ abonnements: 6 }).ok).toBe(true);
    expect(exigencesWarmup({ abonnements: 5 }).ok).toBe(true);
  });

  it("ce qui manque : les follows", () => {
    const peu = exigencesWarmup({ abonnements: 3 });
    expect([peu.ok, peu.followsOk, peu.followsManquants]).toEqual([false, false, 2]);
    const rien = exigencesWarmup({ abonnements: null });
    expect([rien.ok, rien.follows, rien.followsManquants]).toEqual([false, null, 5]);
  });
});
