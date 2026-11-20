import { describe, expect, it } from "vitest";

import type { Pod } from "./api";
import {
  assemblerPodz,
  candidatsMontres,
  etatLangues,
  filtrerPodz,
  formatPodz,
  grouperParApplication,
  langueEcriture,
  modelesDuNom,
  resumeLangues,
  SANS_APPLICATION,
} from "./identite";

const pod = (p: Partial<Pod> & { slug: string }): Pod => ({
  nom: p.slug,
  actif: true,
  label: null,
  auto_validation: true,
  auto_validation_heures: 5,
  label_id: null,
  langues: null,
  langues_pretes: null,
  modeles: [],
  cree_le: null,
  apps: [],
  ...p,
});

describe("formatPodz", () => {
  it("lit le format dans ce que le podz livre", () => {
    expect(formatPodz({ slug: "originaux_rh", langues: null })).toBe("texte_banque");
    expect(formatPodz({ slug: "originaux_rh", langues: [] })).toBe("texte_banque");
    // « Originaux » dans le nom, mais il livre ses langues : images finies.
    expect(formatPodz({ slug: "originaux_dorian", langues: ["en", "de"] })).toBe("images_finies");
    expect(formatPodz({ slug: "reactions_ugc", langues: null })).toBe("video");
  });
});

describe("modelesDuNom", () => {
  it("trouve les comptes cités dans le nom", () => {
    expect(modelesDuNom("Remakes @fathom0g (Sophia)")).toEqual(["fathom0g"]);
    expect(modelesDuNom("Originaux @built.not.born61 (Atala)")).toEqual(["built.not.born61"]);
    expect(modelesDuNom("Remakes @sagace.fr.")).toEqual(["sagace.fr"]);
    expect(modelesDuNom("Originaux RH")).toEqual([]);
  });
});

describe("etatLangues", () => {
  it("texte + banque : chaque langue qui a un compte est servie, la plus remplie d'abord", () => {
    const l = etatLangues(null, { de: 10, tr: 10, fr: 4 });
    expect(l.map((x) => [x.langue, x.etat, x.comptes])).toEqual([
      ["de", "servie", 10],
      ["tr", "servie", 10],
      ["fr", "servie", 4],
    ]);
    expect(resumeLangues(l)).toMatchObject({ servie: 3, comptes: 24, max: 10 });
  });

  it("images finies : servie, ouverte sans compte, compte hors liste", () => {
    const l = etatLangues(["en", "de", "pt-BR"], { en: 1, "pt-br": 1, hu: 1 });
    expect(l.map((x) => [x.langue, x.etat, x.comptes])).toEqual([
      ["en", "servie", 1],
      ["pt-BR", "servie", 1],
      ["de", "sans_compte", 0],
      ["hu", "hors_liste", 1],
    ]);
    expect(resumeLangues(l)).toMatchObject({ servie: 2, sans_compte: 1, hors_liste: 1 });
  });

  it("une langue de base sert la variante de compte qui n'est pas déclarée à part", () => {
    const sansVariante = etatLangues(["es"], { es: 1, "es-419": 2 });
    expect(sansVariante).toEqual([
      { langue: "es", etat: "servie", comptes: 3, variantes: [{ langue: "es-419", comptes: 2 }], journal: [] },
    ]);
    const avecVariante = etatLangues(["es", "es-419"], { "es-419": 2 });
    expect(avecVariante.map((x) => [x.langue, x.etat, x.comptes])).toEqual([
      ["es-419", "servie", 2],
      ["es", "sans_compte", 0],
    ]);
  });

  it("garde le journal de chaque langue, même pour une langue qui n'est plus dans la liste", () => {
    const o = (langue: string, jour: string, action: "ouverte" | "fermee" = "ouverte") =>
      ({ langue, ouvert_le: `2026-11-${jour}T03:40:00Z`, action, par: "soupape" as const });
    const l = etatLangues(["en", "tr"], { en: 1 }, [o("tr", "15"), o("hu", "16"), o("hu", "17", "fermee")]);
    expect(l.find((x) => x.langue === "tr")).toMatchObject({ etat: "sans_compte" });
    expect(l.find((x) => x.langue === "tr")!.journal).toHaveLength(1);
    expect(l.find((x) => x.langue === "hu")).toMatchObject({ etat: "hors_liste", comptes: 0 });
    expect(l.find((x) => x.langue === "hu")!.journal.map((j) => j.action)).toEqual(["ouverte", "fermee"]);
  });

  it("une langue ouverte que l'atelier ne sait pas encore produire est à préparer, avec ou sans compte", () => {
    // Dorian : le hongrois ouvert par la soupape, un compte y attend, l'atelier a 3 langues.
    const l = etatLangues(["en", "de", "hu", "fi"], { en: 1, hu: 1 }, [], ["en", "de"]);
    expect(l.map((x) => [x.langue, x.etat, x.comptes])).toEqual([
      ["en", "servie", 1],
      ["hu", "a_preparer", 1],
      ["fi", "a_preparer", 0],
      ["de", "sans_compte", 0],
    ]);
    expect(resumeLangues(l)).toMatchObject({ servie: 1, a_preparer: 2, sans_compte: 1, hors_liste: 0 });
    // Sans liste « prêtes » (avant 0781) : tout ce qui est ouvert est tenu pour prêt.
    expect(etatLangues(["en", "hu"], { hu: 1 }).map((x) => x.etat)).toEqual(["servie", "sans_compte"]);
  });
});

