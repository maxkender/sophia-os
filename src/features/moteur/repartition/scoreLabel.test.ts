import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  REGLAGES_CHOIX_LABEL_DEFAUT,
  capacite,
  classerLabels,
  classerPropose,
  estFerme,
  facteurPerformance,
  joursApresCompte,
  lireReglagesChoixLabel,
  motifFermeture,
  poidsLabel,
  type StatLabel,
} from "./scoreLabel";

const APP = "00000000-0000-4000-8000-000000000001";
const DENO = "supabase/functions/_shared/choix_label_equilibre.ts";
const FRONT = "src/features/moteur/repartition/scoreLabel.ts";

/** Un label plein, performant, jamais à sec : la base des cas qui suivent. */
function stat(partiel: Partial<StatLabel> & { label_id: string }): StatLabel {
  return {
    label_nom: partiel.label_id,
    comptes_langue: 0,
    comptes_pays: 0,
    comptes_total: 0,
    passages_restants: 1000,
    demande_jour: 10,
    passages: 500,
    perf_label: 1,
    perf_flotte: 1,
    recents_langue: 0,
    recence_langue: 0,
    recents_pays: 0,
    recence_pays: 0,
    ...partiel,
  };
}

describe("copie Deno", () => {
  const bloc = (chemin: string, debut: string, fin: string) => {
    const src = readFileSync(chemin, "utf8");
    const i = src.indexOf(debut);
    expect(i, `${debut} absent de ${chemin}`).toBeGreaterThan(-1);
    const j = src.indexOf(fin, i);
    expect(j, `fin de ${debut} absente de ${chemin}`).toBeGreaterThan(-1);
    return src
      .slice(i, j)
      // Le miroir nomme le type `StatLabel`, le moteur `StatLabelCreation` :
      // c'est le seul écart autorisé, tout le reste doit être identique.
      .replace(/StatLabelCreation/g, "StatLabel")
      .replace(/\s+/g, " ")
      .trim();
  };

  it("les réglages par défaut sont les mêmes des deux côtés", () => {
    const debut = "REGLAGES_CHOIX_LABEL_DEFAUT: Readonly<ReglagesChoixLabel> = Object.freeze({";
    expect(bloc(FRONT, debut, "});")).toBe(bloc(DENO, debut, "});"));
  });

  it.each([
    ["facteurPerformance", "export function facteurPerformance("],
    ["joursApresCompte", "export function joursApresCompte("],
    ["capacite", "export function capacite("],
    ["estPodSeul", "export function estPodSeul("],
    ["enAvanceRemplissage", "export function enAvanceRemplissage("],
    ["estSuspendu", "export function estSuspendu("],
    ["estASec", "export function estASec("],
    ["enTestPod", "export function enTestPod("],
    ["testPodPlein", "export function testPodPlein("],
    ["poidsLabel", "export function poidsLabel("],
    ["perfRelative", "export function perfRelative("],
    ["doitFermer", "export function doitFermer("],
    // Les deux qui avaient dérivé sans que rien ne le dise : le lecteur
    // cherchait `ouverts` au lieu de `labels_ouverts`, donc la page n'aurait
    // jamais montré une fermeture manuelle.
    ["lireReglagesChoixLabel", "export function lireReglagesChoixLabel("],
    ["estFerme", "export function estFerme("],
    ["listeIds", "function listeIds("],
    ["positif", "function positif("],
  ])("le code de %s est le même des deux côtés", (_nom, debut) => {
    expect(bloc(FRONT, debut, "\n}")).toBe(bloc(DENO, debut, "\n}"));
  });

  it("l'interface des réglages est la même des deux côtés", () => {
    const debut = "export interface ReglagesChoixLabel {";
    expect(bloc(FRONT, debut, "\n}")).toBe(bloc(DENO, debut, "\n}"));
  });

  it("les deux plafonds du calcul sont les mêmes", () => {
    for (const nom of ["CAPACITE_MIN = 0.05", "JOURS_A_SEC = 1"]) {
      expect(readFileSync(FRONT, "utf8"), nom).toContain(nom);
      expect(readFileSync(DENO, "utf8"), nom).toContain(nom);
    }
  });
});

describe("lecture du réglage", () => {
  it("une valeur absente retombe sur le défaut", () => {
    expect(lireReglagesChoixLabel(null)).toEqual(REGLAGES_CHOIX_LABEL_DEFAUT);
    expect(lireReglagesChoixLabel({ perf_exposant: 0 }).perfExposant).toBe(2);
  });

  it("une fermeture automatique est lue avec sa date et ses chiffres", () => {
    const r = lireReglagesChoixLabel({
      fermes_auto: { [`${APP}:lab`]: { nom: "alpha_male_film", perf: 0.584, posts: 234, depuis: "2026-10-16" } },
    });
    expect(r.fermesAuto[`${APP}:lab`]).toEqual({
      depuis: "2026-10-16",
      perf: 0.584,
      posts: 234,
      nom: "alpha_male_film",
    });
  });

  it("une clé de fermeture sans application est ignorée", () => {
    expect(lireReglagesChoixLabel({ fermes_auto: { lab: { posts: 1 } } }).fermesAuto).toEqual({});
  });

  it("les listes par application se lisent dans le même réglage", () => {
    const r = lireReglagesChoixLabel({ labels_fermes_app: [`${APP}:lab`] });
    expect(r.fermesApp).toEqual([`${APP}:lab`]);
    expect(lireReglagesChoixLabel(null).fermesApp).toEqual([]);
  });

  it("les listes globales se lisent sous labels_ouverts / labels_fermes", () => {
    const r = lireReglagesChoixLabel({ labels_ouverts: ["a"], labels_fermes: ["b"] });
    expect(r.ouverts).toEqual(["a"]);
    expect(r.fermes).toEqual(["b"]);
  });
});

