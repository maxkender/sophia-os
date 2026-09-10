import { describe, expect, it } from "vitest";

import {
  comptePerso,
  comptePrincipal,
  comptesCm,
  destinationsDeplacementCompte,
  estCompteCm,
  languesCmPrises,
  languesDisponiblesPourCm,
  languesPourNouveauCompte,
  normaliserTypeCompte,
  resoudrePremierCompte,
} from "./comptesCm";

const persoFr = { id: "a", type_compte: "perso" as const, langue: "fr" };
const cmDe = { id: "b", type_compte: "cm" as const, langue: "de" };
const cmEs = { id: "c", type_compte: "cm" as const, langue: "es" };

describe("type_compte", () => {
  it("normalise toute valeur inconnue en perso", () => {
    expect(normaliserTypeCompte(undefined)).toBe("perso");
    expect(normaliserTypeCompte("cm")).toBe("cm");
    expect(normaliserTypeCompte("autre")).toBe("perso");
  });

  it("détecte un compte CM", () => {
    expect(estCompteCm(cmDe)).toBe(true);
    expect(estCompteCm(persoFr)).toBe(false);
    expect(estCompteCm({})).toBe(false);
  });

  it("à la création, un poster n'implique pas un perso", () => {
    expect(resoudrePremierCompte(undefined, "fr")).toBe("perso");
    expect(resoudrePremierCompte("perso", "fr")).toBe("perso");
    expect(resoudrePremierCompte("cm", "de")).toBe("cm");
    expect(resoudrePremierCompte("aucun", "fr")).toBe("aucun");
    expect(resoudrePremierCompte("none", "en")).toBe("aucun");
    expect(resoudrePremierCompte("cm", "")).toBe("aucun");
    expect(resoudrePremierCompte(undefined, "")).toBe("aucun");
  });
});

describe("sélection de comptes", () => {
  it("sépare perso et CM, et choisit le perso comme principal", () => {
    const tous = [cmDe, persoFr, cmEs];
    expect(comptePerso(tous)?.id).toBe("a");
    expect(comptesCm(tous).map((c) => c.id)).toEqual(["b", "c"]);
    expect(comptePrincipal(tous)?.id).toBe("a");
  });

  it("si seulement des CM, le principal est le premier", () => {
    expect(comptePrincipal([cmDe, cmEs])?.id).toBe("b");
    expect(comptePerso([cmDe])).toBeUndefined();
  });
});

describe("langues CM", () => {
  it("liste les langues déjà prises et celles encore libres", () => {
    expect(languesCmPrises([persoFr, cmDe, cmEs])).toEqual(["de", "es"]);
    expect(languesDisponiblesPourCm(["fr", "de", "it"], ["de"])).toEqual(["fr", "it"]);
  });

  it("à l'ajout, un perso reste libre dans une langue déjà CM", () => {
    expect(languesPourNouveauCompte("perso", ["fr", "de"], ["de"])).toEqual(["fr", "de"]);
    expect(languesPourNouveauCompte("cm", ["fr", "de"], ["de"])).toEqual(["fr"]);
  });
});

describe("déplacement de compte", () => {
  const alice = {
    id: "alice",
    role: "poster" as const,
    comptes: [{ type_compte: "perso" as const, langue: "fr" }],
  };
  const bob = {
    id: "bob",
    role: "poster" as const,
    comptes: [
      { type_compte: "perso" as const, langue: "fr" },
      { type_compte: "cm" as const, langue: "de" },
    ],
  };
  const charlie = {
    id: "charlie",
    role: "poster" as const,
    comptes: [{ type_compte: "perso" as const, langue: "es" }],
  };
  const hm = { id: "hm", role: "hiring_manager" as const, comptes: [] };

  it("propose les autres créateurs, y compris ceux qui ont déjà un perso", () => {
    const dest = destinationsDeplacementCompte(persoFr, "alice", [alice, bob, charlie, hm]);
    expect(dest.map((p) => p.id)).toEqual(["bob", "charlie"]);
  });

  it("refuse un CM vers un créateur qui a déjà un CM dans la même langue", () => {
    const dest = destinationsDeplacementCompte(cmDe, "charlie", [alice, bob, charlie]);
    expect(dest.map((p) => p.id)).toEqual(["alice"]);
  });

  it("autorise un CM vers un créateur qui a déjà un perso (2e compte)", () => {
    const dest = destinationsDeplacementCompte(cmEs, "bob", [alice, bob, charlie]);
    expect(dest.map((p) => p.id)).toEqual(["alice", "charlie"]);
  });

  it("autorise un perso vers un créateur sans aucun compte", () => {
    const vide = { id: "dana", role: "poster" as const, comptes: [] };
    const dest = destinationsDeplacementCompte(persoFr, "alice", [alice, vide]);
    expect(dest.map((p) => p.id)).toEqual(["dana"]);
  });
});