describe("la liste", () => {
  const pods = [
    pod({ slug: "originaux_atala", label: "dos_donts_run", label_id: "l-run", apps: ["atala"], langues: ["en"] }),
    pod({ slug: "remakes_fathom", label: "Fathomly", label_id: "l-fa", apps: ["sophia"], langues: ["en"] }),
    pod({ slug: "originaux_rh", label: "RH", label_id: "l-rh", apps: ["sophia"] }),
    pod({ slug: "originaux_plony", label: "Plony", label_id: "l-pl", apps: ["sophia"], actif: false }),
    pod({ slug: "fathom_bis", label: "Fathomly", label_id: "l-fa", apps: ["sophia"], langues: ["de"], cree_le: "2026-12-01" }),
    pod({ slug: "reactions_ugc" }),
  ];
  const lignes = assemblerPodz(pods);

  it("porte le nom du label, et connaît les autres podz du label", () => {
    const fathom = lignes.find((l) => l.pod.slug === "remakes_fathom")!;
    expect(fathom.titre).toBe("Fathomly");
    expect(fathom.freres).toEqual(["fathom_bis"]);
    expect(lignes.find((l) => l.pod.slug === "reactions_ugc")!.titre).toBe("reactions_ugc");
  });

  it("prend le modèle dans le champ du podz, sinon dans son nom", () => {
    const l = assemblerPodz([
      pod({ slug: "originaux_alpha_male", nom: "Originaux alpha_male", modeles: ["selfsculpt_", "millyjhino"] }),
      pod({ slug: "remakes_kaja", nom: "Remakes @kaja.learn (Sophia)" }),
      pod({ slug: "originaux_rh", nom: "Originaux RH" }),
    ]);
    expect(l.map((x) => x.modeles)).toEqual([["selfsculpt_", "millyjhino"], ["kaja.learn"], []]);
  });

  it("range par application (ordre du catalogue), actifs d'abord, deux podz d'un label côte à côte", () => {
    const groupes = grouperParApplication(lignes);
    expect(groupes.map((g) => g.application)).toEqual(["sophia", "atala", SANS_APPLICATION]);
    expect(groupes[0]!.lignes.map((l) => l.pod.slug)).toEqual(["remakes_fathom", "fathom_bis", "originaux_rh", "originaux_plony"]);
  });

  it("filtre par format et par état", () => {
    expect(filtrerPodz(lignes, { format: "tous", etat: "actifs" })).toHaveLength(5);
    expect(filtrerPodz(lignes, { format: "tous", etat: "pause" }).map((l) => l.pod.slug)).toEqual(["originaux_plony"]);
    expect(filtrerPodz(lignes, { format: "images_finies", etat: "tous" })).toHaveLength(3);
    expect(filtrerPodz(lignes, { format: "video", etat: "tous" })).toHaveLength(1);
  });
});

describe("langueEcriture", () => {
  it("prend la langue de la plupart des livraisons, sans les compléments de langues", () => {
    expect(
      langueEcriture([
        { type: "nouveau", langue_source: "fr" },
        { type: "nouveau", langue_source: "fr" },
        { type: "langues", langue_source: "de" },
        { type: "langues", langue_source: "de" },
        { type: "langues", langue_source: "de" },
        { type: "nouveau", langue_source: "en" },
      ]),
    ).toBe("fr");
    expect(langueEcriture([])).toBeNull();
  });
});

describe("candidatsMontres", () => {
  const c = [{ empilement: 8 }, { empilement: 2 }, { empilement: 1 }, { empilement: 0 }];
  it("ne montre d'abord que les comptes empilés, dans l'ordre reçu", () => {
    expect(candidatsMontres(c, false)).toEqual([{ empilement: 8 }, { empilement: 2 }]);
    expect(candidatsMontres(c, true)).toHaveLength(4);
  });
});
