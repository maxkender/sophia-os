import { describe, expect, it } from "vitest";

import { nomCompletDe, separerNomComplet } from "./nomComplet";

describe("nom complet d'un poster", () => {
  it("premier mot = prénom, le reste = nom", () => {
    expect(separerNomComplet("Ana Carolina  Silva Tavares ")).toEqual({ prenom: "Ana", nom: "Carolina Silva Tavares" });
    expect(separerNomComplet("Kinga")).toEqual({ prenom: "Kinga", nom: "" });
    expect(separerNomComplet("  ")).toEqual({ prenom: "", nom: "" });
  });

  it("anciens posters : prénom + nom réunis", () => {
    expect(nomCompletDe({ prenom: "Lucia", nom: "De Mojà" })).toBe("Lucia De Mojà");
    expect(nomCompletDe({ prenom: "Kinga", nom: null })).toBe("Kinga");
  });
});
