import { describe, expect, it } from "vitest";

import type { ValeurLangue } from "./api";
import { grilleValeurs } from "./valeurs";

const v = (contenu_id: string, langue: string, valeur: number, n_post = 0, n_accroche = 0): ValeurLangue => ({
  contenu_id,
  langue,
  forme: 5,
  n_post,
  n_accroche,
  facteur_age: 1,
  valeur,
  calcule_le: "2026-10-30T03:15:00Z",
});

describe("BLEO, valeur par langue", () => {
  it("l'original gagne dans une langue neuve, la déclinaison là où l'original est usé", () => {
    // Original de forme 5 posté 3 fois en français ; déclinaison neuve de forme 2,7.
    const g = grilleValeurs([
      v("original", "fr", 1.08, 3, 0),
      v("original", "de", 5, 0, 0),
      v("declinaison", "fr", 1.14, 0, 3),
      v("declinaison", "de", 2.7, 0, 0),
    ]);
    expect(g.langues).toEqual(["de", "fr"]);
    expect(g.meilleur.get("de")).toBe("original");
    expect(g.meilleur.get("fr")).toBe("declinaison");
    expect(g.cellules.get("original")?.get("fr")?.n_post).toBe(3);
  });

  it("ignore les couples à 0 (plus candidats)", () => {
    const g = grilleValeurs([v("a", "fr", 0), v("a", "en", 1.2)]);
    expect(g.langues).toEqual(["en"]);
    expect(g.cellules.get("a")?.has("fr")).toBe(false);
  });
});
