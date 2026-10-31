import { describe, expect, it } from "vitest";

import { posteurExistant } from "./posteurExistant";

describe("31/10 : un seul profil par contrat", () => {
  it("lit le posteur qui a déjà le contrat", () => {
    expect(posteurExistant("POSTER_EXISTANT|abc-1|Karolina J|karolinaj@sophia.com")).toEqual({ id: "abc-1", nom: "Karolina J", email: "karolinaj@sophia.com" });
    expect(posteurExistant("POSTER_EN_COURS")).toBeNull();
    expect(posteurExistant("NO_LABELS")).toBeNull();
  });
});
