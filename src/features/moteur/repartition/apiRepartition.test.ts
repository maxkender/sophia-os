/**
 * Les écritures dans `reglages.choix_labels`, qui a DEUX écrivains.
 *
 * La page y pose les douze réglages et les décisions d'ouverture ; la nuit y
 * pose `dernier_run` et la mémoire de ses fermetures (`fermes_auto`). Un `set`
 * sec depuis un instantané de page effacerait cette mémoire, et tous les
 * labels fermés rouvriraient d'un coup sans que personne l'ait demandé. Ces
 * tests tiennent la fusion.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ecrireReglage = vi.fn();
vi.mock("../api", () => ({
  ecrireReglage: (cle: string, valeur: unknown) => ecrireReglage(cle, valeur),
}));

const maybeSingle = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => maybeSingle() }) }),
    }),
    rpc: (nom: string, args: unknown) => rpc(nom, args),
  },
}));

import {
  ecrireEtatManuelLabel,
  ecrireReglagesChoixLabel,
  lireMarchesRepartition,
  lireReglagesChoixLabelPoses,
  remettreReglagesChoixLabelDefaut,
} from "./apiRepartition";
import { CHAMPS_REGLAGE_LABEL } from "./reglagesLabel";
import { REGLAGES_CHOIX_LABEL_DEFAUT } from "./scoreLabel";

/** La prod au 24/10 : rien que la trace de la nuit, aucun réglage posé. */
const EN_BASE = {
  dernier_run: { at: "2026-10-19T22:00:34.912Z", jour: "2026-10-20" },
  fermes_auto: {
    "id-sophia:id-film": { depuis: "2026-10-16", perf: 0.584, posts: 234, nom: "alpha_male_film" },
  },
};

const DOUZE = Object.fromEntries(
  CHAMPS_REGLAGE_LABEL.map((c) => [c.cle, REGLAGES_CHOIX_LABEL_DEFAUT[c.cle]]),
) as Record<(typeof CHAMPS_REGLAGE_LABEL)[number]["cle"], number>;

const ecrit = () => ecrireReglage.mock.calls[0]![1] as Record<string, unknown>;

beforeEach(() => {
  ecrireReglage.mockReset();
  ecrireReglage.mockResolvedValue(undefined);
  maybeSingle.mockReset();
  maybeSingle.mockResolvedValue({ data: { valeur: EN_BASE }, error: null });
});

describe("poser les réglages", () => {
  it("garde la mémoire de la nuit au lieu de l'écraser", async () => {
    await ecrireReglagesChoixLabel({ ...DOUZE, perfExposant: 3 });
    expect(ecrireReglage).toHaveBeenCalledWith("choix_labels", expect.anything());
    expect(ecrit().fermes_auto).toEqual(EN_BASE.fermes_auto);
    expect(ecrit().dernier_run).toEqual(EN_BASE.dernier_run);
    expect(ecrit().perf_exposant).toBe(3);
  });

  it("écrit les douze clés en snake_case, celles que le moteur lit", async () => {
    await ecrireReglagesChoixLabel(DOUZE);
    for (const c of CHAMPS_REGLAGE_LABEL) {
      expect(ecrit()[c.cleBase], c.cleBase).toBe(REGLAGES_CHOIX_LABEL_DEFAUT[c.cle]);
    }
  });

  it("une clé absente en base ne fait pas échouer la fusion", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await ecrireReglagesChoixLabel(DOUZE);
    expect(ecrit().perf_exposant).toBe(REGLAGES_CHOIX_LABEL_DEFAUT.perfExposant);
  });

  it("une erreur de lecture remonte au lieu d'écrire à l'aveugle", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: new Error("42501") });
    await expect(ecrireReglagesChoixLabel(DOUZE)).rejects.toThrow("42501");
    expect(ecrireReglage).not.toHaveBeenCalled();
  });
});

describe("revenir aux valeurs par défaut", () => {
  it("retire les douze clés et ne touche à rien d'autre", async () => {
    maybeSingle.mockResolvedValue({
      data: { valeur: { ...EN_BASE, perf_exposant: 3, part_max: 0.4, labels_fermes_app: ["a:b"] } },
      error: null,
    });
    await remettreReglagesChoixLabelDefaut();
    for (const c of CHAMPS_REGLAGE_LABEL) expect(ecrit()[c.cleBase], c.cleBase).toBeUndefined();
    // Retirer les clés rend la main aux défauts du CODE. Y réécrire les mêmes
    // nombres les figerait, et la page jurerait ensuite qu'ils sont « par
    // défaut » alors qu'ils ne suivraient plus le code.
    expect(ecrit().fermes_auto).toEqual(EN_BASE.fermes_auto);
    expect(ecrit().labels_fermes_app).toEqual(["a:b"]);
  });
});

