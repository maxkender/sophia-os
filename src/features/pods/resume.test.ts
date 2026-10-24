import { describe, expect, it } from "vitest";

import type { PodTableau, TableauPods } from "./api";
import { lignesPods, resumePods } from "./resume";

const pod = (slug: string, patch: Partial<PodTableau> = {}): PodTableau => ({
  slug,
  nom: slug,
  label: null,
  actif: true,
  auto_validation: false,
  auto_validation_heures: 12,
  publies_30j: 10,
  publies_7j: 3,
  mures: 8,
  vues_mediane: 1000,
  pct_10k: 5,
  max_vues: 20000,
  r_mediane: 1,
  contenus: 4,
  contenus_actifs: 3,
  coupes: 0,
  en_tete: 1,
  a_valider: 0,
  auto_erreurs: 0,
  validees_7j: 2,
  auto_7j: 0,
  autonomie: [],
  ...patch,
});

const jour = (d: number, publies: number, pods: number) => ({
  jour: `2026-10-${String(d).padStart(2, "0")}`,
  publies,
  publies_pods: pods,
  part: publies ? Math.round((1000 * pods) / publies) / 10 : null,
});

describe("resumePods", () => {
  const data: TableauPods = {
    genere_le: "2026-10-24T08:00:00Z",
    // Du 15 au 24 : le 24 est en cours.
    jours: [jour(15, 100, 5), ...[16, 17, 18, 19, 20, 21, 22].map((d) => jour(d, 100, 10)), jour(23, 200, 40), jour(24, 30, 30)],
    pods: [
      pod("a", { a_valider: 3, auto_erreurs: 1 }),
      pod("b", { a_valider: 2 }),
      pod("c"),
      pod("eteint", { actif: false, a_valider: 9 }),
    ],
    percees: [
      { contenu_id: "x", pod: "a", accroche: "x", vues: 31000, compte: null, langue: "fr", application: "sophia", rappel: false, jour: "2026-10-20", tier: "A", url: null },
      { contenu_id: "y", pod: "b", accroche: "y", vues: 88000, compte: null, langue: "en", application: "unswipe", rappel: false, jour: "2026-10-21", tier: "B", url: null },
    ],
  };

  it("hier est le dernier jour complet, et les 7 jours s'arrêtent à hier", () => {
    const r = resumePods(data);
    expect(r.hier?.jour).toBe("2026-10-23");
    expect(r.jours).toHaveLength(9);
    // Du 17 au 23 : 6 × 10 + 40 posts des podz sur 6 × 100 + 200.
    expect(r.septJours).toBe(12.5);
  });

  it("compte la file des podz actifs, leurs échecs d'auto-validation et la meilleure percée", () => {
    const r = resumePods(data);
    expect(r.aValider).toBe(5);
    expect(r.podsEnAttente).toBe(2);
    expect(r.autoErreurs).toBe(1);
    expect(r.percees).toBe(2);
    expect(r.meilleure?.contenu_id).toBe("y");
  });
});

describe("lignesPods", () => {
  it("garde les podz qui publient et ceux qui attendent une validation, ceux en attente d'abord", () => {
    const lignes = lignesPods([
      pod("calme", { vues_mediane: 5000 }),
      pod("neuf", { publies_30j: 0, contenus: 0 }),
      pod("en-attente", { publies_30j: 0, contenus: 0, a_valider: 2 }),
      pod("moyen", { vues_mediane: 800 }),
    ]);
    expect(lignes.map((p) => p.slug)).toEqual(["en-attente", "calme", "moyen"]);
  });
});
