import { describe, expect, it } from "vitest";

import {
  captionDepuisLangue,
  datesFenetreParis,
  estLanguePapierPrete,
  hashtagsDepuisLangue,
  masterClipsComplets,
  mastersLibresPourLangue,
  pairesAssignationPapier,
  piocherMasterInutilise,
  statutMasterDepuisAssets,
} from "./papierAssignation";

const fr = { id: "lang-fr", langue: "fr", statut: "ready", video_url: "https://v/fr.mp4" };
const de = { id: "lang-de", langue: "de", statut: "ready", video_url: "https://v/de.mp4" };
const enQueued = { id: "lang-en", langue: "en", statut: "voice", video_url: null };

describe("estLanguePapierPrete", () => {
  it("exige ready + url", () => {
    expect(estLanguePapierPrete(fr)).toBe(true);
    expect(estLanguePapierPrete({ ...fr, video_url: null })).toBe(false);
    expect(estLanguePapierPrete(enQueued)).toBe(false);
  });
});

describe("caption / hashtags", () => {
  it("colle hook et CTA", () => {
    expect(captionDepuisLangue({ hook: "Wow", cta: "Télécharge Sophia" })).toBe(
      "Wow\n\nTélécharge Sophia",
    );
    expect(captionDepuisLangue({ hook: "  ", cta: "Go" })).toBe("Go");
    expect(captionDepuisLangue({ hook: "Hook", cta: "Ouvre Sofia" })).toBe("Hook\n\nOuvre Sophia");
  });

  it("normalise les hashtags", () => {
    expect(hashtagsDepuisLangue(["learn", "#fyp"])).toBe("#learn #fyp");
    expect(hashtagsDepuisLangue("#a #b")).toBe("#a #b");
  });
});

describe("pairesAssignationPapier", () => {
  it("assigne chaque CM actif à sa langue prête", () => {
    const paires = pairesAssignationPapier(
      [
        { id: "cm-fr", langue: "fr", type_compte: "cm", is_active: true },
        { id: "cm-de", langue: "de", type_compte: "cm", is_active: true },
        { id: "cm-fr-2", langue: "fr", type_compte: "cm", is_active: true },
      ],
      [fr, de],
    );
    expect(paires).toEqual([
      { compteId: "cm-fr", langueId: "lang-fr", langue: "fr" },
      { compteId: "cm-de", langueId: "lang-de", langue: "de" },
      { compteId: "cm-fr-2", langueId: "lang-fr", langue: "fr" },
    ]);
  });

  it("en test, inclut un CM inactif", () => {
    const paires = pairesAssignationPapier(
      [{ id: "off", langue: "de", type_compte: "cm", is_active: false }],
      [de],
      { inclureInactifs: true },
    );
    expect(paires).toEqual([{ compteId: "off", langueId: "lang-de", langue: "de" }]);
  });

  it("ignore perso, inactifs, et langues pas prêtes", () => {
    const paires = pairesAssignationPapier(
      [
        { id: "perso", langue: "fr", type_compte: "perso", is_active: true },
        { id: "off", langue: "de", type_compte: "cm", is_active: false },
        { id: "cm-en", langue: "en", type_compte: "cm", is_active: true },
        { id: "cm-fr", langue: "fr", type_compte: "cm", is_active: true },
      ],
      [fr, de, enQueued],
    );
    expect(paires).toEqual([{ compteId: "cm-fr", langueId: "lang-fr", langue: "fr" }]);
  });
});

describe("master clips → ready", () => {
  it("clips complets sans vidéo FR restent en clips ; video_url = bibliothèque", () => {
    expect(masterClipsComplets([{ clip_url: "a" }, { clip_url: "b" }])).toBe(true);
    expect(masterClipsComplets([{ clip_url: "a" }, { clip_url: null }])).toBe(false);
    expect(masterClipsComplets([])).toBe(false);
    const scenes = [{ image_url: "i", clip_url: "c" }];
    expect(statutMasterDepuisAssets({ topic: "carottes", script: { title: "x" } }, scenes)).toBe(
      "clips",
    );
    expect(
      statutMasterDepuisAssets(
        { topic: "carottes", script: { title: "x" }, video_url: "https://v/fr.mp4" },
        scenes,
      ),
    ).toBe("ready");
    expect(
      statutMasterDepuisAssets({ topic: "carottes", script: { title: "x" } }, [
        { image_url: "i", clip_url: null },
      ]),
    ).toBe("clips");
  });
});

describe("piocherMasterInutilise", () => {
  const a = { id: "m-a" };
  const b = { id: "m-b" };
  const c = { id: "m-c" };

  it("tire au hasard parmi les masters encore libres", () => {
    expect(piocherMasterInutilise([a, b, c], [], "de", () => 0)).toBe("m-a");
    expect(piocherMasterInutilise([a, b, c], [], "de", () => 0.99)).toBe("m-c");
    expect(
      piocherMasterInutilise(
        [a, b, c],
        [{ master_id: "m-a", langue: "de", est_test: false }],
        "de",
        () => 0,
      ),
    ).toBe("m-b");
  });

  it("un usage FR n'empêche pas de piocher le même master en DE", () => {
    expect(
      piocherMasterInutilise([a], [{ master_id: "m-a", langue: "fr", est_test: false }], "de"),
    ).toBe("m-a");
  });

  it("ignore les assignations test", () => {
    expect(
      piocherMasterInutilise([a], [{ master_id: "m-a", langue: "de", est_test: true }], "de"),
    ).toBe("m-a");
  });

  it("null si plus rien de libre dans cette langue", () => {
    expect(
      piocherMasterInutilise([a], [{ master_id: "m-a", langue: "de", est_test: false }], "de"),
    ).toBeNull();
    expect(
      mastersLibresPourLangue([a], [{ master_id: "m-a", langue: "de", est_test: false }], "de"),
    ).toEqual([]);
  });

  it("deux CM de la même langue piochent deux masters distincts", () => {
    const pris: Array<{ master_id: string; langue: string; est_test: boolean }> = [];
    const premier = piocherMasterInutilise([a, b], pris, "en", () => 0);
    expect(premier).toBe("m-a");
    pris.push({ master_id: premier!, langue: "en", est_test: false });
    const second = piocherMasterInutilise([a, b], pris, "en", () => 0);
    expect(second).toBe("m-b");
  });
});

describe("datesFenetreParis", () => {
  it("remonte N jours inclus aujourd'hui", () => {
    expect(datesFenetreParis("2026-08-20", 2)).toEqual(["2026-08-20", "2026-08-19"]);
    expect(datesFenetreParis("2026-03-01", 1)).toEqual(["2026-03-01"]);
  });
});
