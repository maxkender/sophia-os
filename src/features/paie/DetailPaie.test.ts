import { describe, expect, it } from "vitest";

import { aUnAjustement, formuleDetail, type LigneDetail } from "./DetailPaie";

const base: LigneDetail = {
  poster_id: "p", nom: "Ana", plateforme: "upwork", comptes: 1, tarif: 14, base: 14, deuxieme: 0, retenue: 0,
  bonus: [], bonus_total: 0, total: 14, au_dessus_plafond: false,
};

describe("détail de la paie", () => {
  it("base + 2e compte + bonus = total", () => {
    expect(formuleDetail({ ...base, comptes: 2, deuxieme: 14, bonus: [{ type: "questionnaire", montant: 5, statut: "a_valider" }], bonus_total: 5, total: 33 }))
      .toBe("14 $ + 14 $ (2e compte) + 5 $ (Bonus questionnaire) = 33 $");
    expect(formuleDetail({ ...base, retenue: 2, total: 12 })).toBe("14 $ − 2 $ (retenue) = 12 $");
  });
  it("seulement les posteurs avec un ajustement par défaut", () => {
    expect(aUnAjustement(base)).toBe(false);
    expect(aUnAjustement({ ...base, deuxieme: 14 })).toBe(true);
  });
});