describe("fermeture", () => {
  const r = REGLAGES_CHOIX_LABEL_DEFAUT;

  it("un label sous le seuil sur assez de posts ferme sur ses chiffres", () => {
    const s = stat({ label_id: "lab", perf_label: 0.58, passages: 234 });
    expect(motifFermeture("lab", APP, r, s)).toBe("chiffres");
  });

  it("le même label ne ferme pas sans assez de posts", () => {
    const s = stat({ label_id: "lab", perf_label: 0.58, passages: 10 });
    expect(motifFermeture("lab", APP, r, s)).toBeNull();
  });

  it("une fermeture manuelle globale l'emporte sur les chiffres", () => {
    const manuelle = { ...r, fermes: ["lab"] };
    expect(motifFermeture("lab", APP, manuelle, stat({ label_id: "lab" }))).toBe("manuelle");
  });

  it("une fermeture manuelle par application ne ferme que cette application", () => {
    const parApp = { ...r, fermesApp: [`${APP}:lab`] };
    expect(motifFermeture("lab", APP, parApp, stat({ label_id: "lab" }))).toBe("manuelle_app");
    expect(motifFermeture("lab", "autre-app", parApp, stat({ label_id: "lab" }))).toBeNull();
  });

  it("le plus précis gagne : par application avant global", () => {
    const k = `${APP}:lab`;
    expect(estFerme("lab", APP, { ...r, fermes: ["lab"], ouvertsApp: [k] })).toBe(false);
    expect(estFerme("lab", APP, { ...r, ouverts: ["lab"], fermesApp: [k] })).toBe(true);
  });

  it("motifFermeture et estFerme ne peuvent pas se contredire", () => {
    const cas: Array<Partial<typeof r>> = [
      {},
      { fermes: ["lab"] },
      { ouverts: ["lab"] },
      { fermesApp: [`${APP}:lab`] },
      { ouvertsApp: [`${APP}:lab`] },
      { fermes: ["lab"], ouvertsApp: [`${APP}:lab`] },
      { ouverts: ["lab"], fermesApp: [`${APP}:lab`] },
      { fermesAuto: { [`${APP}:lab`]: { depuis: "j", perf: 0.5, posts: 200 } } },
    ];
    const chiffres = [stat({ label_id: "lab" }), stat({ label_id: "lab", perf_label: 0.5, passages: 200 })];
    for (const over of cas) {
      for (const s of chiffres) {
        const reg = { ...r, ...over };
        expect(estFerme("lab", APP, reg, s), JSON.stringify(over)).toBe(
          motifFermeture("lab", APP, reg, s) !== null,
        );
      }
    }
  });

  it("une réouverture manuelle l'emporte sur tout", () => {
    const rouvert = { ...r, ouverts: ["lab"], fermes: ["lab"] };
    const s = stat({ label_id: "lab", perf_label: 0.1, passages: 999 });
    expect(estFerme("lab", APP, rouvert, s)).toBe(false);
  });

  it("un label fermé sort du classement", () => {
    const stats = [stat({ label_id: "ferme" }), stat({ label_id: "ouvert" })];
    const classe = classerLabels(stats, { ...r, fermes: ["ferme"] }, { applicationId: APP });
    expect(classe.map((c) => c.label_id)).toEqual(["ouvert"]);
  });
});

describe("poids", () => {
  it("un label sans mesure de performance pèse comme la flotte", () => {
    expect(facteurPerformance(stat({ label_id: "l", passages: 0, perf_label: null }))).toBe(1);
  });

  it("la performance est lissée vers 1 quand le label a peu de posts", () => {
    const peu = facteurPerformance(stat({ label_id: "l", perf_label: 2, passages: 10 }));
    const beaucoup = facteurPerformance(stat({ label_id: "l", perf_label: 2, passages: 5000 }));
    expect(peu).toBeLessThan(beaucoup);
    expect(beaucoup).toBeGreaterThan(1.8);
  });

  it("la capacité se plafonne à 1 au-delà de la cible", () => {
    expect(capacite(stat({ label_id: "l", passages_restants: 100000, demande_jour: 1 }))).toBe(1);
  });

  it("la capacité garde un plancher, jamais zéro", () => {
    expect(capacite(stat({ label_id: "l", passages_restants: 0, demande_jour: 50 }))).toBe(0.05);
  });

  it("les jours restants comptent le compte qu'on ajoute", () => {
    const s = stat({ label_id: "l", passages_restants: 120, demande_jour: 10 });
    expect(joursApresCompte(s)).toBe(10);
  });

  it("à capacité égale, le meilleur label pèse plus lourd", () => {
    const bon = stat({ label_id: "bon", perf_label: 1.4 });
    const moyen = stat({ label_id: "moyen", perf_label: 0.9 });
    expect(poidsLabel(bon)).toBeGreaterThan(poidsLabel(moyen));
  });
});

