import { readFileSync } from "node:fs";

import i18n from "i18next";
import { describe, expect, it } from "vitest";

import "@/locales";

import {
  brouillonDepuisReglages,
  CHAMPS_REGLAGE_LABEL,
  etatManuelLabel,
  poserEtatManuelLabel,
  validerReglagesLabel,
  versCleBase,
  type BrouillonReglageLabel,
} from "./reglagesLabel";
import { estFerme, motifFermeture, REGLAGES_CHOIX_LABEL_DEFAUT } from "./scoreLabel";

const APP = "id-sophia";
const AUTRE_APP = "id-unswipe";
const LABEL = "id-study";

function brouillon(modif: Partial<BrouillonReglageLabel> = {}): BrouillonReglageLabel {
  return { ...brouillonDepuisReglages(REGLAGES_CHOIX_LABEL_DEFAUT), ...modif };
}

describe("les clés écrites sont celles que le moteur lit", () => {
  // Une faute de frappe sur une clé ne casserait rien : le moteur ne la
  // trouverait pas, reprendrait sa valeur par défaut, et l'écran afficherait
  // fièrement un réglage qui ne sert à rien. Ce test lit le moteur.
  const MOTEUR = readFileSync("supabase/functions/_shared/choix_label_equilibre.ts", "utf8");

  it.each(CHAMPS_REGLAGE_LABEL.map((c) => [c.cle, c.cleBase] as const))(
    "%s est lu sous v.%s",
    (_cle, cleBase) => {
      expect(MOTEUR).toContain(`v.${cleBase}`);
    },
  );

  it("les douze réglages sont tous proposés, aucun oublié", () => {
    // Lu dans le corps du lecteur du moteur, pas dans tout le fichier : un
    // réglage ajouté là-bas et oublié ici resterait invisible pour toujours.
    const debut = MOTEUR.indexOf("export function lireReglagesChoixLabel(");
    const corps = MOTEUR.slice(debut, MOTEUR.indexOf("\n}", debut));
    const lus = [...corps.matchAll(/\bv\.([a-z][a-z0-9_]*)/g)].map((m) => m[1]);
    // Les deux listes manuelles et la mémoire de la nuit ne se règlent pas au
    // clavier : elles ont leurs propres boutons, ou appartiennent au serveur.
    const hors = new Set([
      "labels_ouverts",
      "labels_fermes",
      "labels_fermes_app",
      "labels_ouverts_app",
      "fermes_auto",
    ]);
    const attendus = [...new Set(lus)].filter((c) => !hors.has(c)).sort();
    expect(CHAMPS_REGLAGE_LABEL.map((c) => c.cleBase).sort()).toEqual(attendus);
  });

  it("versCleBase rend un objet en snake_case, prêt à fusionner", () => {
    const v = validerReglagesLabel(brouillon()).valeurs!;
    expect(versCleBase(v).perf_exposant).toBe(REGLAGES_CHOIX_LABEL_DEFAUT.perfExposant);
    expect(versCleBase(v).relabels_max_par_nuit).toBe(
      REGLAGES_CHOIX_LABEL_DEFAUT.relabelsMaxParNuit,
    );
  });
});

describe("chaque champ a son libellé, dans les deux langues", () => {
  // Les libellés se déduisaient du nom du champ par une capitale. Cinq sur
  // douze ne suivaient pas la règle (`reserveMinJours` contre `rReserveMin`)
  // et s'affichaient en clé brute : rien ne plantait, l'écran était juste
  // illisible. La clé est maintenant écrite, et vérifiée ici.
  it.each(["fr", "en"])("%s", async (langue) => {
    await i18n.changeLanguage(langue);
    const muets = CHAMPS_REGLAGE_LABEL.filter(
      (c) => i18n.t(`repartition.${c.cleI18n}`) === `repartition.${c.cleI18n}`,
    ).map((c) => c.cleI18n);
    expect(muets).toEqual([]);
  });
});

