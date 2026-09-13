import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { LANGUES_CIBLES, langueInitiale } from "./langues";
import {
  bioEtudes,
  capitaliserPrenom,
  genererIdentiteMicabo,
  motsEtudes,
  prenomsPour,
  sansAccentsIdentite,
} from "./identiteApplication";
import {
  avecFileLabelsApplication,
  clePromptPertinence,
  clePromptPlacement,
  estSlugApplicationValide,
  estSlugMicabo,
  fileLabelsDeLApplication,
  normaliserSlugApplication,
  posterMatcheApplication,
  resoudreApplicationImport,
} from "./applications";

describe("langue initiale", () => {
  it("prend fr dès le chargement, sans aller-retour sur une autre langue", () => {
    expect(langueInitiale(["fr", "en", "de"], "")).toBe("fr");
    expect(langueInitiale(["en", "de"], "")).toBe("en");
    expect(langueInitiale(["fr", "en"], "en")).toBe("en");
    expect(langueInitiale([], "")).toBe("");
  });
});

describe("identite micabo", () => {
  it("forme le @ prenom.mot + 3 chiffres, le nom = prénom, bio = study tips", () => {
    const id = genererIdentiteMicabo({
      langue: "fr",
      genre: "femme",
      rng: () => 0.1,
    });
    expect(id.handle).toMatch(/^[a-z]+\.[a-z]+\d{3}$/);
    expect(id.nom).toBe(capitaliserPrenom(id.handle.split(".")[0] ?? ""));
    expect(id.bio).toBe("conseils d'études");
    expect(motsEtudes("fr").some((m) => id.handle.includes(`.${m}`))).toBe(true);
    expect(prenomsPour("fr", "femme")).toContain(sansAccentsIdentite(id.nom));
  });

  it("traduit la bio selon la langue", () => {
    expect(bioEtudes("en")).toBe("study tips");
    expect(bioEtudes("de")).toBe("lerntipps");
    expect(bioEtudes("hr")).toBe("savjeti za učenje");
    expect(bioEtudes("xx")).toBe("study tips");
  });

  it("a des prénoms et un @ ASCII pour chaque langue cible", () => {
    for (const code of LANGUES_CIBLES) {
      expect(prenomsPour(code, "homme").length).toBeGreaterThan(5);
      expect(prenomsPour(code, "femme").length).toBeGreaterThan(5);
      expect(motsEtudes(code).length).toBeGreaterThan(3);
      if (code !== "en") {
        expect(motsEtudes(code), code).not.toEqual(motsEtudes("en"));
      }
      for (const genre of ["homme", "femme"] as const) {
        const id = genererIdentiteMicabo({ langue: code, genre, rng: () => 0.42 });
        expect(id.handle, code).toMatch(/^[a-z]+\.[a-z]+\d{3}$/);
      }
    }
    const hr = genererIdentiteMicabo({ langue: "hr", genre: "femme", rng: () => 0.2 });
    expect(prenomsPour("hr", "femme")).toContain(sansAccentsIdentite(hr.nom));
    expect(hr.handle).not.toMatch(/emily|curious|olivia/);
  });

  it("évite un @ déjà pris (racine sans chiffres)", () => {
    const id = genererIdentiteMicabo({
      langue: "en",
      genre: "homme",
      handlesPris: prenomsPour("en", "homme").flatMap((p) =>
        motsEtudes("en").map((m) => `${p}.${m}111`),
      ),
      rng: () => 0.2,
    });
    expect(id.handle).toMatch(/^[a-z]+\.[a-z]+\d{3}$/);
  });

  it("aligne persona.ts (Sophia) sur les mêmes langues cibles", () => {
    const src = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/persona.ts"),
      "utf8",
    );
    const themes = ["alpha_male", "smart_girl", "clean_girl", "cinema", "anciens", "default"];
    for (const code of LANGUES_CIBLES) {
      expect(src, `prénoms ${code}`).toMatch(new RegExp(`\\n  ${code}: \\{\\n    prenomsH:`));
      for (const theme of themes) {
        const start = src.indexOf(`  ${theme}: {`);
        expect(start, theme).toBeGreaterThan(-1);
        const bloc = src.slice(start, start + 8000);
        expect(bloc, `${theme}.${code}`).toMatch(new RegExp(`\\n    ${code}: \\[`));
      }
    }
  });
});

describe("applications", () => {
  it("valide et normalise un slug", () => {
    expect(normaliserSlugApplication(" MiCabo ")).toBe("micabo");
    expect(estSlugApplicationValide("micabo")).toBe(true);
    expect(estSlugApplicationValide("1bad")).toBe(false);
    expect(estSlugMicabo("micabo")).toBe(true);
  });

  it("hérite l'application de la source, jamais Sophia par défaut", () => {
    expect(
      resoudreApplicationImport({
        sourceApplicationId: "micabo-id",
        explicitApplicationId: "sophia-id",
        fallbackId: "sophia-id",
      }),
    ).toBe("micabo-id");
    expect(
      resoudreApplicationImport({
        sourceApplicationId: null,
        explicitApplicationId: "micabo-id",
        fallbackId: "sophia-id",
      }),
    ).toBe("micabo-id");
    expect(
      resoudreApplicationImport({
        sourceApplicationId: "  ",
        explicitApplicationId: null,
        fallbackId: "sophia-id",
      }),
    ).toBe("sophia-id");
  });

  it("résout les clés de prompts", () => {
    expect(clePromptPertinence("sophia")).toBe("pertinence");
    expect(clePromptPertinence("micabo")).toBe("pertinence_micabo");
    expect(clePromptPlacement("sophia")).toBe("placement_sophia");
    expect(clePromptPlacement("micabo")).toBe("placement_micabo");
  });

  it("filtre les posters par application de leurs comptes", () => {
    const apps = [
      { id: "s", slug: "sophia", nom: "Sophia", created_at: "" },
      { id: "m", slug: "micabo", nom: "micabo", created_at: "" },
    ];
    const comptes = [
      { application_id: "s", application_slug: "sophia" },
      { application_id: "m", application_slug: "micabo" },
    ];
    expect(posterMatcheApplication(comptes, "tous", apps)).toBe(true);
    expect(posterMatcheApplication(comptes, "sophia", apps)).toBe(true);
    expect(posterMatcheApplication(comptes, "micabo", apps)).toBe(true);
    expect(posterMatcheApplication([comptes[0]!], "micabo", apps)).toBe(false);
  });

  it("isole les files de labels par application", () => {
    const file = {
      items: [{ label_id: "sophia-1", ugc: false }],
      par_langue: { fr: [{ label_id: "sophia-fr", ugc: false }] },
    };
    const next = avecFileLabelsApplication(file, "micabo", {
      items: [{ label_id: "micabo-1", ugc: true }],
      par_langue: {} as typeof file.par_langue,
    });
    expect(fileLabelsDeLApplication(next, "sophia").items[0]?.label_id).toBe("sophia-1");
    expect(fileLabelsDeLApplication(next, "micabo").items[0]?.label_id).toBe("micabo-1");
    expect(next.items[0]?.label_id).toBe("sophia-1");
  });
});
