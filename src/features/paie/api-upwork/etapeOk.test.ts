import { describe, expect, it } from "vitest";

import { etapeOk } from "./api";

describe("0467 : une étape n'est « OK » que si la relecture d'Upwork la confirme", () => {
  it("financer : Active relu → OK ; NotFunded relu → ÉCHEC même sans erreur", () => {
    expect(etapeOk({ etape: "financer", erreur: null, etat: "Active" })).toBe(true);
    expect(etapeOk({ etape: "financer", erreur: null, etat: "NotFunded" })).toBe(false);
    expect(etapeOk({ etape: "financer", erreur: "Upwork : NotFunded (Needs funds)", etat: "NotFunded" })).toBe(false);
  });
  it("une étape sans état relu (approuver, créer) : OK sans erreur", () => {
    expect(etapeOk({ etape: "approuver", erreur: null })).toBe(true);
    expect(etapeOk({ etape: "creer", erreur: "HTTP 403" })).toBe(false);
  });
});