describe("règle proposée", () => {
  const r = REGLAGES_CHOIX_LABEL_DEFAUT;
  const opts = { applicationId: APP };

  it("entre deux labels identiques, celui qui est le moins présent gagne", () => {
    const stats = [
      stat({ label_id: "charge", comptes_pays: 6, comptes_langue: 6 }),
      stat({ label_id: "libre", comptes_pays: 0, comptes_langue: 0 }),
    ];
    expect(classerPropose(stats, r, opts)[0].label_id).toBe("libre");
  });

  it("la présence compte le pays ET la langue", () => {
    const stats = [stat({ label_id: "l", comptes_pays: 2, comptes_langue: 3 })];
    expect(classerPropose(stats, r, opts)[0].presence).toBe(5);
  });

  it("un très bon label l'emporte sur un label libre mais médiocre", () => {
    const stats = [
      stat({ label_id: "excellent", perf_label: 2, comptes_pays: 1, comptes_langue: 1 }),
      stat({ label_id: "mediocre", perf_label: 0.5, comptes_pays: 0, comptes_langue: 0 }),
    ];
    expect(classerPropose(stats, r, opts)[0].label_id).toBe("excellent");
  });

  it("un label à sec passe derrière tous les autres, même le plus chargé", () => {
    const stats = [
      stat({ label_id: "asec", passages_restants: 1, demande_jour: 0, perf_label: 3 }),
      stat({ label_id: "plein", comptes_pays: 20, comptes_langue: 20 }),
    ];
    expect(classerPropose(stats, r, opts).map((c) => c.label_id)).toEqual(["plein", "asec"]);
  });

  it("si tous les labels sont à sec, la règle ne bloque personne", () => {
    const stats = [
      stat({ label_id: "a", passages_restants: 1, demande_jour: 0 }),
      stat({ label_id: "b", passages_restants: 0, demande_jour: 0 }),
    ];
    expect(classerPropose(stats, r, opts)).toHaveLength(2);
  });

  it("le score baisse dès qu'un label prend un compte : pas de rafale", () => {
    const avant = classerPropose([stat({ label_id: "l" })], r, opts)[0].score;
    const apres = classerPropose(
      [stat({ label_id: "l", comptes_pays: 1, comptes_langue: 1 })],
      r,
      opts,
    )[0].score;
    expect(apres).toBeLessThan(avant / 2);
  });
});

describe("label 100 % pod (0352)", () => {
  const pleins = [
    stat({ label_id: "alpha_male", comptes_langue: 3, passages_restants: 1535, demande_jour: 44, perf_label: 0.89 }),
    stat({ label_id: "smart_girl", comptes_langue: 5, passages_restants: 944, demande_jour: 102 }),
  ];
  const pod = { label_id: "fathomly", passages_restants: 8, demande_jour: 0, passages: 0, perf_label: null, pod_seul: true, livre_langue: true, niveau_pod: 0 };

  it("sans compte dans la langue, il sort malgré 8 passages de stock", () => {
    expect(capacite(stat(pod))).toBe(1);
    expect(classerLabels([...pleins, stat(pod)], REGLAGES_CHOIX_LABEL_DEFAUT, { applicationId: APP })[0].label_id).toBe("fathomly");
  });

  it("en test avec ses 3 comptes, il n'en reçoit plus ; « Ouvert » le libère", () => {
    const plein = stat({ ...pod, comptes_total: 3 });
    expect(classerLabels([...pleins, plein], REGLAGES_CHOIX_LABEL_DEFAUT, { applicationId: APP }).map((c) => c.label_id)).not.toContain("fathomly");
    const ouvert = { ...REGLAGES_CHOIX_LABEL_DEFAUT, ouvertsApp: [`${APP}:fathomly`] };
    expect(classerLabels([...pleins, plein], ouvert, { applicationId: APP })[0].label_id).toBe("fathomly");
  });

  it("en avance dans la langue, il attend ; langue non servie, il passe en dernier", () => {
    const enAvance = classerLabels([...pleins, stat({ ...pod, comptes_langue: 1 })], REGLAGES_CHOIX_LABEL_DEFAUT, { applicationId: APP });
    expect(enAvance.at(-1)).toMatchObject({ label_id: "fathomly", suspendu: true });
    const muet = classerLabels([...pleins, stat({ ...pod, livre_langue: false })], REGLAGES_CHOIX_LABEL_DEFAUT, { applicationId: APP });
    expect(muet.at(-1)).toMatchObject({ label_id: "fathomly", aSec: true });
  });
});
