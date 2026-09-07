import { describe, expect, it } from "vitest";

import { bornerCibleCreateurs } from "./constantes";

describe("bornerCibleCreateurs", () => {
  it("garde 10, borne 0–30", () => {
    expect(bornerCibleCreateurs(10)).toBe(10);
    expect(bornerCibleCreateurs(0)).toBe(0);
    expect(bornerCibleCreateurs(30)).toBe(30);
    expect(bornerCibleCreateurs(-4)).toBe(0);
    expect(bornerCibleCreateurs(99)).toBe(30);
    expect(bornerCibleCreateurs(Number.NaN)).toBe(10);
  });
});
