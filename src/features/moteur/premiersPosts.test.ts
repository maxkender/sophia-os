import { describe, expect, it } from "vitest";

import { calendrierWarmup, lundiApres, premierJourPosts } from "./premiersPosts";

describe("premiers posts après le warm-up", () => {
  it("le lundi qui suit le clic, heure de Paris", () => {
    // Dimanche 23:59 à Paris : posts dès le lendemain.
    expect(lundiApres(new Date("2026-10-18T21:59:00Z"))).toBe("2026-10-19");
    // Lundi 00:01 à Paris : le lundi d'après.
    expect(lundiApres(new Date("2026-10-18T22:01:00Z"))).toBe("2026-10-26");
    expect(lundiApres(new Date("2026-10-21T10:00:00Z"))).toBe("2026-10-26");
    // Heure d'hiver (UTC+1) : dimanche 23:30 à Paris.
    expect(lundiApres(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-26");
  });

  it("fin pile à minuit : ce jour-là ; sinon le lendemain", () => {
    expect(premierJourPosts("2026-10-25T23:00:00Z")).toBe("2026-10-26");
    expect(premierJourPosts("2026-10-19T08:44:41Z")).toBe("2026-10-20");
  });

  it("cases du calendrier : du clic à la veille, puis FIRST POSTS", () => {
    const cal = calendrierWarmup({
      warmupStartedAt: "2026-10-21T10:00:00Z",
      warmupEndsAt: "2026-10-25T23:00:00Z",
      maintenant: new Date("2026-10-22T10:00:00Z"),
    });
    expect(cal?.premiersPosts).toBe("2026-10-26");
    expect([...(cal?.joursWarmup ?? [])]).toEqual([
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
  });

  it("rien avant le clic, ni après le jour des premiers posts", () => {
    expect(calendrierWarmup({ warmupStartedAt: null, warmupEndsAt: null })).toBeNull();
    expect(
      calendrierWarmup({
        warmupStartedAt: "2026-10-21T10:00:00Z",
        warmupEndsAt: "2026-10-25T23:00:00Z",
        maintenant: new Date("2026-10-27T10:00:00Z"),
      }),
    ).toBeNull();
  });
});
