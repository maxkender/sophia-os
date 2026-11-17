import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { SLUG_APPLICATION_VALIDE, slugApplicationDepuisNom } from "./apiMultiApp";

describe("slugApplicationDepuisNom", () => {
  it("minuscules, sans accents, tirets", () => {
    expect(slugApplicationDepuisNom("Turbo Résumé")).toBe("turbo-resume");
    expect(slugApplicationDepuisNom("micabo")).toBe("micabo");
  });

  it("commence toujours par une lettre et respecte la contrainte de la base", () => {
    expect(slugApplicationDepuisNom("2 Fast App !")).toBe("fast-app");
    for (const nom of ["Sophia", "UnSwipe", "Turbo Résumé", "2 Fast App !"]) {
      expect(slugApplicationDepuisNom(nom)).toMatch(SLUG_APPLICATION_VALIDE);
    }
  });

  it("un nom sans lettre ne donne pas d'identifiant valide", () => {
    expect(slugApplicationDepuisNom("123")).not.toMatch(SLUG_APPLICATION_VALIDE);
  });
});