describe("validation : refuser ce que le moteur aurait réécrit en silence", () => {
  it("les valeurs par défaut passent telles quelles", () => {
    const v = validerReglagesLabel(brouillon());
    expect(v.erreurs).toEqual({});
    expect(v.valeurs?.perfExposant).toBe(2);
  });

  it("zéro sur un champ que le moteur veut strictement positif est refusé", () => {
    // `positif(0, 2)` rend 2 : poser zéro afficherait 0 et appliquerait 2.
    expect(validerReglagesLabel(brouillon({ perfExposant: "0" })).erreurs.perfExposant).toBe(
      "borne",
    );
    expect(validerReglagesLabel(brouillon({ perfExposant: "0" })).valeurs).toBeNull();
  });

  it("zéro est accepté là où le moteur l'accepte", () => {
    // `perf_lissage` passe par Math.max(0, …) : zéro veut dire zéro.
    expect(validerReglagesLabel(brouillon({ perfLissage: "0" })).erreurs).toEqual({});
    expect(validerReglagesLabel(brouillon({ relabelsMaxParNuit: "0" })).erreurs).toEqual({});
  });

  it("une part maximale au-dessus de 1 est refusée, le moteur la raboterait", () => {
    expect(validerReglagesLabel(brouillon({ partMax: "1.5" })).erreurs.partMax).toBe("borne");
    expect(validerReglagesLabel(brouillon({ partMax: "1" })).erreurs).toEqual({});
  });

  it("un compte de comptes doit être entier, le moteur arrondit", () => {
    expect(validerReglagesLabel(brouillon({ relabelsMaxParNuit: "2.5" })).erreurs
      .relabelsMaxParNuit).toBe("entier");
  });

  it("un champ vide ou illisible est refusé plutôt que relu comme un défaut", () => {
    expect(validerReglagesLabel(brouillon({ perfMin: "" })).erreurs.perfMin).toBe("nombre");
    expect(validerReglagesLabel(brouillon({ perfMin: "abc" })).erreurs.perfMin).toBe("nombre");
  });

  it("borne basse au-dessus de la borne haute : la haute disparaîtrait", () => {
    // Le moteur fait Math.min(perfMax, Math.max(perfMin, x)). Avec min > max,
    // le résultat vaut toujours perfMin : tous les labels se valent, en
    // silence. Chaque champ est pourtant valide pris isolément.
    const v = validerReglagesLabel(brouillon({ perfMin: "5", perfMax: "4" }));
    expect(v.erreurs).toEqual({});
    expect(v.bornesCroisees).toBe(true);
    expect(v.valeurs).toBeNull();
  });
});

describe("ouvrir, fermer, rendre à l'automatique", () => {
  const vide = { ouvertsApp: [] as string[], fermesApp: [] as string[] };

  it("sans décision posée, le label est en automatique", () => {
    expect(etatManuelLabel(LABEL, APP, vide)).toBe("auto");
  });

  it("fermer puis ouvrir ne laisse pas les deux décisions en place", () => {
    // Sans le retrait, `ouvertsApp` gagnerait et le bouton « Fermé » ne
    // ferait visiblement rien.
    const ferme = poserEtatManuelLabel(vide, APP, LABEL, "ferme");
    expect(etatManuelLabel(LABEL, APP, ferme)).toBe("ferme");
    const ouvert = poserEtatManuelLabel(ferme, APP, LABEL, "ouvert");
    expect(ouvert.fermesApp).toEqual([]);
    expect(etatManuelLabel(LABEL, APP, ouvert)).toBe("ouvert");
  });

  it("repasser en automatique retire les deux décisions", () => {
    const ouvert = poserEtatManuelLabel(vide, APP, LABEL, "ouvert");
    const auto = poserEtatManuelLabel(ouvert, APP, LABEL, "auto");
    expect(auto).toEqual({ ouvertsApp: [], fermesApp: [] });
  });

  it("la décision ne vaut que pour son application", () => {
    const ferme = poserEtatManuelLabel(vide, APP, LABEL, "ferme");
    expect(etatManuelLabel(LABEL, AUTRE_APP, ferme)).toBe("auto");
  });

  it("poser deux fois le même état ne duplique pas la clé", () => {
    const une = poserEtatManuelLabel(vide, APP, LABEL, "ferme");
    const deux = poserEtatManuelLabel(une, APP, LABEL, "ferme");
    expect(deux.fermesApp).toEqual(une.fermesApp);
    expect(deux.fermesApp).toHaveLength(1);
  });

  it("rouvrir à la main un label que la nuit a fermé marche vraiment", () => {
    // C'est le cas réel : alpha_male_film, fermé automatiquement le 16/10.
    // `ouvertsApp` est lu en premier par les deux fonctions, donc la
    // réouverture vaut à la création comme à l'assignation de nuit.
    const r = {
      ...REGLAGES_CHOIX_LABEL_DEFAUT,
      fermesAuto: { [`${APP}:${LABEL}`]: { depuis: "2026-10-16", perf: 0.584, posts: 234 } },
    };
    expect(estFerme(LABEL, APP, r)).toBe(true);
    const listes = poserEtatManuelLabel(r, APP, LABEL, "ouvert");
    expect(estFerme(LABEL, APP, { ...r, ...listes })).toBe(false);
  });

  it("repasser en automatique ne ressuscite pas un label fermé par la nuit", () => {
    // La mémoire de la nuit existe parce qu'un label fermé ne poste plus :
    // ses chiffres s'éteignent et ne le rouvriraient jamais seuls. « Auto »
    // rend la décision au moteur, il ne l'annule pas.
    const r = {
      ...REGLAGES_CHOIX_LABEL_DEFAUT,
      fermesAuto: { [`${APP}:${LABEL}`]: { depuis: "2026-10-16", perf: 0.584, posts: 234 } },
    };
    const ouvert = { ...r, ...poserEtatManuelLabel(r, APP, LABEL, "ouvert") };
    const auto = { ...ouvert, ...poserEtatManuelLabel(ouvert, APP, LABEL, "auto") };
    expect(estFerme(LABEL, APP, auto)).toBe(true);
    expect(motifFermeture(LABEL, APP, auto)).toBe("auto");
  });
});
