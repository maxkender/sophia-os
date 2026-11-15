import { describe, expect, it } from "vitest";

import { tauxIncompris } from "./incomprisApi";

describe("6/11 : textes automatiques incompris", () => {
  it("le taux d'incompris", () => {
    expect(tauxIncompris({ envoyes: 42, incompris: 5 })).toBe("12 %");
    expect(tauxIncompris({ envoyes: 0, incompris: 0 })).toBe("—");
  });
});
