import { describe, expect, it } from "vitest";

import {
  POSTER_GUIDE_ZONE_CUTOFF,
  garderDocumentsPoster,
  posterGuideCle,
  resoudreZonePoster,
} from "./posterGuide";

const APRES = "2026-09-11T10:00:00.000Z";
const AVANT = "2026-09-11T08:01:19.773Z";

function cle(over: Partial<Parameters<typeof posterGuideCle>[0]> = {}) {
  return posterGuideCle({
    profileCreatedAt: APRES,
    nationalite: null,
    langues: null,
    compteLangues: null,
    ...over,
  });
}

describe("posterGuideCle — posters déjà créés", () => {
  it("garde l’ancien guide même pour un compte roumain", () => {
    expect(
      cle({
        profileCreatedAt: AVANT,
        compteLangues: ["ro"],
        langues: ["fr", "ro"],
      }),
    ).toBe("guide_poster");
  });

  it("coupe pile après le dernier poster existant", () => {
    expect(Date.parse(AVANT)).toBeLessThanOrEqual(Date.parse(POSTER_GUIDE_ZONE_CUTOFF));
    expect(Date.parse(APRES)).toBeGreaterThan(Date.parse(POSTER_GUIDE_ZONE_CUTOFF));
  });

  it("sans date de création, ne bascule pas sur une zone", () => {
    expect(cle({ profileCreatedAt: null, compteLangues: ["tr"] })).toBe("guide_poster");
  });
});

describe("posterGuideCle — nouveaux posters, codes OS", () => {
  it("Zone A via langue du compte", () => {
    for (const l of ["fr", "nl", "de", "en", "sv"]) {
      expect(cle({ compteLangues: [l] })).toBe("guide_poster_zone_a");
    }
  });

  it("Zone B via langue du compte", () => {
    for (const l of ["es", "it", "pt", "el", "cs", "hu", "pl"]) {
      expect(cle({ compteLangues: [l] })).toBe("guide_poster_zone_b");
    }
  });

  it("Zone C via langue du compte", () => {
    for (const l of ["ro", "tr", "bg"]) {
      expect(cle({ compteLangues: [l] })).toBe("guide_poster_zone_c");
    }
  });
});

describe("resoudreZonePoster — tous les pays du PDF", () => {
  it("Zone A pays", () => {
    const pays = [
      "France",
      "Netherlands",
      "Germany",
      "Belgium",
      "Austria",
      "Ireland",
      "United Kingdom",
      "UK",
      "Denmark",
      "Norway",
      "Sweden",
      "Finland",
      "Iceland",
      "Luxembourg",
      "Switzerland",
      "United States",
      "USA",
      "Canada",
      "Australia",
      "New Zealand",
      "Japan",
      "Singapore",
    ];
    for (const p of pays) {
      expect(resoudreZonePoster(p), p).toBe("a");
    }
  });

  it("Zone B pays", () => {
    const pays = [
      "Spain",
      "Italy",
      "Portugal",
      "Greece",
      "Poland",
      "Czech Republic",
      "Slovakia",
      "Hungary",
      "Slovenia",
      "Croatia",
      "Estonia",
      "Latvia",
      "Lithuania",
      "Israel",
      "South Korea",
      "United Arab Emirates",
      "UAE",
      "Chile",
      "Uruguay",
    ];
    for (const p of pays) {
      expect(resoudreZonePoster(p), p).toBe("b");
    }
  });

  it("Zone C pays", () => {
    const pays = [
      "Romania",
      "Bulgaria",
      "Serbia",
      "Ukraine",
      "Georgia",
      "Armenia",
      "Turkey",
      "Türkiye",
      "Mexico",
      "Colombia",
      "Brazil",
      "Argentina",
      "South Africa",
      "Morocco",
      "Malaysia",
      "Thailand",
      "Vietnam",
      "Philippines",
      "India",
      "Indonesia",
    ];
    for (const p of pays) {
      expect(resoudreZonePoster(p), p).toBe("c");
    }
  });
});

describe("cas limites", () => {
  it("ne prend pas le fr par défaut du profil si le compte publie ailleurs", () => {
    expect(resoudreZonePoster("fr", ["ro"], ["fr", "ro"])).toBe("c");
    expect(resoudreZonePoster(null, ["de"], ["fr", "de"])).toBe("a");
    expect(cle({ nationalite: "fr", compteLangues: ["tr"], langues: ["fr", "tr"] })).toBe(
      "guide_poster_zone_c",
    );
  });

  it("un vrai Français (compte fr) reste Zone A", () => {
    expect(resoudreZonePoster("fr", ["fr"], ["fr"])).toBe("a");
  });

  it("Brésil gagne sur la langue pt de l’OS", () => {
    expect(resoudreZonePoster("Brazil", ["pt"], ["pt"])).toBe("c");
    expect(resoudreZonePoster(null, ["pt"], ["pt"])).toBe("b");
  });

  it("UK ≠ Ukraine, ar ISO = Argentine, arabe = Zone B", () => {
    expect(resoudreZonePoster("UK")).toBe("a");
    expect(resoudreZonePoster("Ukraine")).toBe("c");
    expect(resoudreZonePoster("ua")).toBe("c");
    expect(resoudreZonePoster("ar")).toBe("c");
    expect(resoudreZonePoster("Argentina")).toBe("c");
    expect(resoudreZonePoster("arabic")).toBe("b");
    expect(resoudreZonePoster("UAE")).toBe("b");
  });

  it("langues du profil en dernier, la dernière ajoutée d’abord", () => {
    expect(resoudreZonePoster(null, null, ["fr", "pl"])).toBe("b");
    expect(resoudreZonePoster(null, null, ["fr", "nl"])).toBe("a");
  });

  it("inconnu → pas de zone (l’ancien guide, on ne devine pas un tarif)", () => {
    expect(resoudreZonePoster("xx", [], [])).toBeNull();
    expect(cle({ compteLangues: ["xx"] })).toBe("guide_poster");
  });
});

describe("garderDocumentsPoster", () => {
  const docs = [
    { cle: "guide_poster" },
    { cle: "guide_poster_zone_a" },
    { cle: "guide_poster_zone_b" },
    { cle: "faq_poster" },
  ];

  it("un ancien poster ne voit que l’ancien guide + FAQ", () => {
    expect(garderDocumentsPoster(docs, "guide_poster").map((d) => d.cle)).toEqual([
      "guide_poster",
      "faq_poster",
    ]);
  });

  it("un nouveau poster Zone B ne voit pas les autres tarifs", () => {
    expect(garderDocumentsPoster(docs, "guide_poster_zone_b").map((d) => d.cle)).toEqual([
      "guide_poster_zone_b",
      "faq_poster",
    ]);
  });
});
