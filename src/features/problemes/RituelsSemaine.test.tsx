import { describe, expect, it } from "vitest";

import { jourParis } from "./RituelsSemaine";

describe("RituelsSemaine (4/11)", () => {
  it("le jour à Paris : jeudi 4, samedi 6, dimanche 7", () => {
    expect(jourParis(new Date("2026-11-05T12:00:00Z"))).toBe(4);
    expect(jourParis(new Date("2026-11-07T12:00:00Z"))).toBe(6);
    expect(jourParis(new Date("2026-11-08T23:30:00Z"))).toBe(1);
    expect(jourParis(new Date("2026-11-08T12:00:00Z"))).toBe(7);
  });
});
