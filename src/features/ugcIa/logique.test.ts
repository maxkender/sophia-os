import { describe, expect, it } from "vitest";

import { arrondiDixieme, erreurPassage, lireSecondes, passageInitial, peutCouper, peutGenerer } from "./logique";

describe("UGC IA, logique", () => {
  it("lit des secondes avec virgule ou point", () => {
    expect(lireSecondes("1,5")).toBe(1.5);
    expect(lireSecondes(" 7 ")).toBe(7);
    expect(lireSecondes("")).toBeNull();
    expect(lireSecondes("abc")).toBeNull();
  });

  it("vérifie le passage comme la fonction ugc-ia (pas de minimum, 30 s au plus, dans la vidéo)", () => {
    expect(erreurPassage(1, 7, 20)).toBeNull();
    expect(erreurPassage(0, 10.1, 10)).toBeNull();
    expect(erreurPassage(null, 7, 20)).toBe("manquant");
    expect(erreurPassage(-1, 7, 20)).toBe("negatif");
    expect(erreurPassage(2, 3.5, 20)).toBeNull();
    expect(erreurPassage(3, 3, 20)).toBe("ordre");
    expect(erreurPassage(4, 2, 20)).toBe("ordre");
    expect(erreurPassage(0, 31, 40)).toBe("tropLong");
    expect(erreurPassage(5, 12, 10)).toBe("depasse");
  });

  it("propose le passage déjà coupé, sinon les 6 premières secondes", () => {
    expect(passageInitial({ debut_s: 2, fin_s: 8.5, source_duree_s: 30 })).toEqual({ debut: "2", fin: "8.5" });
    expect(passageInitial({ debut_s: null, fin_s: null, source_duree_s: 30 })).toEqual({ debut: "0", fin: "6" });
    expect(passageInitial({ debut_s: null, fin_s: null, source_duree_s: 4.84 })).toEqual({ debut: "0", fin: "4.8" });
    expect(passageInitial({ debut_s: null, fin_s: null, source_duree_s: null })).toEqual({ debut: "0", fin: "6" });
  });

  it("arrondit le temps de lecture au dixième", () => {
    expect(arrondiDixieme(3.14159)).toBe("3.1");
    expect(arrondiDixieme(-1)).toBe("0");
  });

  it("ne recoupe ni ne relance une vidéo en cours ou prête", () => {
    expect(peutCouper("importee")).toBe(true);
    expect(peutCouper("echec")).toBe(true);
    expect(peutCouper("en_cours")).toBe(false);
    expect(peutCouper("prete")).toBe(false);
    expect(peutGenerer({ statut: "coupee", coupe_url: "https://x/r.mp4" })).toBe(true);
    expect(peutGenerer({ statut: "echec", coupe_url: "https://x/r.mp4" })).toBe(true);
    expect(peutGenerer({ statut: "echec", coupe_url: null })).toBe(false);
    expect(peutGenerer({ statut: "importee", coupe_url: null })).toBe(false);
    expect(peutGenerer({ statut: "en_cours", coupe_url: "https://x/r.mp4" })).toBe(false);
  });
});
