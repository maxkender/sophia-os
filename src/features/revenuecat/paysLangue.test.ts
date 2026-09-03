import { describe, expect, it } from "vitest";

import { langueDepuisPays } from "./paysLangue";

describe("langueDepuisPays", () => {
  it("rattache les pays RC aux langues OS", () => {
    expect(langueDepuisPays("France")).toBe("fr");
    expect(langueDepuisPays("Türkiye")).toBe("tr");
    expect(langueDepuisPays("Turkey")).toBe("tr");
    expect(langueDepuisPays("United Kingdom")).toBe("en");
    expect(langueDepuisPays("United States")).toBe("en");
    expect(langueDepuisPays("Poland")).toBe("pl");
    expect(langueDepuisPays("Germany")).toBe("de");
    expect(langueDepuisPays("Brazil")).toBe("pt");
  });

  it("accepte déjà un code langue", () => {
    expect(langueDepuisPays("fr")).toBe("fr");
    expect(langueDepuisPays("TR")).toBe("tr");
  });

  it("ignore Other / Total / inconnu", () => {
    expect(langueDepuisPays("Other")).toBeNull();
    expect(langueDepuisPays("Total")).toBeNull();
    expect(langueDepuisPays("Japan")).toBeNull();
  });
});
