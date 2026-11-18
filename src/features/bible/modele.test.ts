import { describe, expect, it } from "vitest";

import { cartes, FILTRES_VIDES, filtrer, grouper, nombreCourt } from "./modele";
import type { AppBible, CompteImporte, FicheBible, LabelBible, LabelPropose } from "./types";

const APPS: AppBible[] = [
  { id: "a-sophia", slug: "sophia", nom: "Sophia" },
  { id: "a-micabo", slug: "micabo", nom: "micabo" },
];
const LABELS: LabelBible[] = [{ id: "l-study", nom: "study_series", style_theme: "notes manuscrites", application_id: "a-micabo", apps: ["a-micabo"] }];
const PROPOSES: LabelPropose[] = [
  { id: "p-anx", nom: "anxiety_run", description_da: "course au lever du soleil", application_ids: [], apps_attente: ["Runvik – running"], statut: "a_valider", label_id: null, propose_at: "" },
];

const fiche = (p: Partial<FicheBible>): FicheBible => ({
  id: "f1", handle: "x", profil_url: null, statut: "a_trier", application_ids: [], apps_attente: [], label_id: null, label_propose_id: null,
  note_import: null, angle: null, niche_statut: null, niche: null, polyvalent: false, polyvalent_regles: [], langue: null, pays: null,
  abonnes: null, vues_mediane: null, meilleur_post_url: null, meilleur_post_vues: null, dernier_post_le: null, stats_source: null,
  posts: [], miniatures_statut: null, miniatures_erreur: null, compte_reference_id: null, ajoute_par: "u1", ajoute_at: "2026-11-18", modifie_at: "2026-11-18",
  ...p,
});

const IMPORTE: CompteImporte = {
  compte_reference_id: "r1", handle: "sally.htg", langue: "en", niche: "study", actif: true, application_id: "a-sophia", ajoute_at: "2026-11-01",
  labels: [{ id: "l-study", nom: "study_series" }], slides: ["s1", "s2", "s3"], posts: 30, vues_mediane: 12000, bible_id: null,
};

describe("Bible : galerie", () => {
  const fiches = [
    fiche({ id: "f1", handle: "sydneysynced", label_propose_id: "p-anx", apps_attente: ["Runvik – running"], niche_statut: "oui" }),
    fiche({ id: "f2", handle: "crushedethereal", application_ids: ["a-sophia"], polyvalent: true, posts: [{ url: "u", miniature_url: "m1" }] }),
  ];

  it("en attente / déjà importés / tous", () => {
    expect(cartes(fiches, [IMPORTE], LABELS, PROPOSES, "attente").map((c) => c.handle)).toEqual(["sydneysynced", "crushedethereal"]);
    const imp = cartes(fiches, [IMPORTE], LABELS, PROPOSES, "importes");
    expect(imp).toHaveLength(1);
    // Les apps d'un importé viennent de ses labels (study_series → micabo), et ses 3 slides de nos médias.
    expect(imp[0]).toMatchObject({ kind: "importe", appIds: ["a-micabo"], labelNom: "study_series", miniatures: ["s1", "s2", "s3"], statut: "importe" });
    expect(cartes(fiches, [IMPORTE], LABELS, PROPOSES, "tous")).toHaveLength(3);
  });

  it("regroupe par app puis label, avec la description de DA ; les apps en attente à part", () => {
    const g = grouper(cartes(fiches, [IMPORTE], LABELS, PROPOSES, "tous"), APPS, LABELS, PROPOSES);
    expect(g.map((x) => x.nom)).toEqual(["Sophia", "micabo", "Runvik – running (en attente)"]);
    expect(g[1]!.labels[0]).toMatchObject({ nom: "study_series", description: "notes manuscrites" });
    expect(g[2]!.labels[0]).toMatchObject({ nom: "anxiety_run", propose: true, description: "course au lever du soleil" });
  });

  it("filtres", () => {
    const toutes = cartes(fiches, [IMPORTE], LABELS, PROPOSES, "tous");
    expect(filtrer(toutes, { ...FILTRES_VIDES, niche: "oui" }).map((c) => c.handle)).toEqual(["sydneysynced"]);
    expect(filtrer(toutes, { ...FILTRES_VIDES, app: "attente" }).map((c) => c.handle)).toEqual(["sydneysynced"]);
    expect(filtrer(toutes, { ...FILTRES_VIDES, recherche: "@sally" }).map((c) => c.handle)).toEqual(["sally.htg"]);
    expect(filtrer(toutes, { ...FILTRES_VIDES, label: "p-anx" }).map((c) => c.handle)).toEqual(["sydneysynced"]);
    expect(nombreCourt(1_250_000)).toBe("1.3 M");
    expect(nombreCourt(12_400)).toBe("12 k");
  });
});
