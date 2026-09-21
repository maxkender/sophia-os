import { describe, expect, it } from "vitest";

import {
  RESERVE_CRITIQUE_JOURS,
  RESERVE_TENDUE_JOURS,
  formaterReserve,
  niveauReserve,
} from "./labelReserve";

describe("niveau de réserve", () => {
  it("bascule en critique SOUS le seuil, pas dessus", () => {
    // Le seuil lui-même n'est pas critique : à 7,0 jours pile il reste une
    // semaine, c'est-à-dire le temps d'un lot d'import.
    expect(niveauReserve(RESERVE_CRITIQUE_JOURS - 0.1)).toBe("critique");
    expect(niveauReserve(RESERVE_CRITIQUE_JOURS)).toBe("tendu");
    expect(niveauReserve(RESERVE_TENDUE_JOURS - 0.1)).toBe("tendu");
    expect(niveauReserve(RESERVE_TENDUE_JOURS)).toBe("confortable");
  });

  it("classe les chiffres réels du 21/09", () => {
    // smart_girl : 522 passages pour 97 de demande quotidienne.
    expect(niveauReserve(5.4)).toBe("critique");
    expect(niveauReserve(7.3)).toBe("tendu");
    expect(niveauReserve(10.6)).toBe("tendu");
    expect(niveauReserve(39.3)).toBe("confortable");
  });

  it("une réserve à zéro est critique, pas inconnue", () => {
    // Stock vide ET comptes qui tirent dessus : c'est le pire cas, il ne doit
    // pas se confondre avec « pas de compte, donc pas de mesure ».
    expect(niveauReserve(0)).toBe("critique");
  });

  it("l'absence de mesure n'est jamais confondue avec une réserve infinie", () => {
    // Un label sans compte ne consomme rien : la vue rend NULL plutôt qu'un
    // grand nombre, et l'affichage doit rester muet au lieu de rassurer.
    expect(niveauReserve(null)).toBe("inconnu");
    expect(niveauReserve(undefined)).toBe("inconnu");
    expect(niveauReserve(Number.NaN)).toBe("inconnu");
    expect(niveauReserve(Number.POSITIVE_INFINITY)).toBe("inconnu");
    expect(formaterReserve(null, "fr")).toBeNull();
  });

  it("garde la décimale tant qu'elle change la décision", () => {
    // 2 j et 2,9 j ne déclenchent pas le même réflexe ; 39 j et 39,3 j si.
    expect(formaterReserve(2.9, "fr")).toBe("2,9");
    expect(formaterReserve(5.44, "fr")).toBe("5,4");
    expect(formaterReserve(39.3, "fr")).toBe("39");
    expect(formaterReserve(2.9, "en")).toBe("2.9");
  });
});
