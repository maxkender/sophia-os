import { describe, expect, it } from "vitest";

import {
  arrondiDixieme,
  basculer,
  erreurPassage,
  estMontee,
  lireSecondes,
  passageInitial,
  passageTelephoneInitial,
  personasOccupes,
  peutCouper,
  PERSONAS_MAX_PAR_LANCEMENT,
  TELEPHONE_MAX_S,
} from "./logique";

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
    expect(erreurPassage(4, 64, 90, TELEPHONE_MAX_S)).toBeNull();
    expect(erreurPassage(4, 64, 90)).toBe("tropLong");
  });

  it("propose la partie téléphone après la réaction, jusqu'à la fin de la vidéo", () => {
    const base = { telephone_debut_s: null, telephone_fin_s: null };
    expect(passageTelephoneInitial({ ...base, fin_s: 4.1, source_duree_s: 14 })).toEqual({ debut: "4.1", fin: "14" });
    expect(passageTelephoneInitial({ ...base, fin_s: null, source_duree_s: 30 })).toEqual({ debut: "6", fin: "30" });
    expect(passageTelephoneInitial({ ...base, fin_s: 4, source_duree_s: null })).toEqual({ debut: "4", fin: "14" });
    expect(passageTelephoneInitial({ fin_s: 4, source_duree_s: 14, telephone_debut_s: 5, telephone_fin_s: 12.5 })).toEqual({ debut: "5", fin: "12.5" });
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

  it("ne recoupe pas un passage en cours de génération, et ne recoche pas un persona occupé", () => {
    expect(peutCouper([])).toBe(true);
    expect(peutCouper([{ statut: "prete" }, { statut: "echec" }])).toBe(true);
    expect(peutCouper([{ statut: "prete" }, { statut: "en_cours" }])).toBe(false);
    expect(
      personasOccupes([
        { statut: "en_cours", persona_id: "a" },
        { statut: "prete", persona_id: "b" },
        { statut: "echec", persona_id: "a" },
      ]),
    ).toEqual(new Set(["a"]));
  });

  it("coche et décoche, sans dépasser le maximum par lancement", () => {
    let coches = basculer(new Set(), "a");
    expect(coches).toEqual(new Set(["a"]));
    coches = basculer(coches, "a");
    expect(coches.size).toBe(0);
    const pleins = new Set(Array.from({ length: PERSONAS_MAX_PAR_LANCEMENT }, (_, i) => `p${i}`));
    expect(basculer(pleins, "de-trop").has("de-trop")).toBe(false);
  });
  it("reconnaît une vidéo montée : sa vidéo n'est plus l'original", () => {
    expect(estMontee({ video_url: "a.mp4", video_brute_url: "a.mp4" })).toBe(false);
    expect(estMontee({ video_url: "a-monte.mp4", video_brute_url: "a.mp4" })).toBe(true);
    expect(estMontee({ video_url: null, video_brute_url: null })).toBe(false);
  });
});