describe("ouvrir ou fermer un label", () => {
  it("fermer écrit les deux listes, et laisse la mémoire de la nuit", async () => {
    await ecrireEtatManuelLabel({ applicationId: "id-sophia", labelId: "id-x", etat: "ferme" });
    expect(ecrit().labels_fermes_app).toEqual(["id-sophia:id-x"]);
    expect(ecrit().labels_ouverts_app).toEqual([]);
    expect(ecrit().fermes_auto).toEqual(EN_BASE.fermes_auto);
  });

  it("rouvrir un label fermé par la nuit ne supprime pas sa fermeture mémorisée", async () => {
    // `ouvertsApp` est lu en premier par `estFerme` : la réouverture est
    // effective sans toucher à la mémoire, donc « auto » la rendra plus tard.
    await ecrireEtatManuelLabel({ applicationId: "id-sophia", labelId: "id-film", etat: "ouvert" });
    expect(ecrit().labels_ouverts_app).toEqual(["id-sophia:id-film"]);
    expect(ecrit().fermes_auto).toEqual(EN_BASE.fermes_auto);
  });

  it("poser l'inverse retire la décision précédente", async () => {
    maybeSingle.mockResolvedValue({
      data: { valeur: { ...EN_BASE, labels_ouverts_app: ["id-sophia:id-x"] } },
      error: null,
    });
    await ecrireEtatManuelLabel({ applicationId: "id-sophia", labelId: "id-x", etat: "ferme" });
    expect(ecrit().labels_ouverts_app).toEqual([]);
    expect(ecrit().labels_fermes_app).toEqual(["id-sophia:id-x"]);
  });

  it("la décision d'une autre application n'est pas emportée", async () => {
    maybeSingle.mockResolvedValue({
      data: { valeur: { ...EN_BASE, labels_fermes_app: ["id-unswipe:id-x"] } },
      error: null,
    });
    await ecrireEtatManuelLabel({ applicationId: "id-sophia", labelId: "id-x", etat: "ferme" });
    expect(ecrit().labels_fermes_app).toEqual(["id-unswipe:id-x", "id-sophia:id-x"]);
  });
});

describe("savoir si les réglages sont posés", () => {
  it("la trace de la nuit seule ne compte pas comme un réglage posé", async () => {
    await expect(lireReglagesChoixLabelPoses()).resolves.toBe(false);
  });

  it("un seul des douze suffit à dire que quelqu'un a choisi", async () => {
    maybeSingle.mockResolvedValue({ data: { valeur: { ...EN_BASE, part_max: 0.4 } }, error: null });
    await expect(lireReglagesChoixLabelPoses()).resolves.toBe(true);
  });

  it("clé absente : valeurs par défaut", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(lireReglagesChoixLabelPoses()).resolves.toBe(false);
  });
});

describe("lire les marchés d'une application (simulation_repartition)", () => {
  const ligne = {
    langue: "fr",
    pays: "FR",
    label_id: "l1",
    label_nom: "beau_smart_girl",
    comptes_langue: 3,
    comptes_pays: 3,
    comptes_total: 45,
    passages_restants: "494",
    demande_jour: "10.0",
    passages: 20,
    perf_label: "0.45",
    perf_flotte: "1",
    recents_langue: 0,
    recence_langue: 0,
    recents_pays: 0,
    recence_pays: 0,
  };

  it("lit les colonnes de 0352 : pod, langue servie, niveau, comptes de l'application", async () => {
    rpc.mockResolvedValue({
      data: [{ ...ligne, pod_seul: true, livre_langue: false, niveau_pod: "2", comptes_app: 6 }],
      error: null,
    });
    const [m] = await lireMarchesRepartition("id-micabo");
    expect(rpc).toHaveBeenCalledWith("simulation_repartition", { p_application: "id-micabo" });
    expect(m.stats[0]).toMatchObject({ pod_seul: true, livre_langue: false, niveau_pod: 2, comptes_app: 6, comptes_total: 45 });
  });

  it("sans ces colonnes (avant 0352) : label ordinaire, comptes de l'application = total", async () => {
    rpc.mockResolvedValue({ data: [ligne], error: null });
    const [m] = await lireMarchesRepartition("id-micabo");
    expect(m.stats[0]).toMatchObject({ pod_seul: false, livre_langue: true, niveau_pod: null, comptes_app: 45 });
  });
});
