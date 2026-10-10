/**
 * Choix à deux niveaux à la création d'un compte (label puis répartition) :
 * ce qui part dans le corps manage-users, et ce qui bloque l'envoi.
 */
import { describe, expect, it } from "vitest";

import {
  applicationsProposees,
  CHOIX_CREATION_DEFAUT,
  cleErreurChoixCompte,
  defautDuLabel,
  labelsProposes,
  optionsDuChoix,
  partsDuChoix,
  persoInitial,
  peutChoisirApplicationsCompte,
  validerChoixCreation,
  type ChoixCreation,
} from "./choixCreation";

const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";
const ID_ZEN = "00000000-0000-4000-8000-000000000009";
const APPS = [
  { id: ID_UNSWIPE, slug: "unswipe", nom: "Unswipe", langues: ["fr", "en"], actif: true },
  { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", langues: null, actif: true },
  { id: ID_ZEN, slug: "zen", nom: "Zen", langues: null, actif: false },
];
/** Clean Girl sert Sophia ET Unswipe ; Detox ne sert qu'Unswipe ; Cinéma n'a pas de ligne (= Sophia). */
const CLEAN = { id: "l-clean", slug: "clean-girl", nom: "Clean Girl" };
const DETOX = { id: "l-detox", slug: "detox", nom: "Detox" };
const CINEMA = { id: "l-cinema", slug: "cinema", nom: "Cinéma" };
const HOOK = { id: "l-hook", slug: "hook", nom: "Hook" };
const UGC = { id: "l-ugc", slug: "ugc-x", nom: "UGC X", ugc_ai_video: true };
const LABELS = [CLEAN, DETOX, CINEMA, HOOK, UGC];
const LIENS = [
  { label_id: CLEAN.id, application_id: ID_SOPHIA },
  { label_id: CLEAN.id, application_id: ID_UNSWIPE },
  { label_id: DETOX.id, application_id: ID_UNSWIPE },
];

const choix = (patch: Partial<ChoixCreation>): ChoixCreation => ({ ...CHOIX_CREATION_DEFAUT, ...patch });
const valider = (c: ChoixCreation, langue = "fr") =>
  validerChoixCreation({ choix: c, applications: APPS, liens: LIENS, labels: LABELS, langue });

describe("peutChoisirApplicationsCompte", () => {
  it("admin et Head of Ops seulement", () => {
    expect(peutChoisirApplicationsCompte("admin")).toBe(true);
    expect(peutChoisirApplicationsCompte("head_of_ops")).toBe(true);
    expect(peutChoisirApplicationsCompte("hiring_manager")).toBe(false);
    expect(peutChoisirApplicationsCompte("directing_manager")).toBe(false);
    expect(peutChoisirApplicationsCompte("poster")).toBe(false);
    expect(peutChoisirApplicationsCompte(null)).toBe(false);
  });
});

describe("ce qui part dans le corps", () => {
  it("rien choisi : aucune clé (comportement d'avant)", () => {
    expect(partsDuChoix(CHOIX_CREATION_DEFAUT)).toBeNull();
    expect(optionsDuChoix(CHOIX_CREATION_DEFAUT)).toEqual({});
  });

  it("label seul : label_id, pas de répartition (défaut NULL)", () => {
    expect(optionsDuChoix(choix({ labelId: CLEAN.id }))).toEqual({ labelId: CLEAN.id });
  });

  it("préréglage 100 % Unswipe : { unswipe: 100 }", () => {
    expect(optionsDuChoix(choix({ repartition: "unique", appUnique: "unswipe" }))).toEqual({
      partsApplications: { unswipe: 100 },
    });
  });

  it("personnalisée : les seules parts > 0", () => {
    const c = choix({ labelId: CLEAN.id, repartition: "perso", perso: { sophia: 70, unswipe: 30, zen: 0 } });
    expect(optionsDuChoix(c)).toEqual({ labelId: CLEAN.id, partsApplications: { sophia: 70, unswipe: 30 } });
  });

  it("personnalisée tout à 0 : rien n'est envoyé (et la somme bloque)", () => {
    const c = choix({ repartition: "perso", perso: { sophia: 0, unswipe: 0 } });
    expect(partsDuChoix(c)).toBeNull();
    expect(valider(c).erreurs).toEqual([{ type: "somme", total: 0 }]);
  });
});

describe("validerChoixCreation", () => {
  it("le défaut ne bloque jamais, même sans lectures", () => {
    const v = validerChoixCreation({
      choix: CHOIX_CREATION_DEFAUT,
      applications: null,
      liens: null,
      labels: null,
    });
    expect(v).toEqual({ parts: null, erreurs: [], infos: [], ok: true });
  });

  it("somme ≠ 100 : bloqué", () => {
    const v = valider(choix({ repartition: "perso", perso: { sophia: 60, unswipe: 30 } }));
    expect(v.ok).toBe(false);
    expect(v.erreurs).toEqual([{ type: "somme", total: 90 }]);
    expect(v.parts).toBeNull();
  });

  it("décimal, négatif ou vide : saisie refusée", () => {
    for (const perso of [{ sophia: 50.5, unswipe: 49.5 }, { sophia: 110, unswipe: -10 }, { sophia: Number.NaN }]) {
      expect(valider(choix({ repartition: "perso", perso })).erreurs).toEqual([{ type: "saisie" }]);
    }
  });

  it("exemple du propriétaire : label Sophia+Unswipe réglé 100 % Unswipe — permis, exclusif", () => {
    const v = valider(choix({ labelId: CLEAN.id, repartition: "unique", appUnique: "unswipe" }));
    expect(v.ok).toBe(true);
    expect(v.parts).toEqual({ unswipe: 100 });
    expect(v.infos).toEqual([{ type: "exclusif", apps: ["Unswipe"] }]);
  });

  it("label qui ne sert pas une application à part > 0 : bloqué, avec les manquantes", () => {
    // Detox ne sert qu'Unswipe : 70 % Sophia est impossible.
    const v = valider(choix({ labelId: DETOX.id, repartition: "perso", perso: { sophia: 70, unswipe: 30 } }));
    expect(v.ok).toBe(false);
    expect(v.erreurs).toEqual([{ type: "labelIncompatible", label: "Detox", apps: ["Sophia"] }]);
  });

  it("label sans ligne = Sophia : 100 % Unswipe incompatible, 100 % Sophia permis", () => {
    expect(valider(choix({ labelId: CINEMA.id, repartition: "unique", appUnique: "unswipe" })).erreurs).toEqual([
      { type: "labelIncompatible", label: "Cinéma", apps: ["Unswipe"] },
    ]);
    expect(valider(choix({ labelId: CINEMA.id, repartition: "unique", appUnique: "sophia" })).ok).toBe(true);
  });

  it("label Automatique + répartition : label choisi par manage-users, File non utilisée", () => {
    const v = valider(choix({ repartition: "perso", perso: { sophia: 70, unswipe: 30 } }));
    expect(v.ok).toBe(true);
    expect(v.infos).toEqual([
      { type: "labelAuto", apps: ["Sophia", "Unswipe"] },
      { type: "exclusif", apps: ["Sophia", "Unswipe"] },
    ]);
  });

  it("label Automatique : aucun label slideshow ne sert tout → bloqué (Hook / UGC ne comptent pas)", () => {
    const liens = [...LIENS, { label_id: HOOK.id, application_id: ID_ZEN }, { label_id: UGC.id, application_id: ID_ZEN }];
    const v = validerChoixCreation({
      choix: choix({ repartition: "unique", appUnique: "zen" }),
      applications: APPS,
      liens,
      labels: LABELS,
      langue: "fr",
    });
    expect(v.erreurs).toEqual([{ type: "aucunLabel", apps: ["Zen"] }]);
  });

  it("liens illisibles : rien ne bloque, manage-users revalidera", () => {
    const v = validerChoixCreation({
      choix: choix({ labelId: DETOX.id, repartition: "unique", appUnique: "sophia" }),
      applications: APPS,
      liens: null,
      labels: LABELS,
    });
    expect(v.ok).toBe(true);
  });

  it("application qui ne cible pas la langue : avertissement, pas de blocage", () => {
    const v = valider(choix({ labelId: CLEAN.id, repartition: "unique", appUnique: "unswipe" }), "de");
    expect(v.ok).toBe(true);
    expect(v.infos).toContainEqual({ type: "langue", app: "Unswipe", langue: "de" });
  });
});

describe("listes proposées", () => {
  it("applications actives, Sophia d'abord", () => {
    expect(applicationsProposees(APPS).map((a) => a.slug)).toEqual(["sophia", "unswipe"]);
  });

  it("labels de la File slideshow : ni Hook ni UGC AI VIDEO", () => {
    expect(labelsProposes(LABELS).map((l) => l.id)).toEqual([CLEAN.id, DETOX.id, CINEMA.id]);
  });

  it("Personnalisée repart de l'affichage : défaut = Sophia 100, préréglage = son application", () => {
    const apps = applicationsProposees(APPS);
    expect(persoInitial(CHOIX_CREATION_DEFAUT, apps)).toEqual({ sophia: 100, unswipe: 0 });
    expect(persoInitial(choix({ repartition: "unique", appUnique: "unswipe" }), apps)).toEqual({
      sophia: 0,
      unswipe: 100,
    });
  });
});

describe("defautDuLabel", () => {
  it("Automatique : on ne sait pas encore", () => {
    expect(defautDuLabel(null, LIENS, APPS)).toBeNull();
  });
  it("label qui sert Sophia : 100 % Sophia", () => {
    expect(defautDuLabel(CLEAN.id, LIENS, APPS)).toEqual({ type: "sophia" });
    expect(defautDuLabel(CINEMA.id, LIENS, APPS)).toEqual({ type: "sophia" });
  });
  it("label qui ne sert qu'Unswipe : 100 % Unswipe", () => {
    expect(defautDuLabel(DETOX.id, LIENS, APPS)).toEqual({ type: "unique", app: "Unswipe" });
  });
  it("plusieurs sans Sophia : parts égales", () => {
    const liens = [...LIENS, { label_id: DETOX.id, application_id: ID_ZEN }];
    expect(defautDuLabel(DETOX.id, liens, APPS)).toEqual({ type: "egales", apps: ["Unswipe", "Zen"] });
  });
});

describe("cleErreurChoixCompte", () => {
  it("les 5 codes du contrat, seuls ou dans un texte", () => {
    expect(cleErreurChoixCompte(new Error("CHOIX_COMPTE_ADMIN"))).toBe("choixCompteCreation.erreurs.CHOIX_COMPTE_ADMIN");
    expect(cleErreurChoixCompte(new Error("REPARTITION_INVALIDE"))).toBe(
      "choixCompteCreation.erreurs.REPARTITION_INVALIDE",
    );
    expect(cleErreurChoixCompte(new Error("LABEL_INCOMPATIBLE: detox"))).toBe(
      "choixCompteCreation.erreurs.LABEL_INCOMPATIBLE",
    );
    expect(cleErreurChoixCompte(new Error("CHOIX_COMPTE_INCOMPATIBLE"))).toBe(
      "choixCompteCreation.erreurs.CHOIX_COMPTE_INCOMPATIBLE",
    );
    expect(cleErreurChoixCompte(new Error("NO_LABELS_APPLICATION"))).toBe(
      "choixCompteCreation.erreurs.NO_LABELS_APPLICATION",
    );
  });
  it("les autres erreurs gardent leur affichage habituel", () => {
    expect(cleErreurChoixCompte(new Error("NO_LABELS"))).toBeNull();
    expect(cleErreurChoixCompte(new Error("CM_LANGUE_PRISE"))).toBeNull();
    expect(cleErreurChoixCompte(null)).toBeNull();
  });
});
