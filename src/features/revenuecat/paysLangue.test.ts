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
    expect(langueDepuisPays("Denmark")).toBe("da");
    expect(langueDepuisPays("Norway")).toBe("no");
    expect(langueDepuisPays("Russia")).toBe("ru");
    expect(langueDepuisPays("Croatia")).toBe("hr");
    expect(langueDepuisPays("Slovenia")).toBe("sl");
    expect(langueDepuisPays("Slovakia")).toBe("sk");
    expect(langueDepuisPays("Serbia")).toBe("sr");
    expect(langueDepuisPays("Egypt")).toBe("ar");
    expect(langueDepuisPays("Saudi Arabia")).toBe("ar");
    expect(langueDepuisPays("United Arab Emirates")).toBe("ar");
    expect(langueDepuisPays("Israel")).toBe("he");
    expect(langueDepuisPays("Finland")).toBe("fi");
    expect(langueDepuisPays("Estonia")).toBe("et");
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
