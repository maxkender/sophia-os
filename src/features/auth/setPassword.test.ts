import { describe, expect, it } from "vitest";

import { jetonDeRecherche } from "./setPassword";

describe("Set my password : le jeton du lien", () => {
  it("48 caractères hexadécimaux, sinon null", () => {
    const j = "a".repeat(48);
    expect(jetonDeRecherche(`?t=${j}`)).toBe(j);
    expect(jetonDeRecherche(`?t=${j.toUpperCase()}`)).toBe(j);
    expect(jetonDeRecherche("?t=abc")).toBeNull();
    expect(jetonDeRecherche("")).toBeNull();
  });
});
