import { describe, expect, it } from "vitest";

import { localeDate } from "./localeDate";

describe("localeDate", () => {
  it("l'anglais passe au format britannique : le jour avant le mois", () => {
    expect(localeDate("en")).toBe("en-GB");
    expect(localeDate("en-US")).toBe("en-GB");
    expect(new Date("2026-10-22T12:00:00Z").toLocaleDateString(localeDate("en"), { timeZone: "UTC" })).toBe("22/10/2026");
  });

  it("le français ne change pas", () => {
    expect(localeDate("fr")).toBe("fr");
    expect(new Date("2026-10-22T12:00:00Z").toLocaleDateString(localeDate("fr"), { timeZone: "UTC" })).toBe("22/10/2026");
  });
});
