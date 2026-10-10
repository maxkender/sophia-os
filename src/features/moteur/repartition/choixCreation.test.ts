/**
 * Choix de l'APPLICATION à la création d'un compte (le label n'est pas
 * choisi : manage-users le tire de la File de cette application) : ce qui part
 * dans le corps manage-users, et ce qui bloque l'envoi.
 */
import { describe, expect, it } from "vitest";

import {
  applicationsProposees,
  CHOIX_CREATION_DEFAUT,
  choixApplicationVisible,
  cleErreurChoixCompte,
  labelsDeLApplication,
  optionsDuChoix,
  peutChoisirApplicationsCompte,
  validerChoixCreation,
  type ChoixCreation,
} from "./choixCreation";

const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";
const ID_MICABO = "00000000-0000-4000-8000-000000000005";
const ID_ZEN = "00000000-0000-4000-8000-000000000009";
const APPS = [
  { id: ID_UNSWIPE, slug: "unswipe", nom: "Unswipe", langues: ["fr", "en", "de", "it", "es", "tr"], actif: true },
  { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", langues: null, actif: true },
  { id: ID_MICABO, slug: "micabo", nom: "Micabo", langues: null, actif: true },
  { id: ID_ZEN, slug: "zen", nom: "Zen", langues: null, actif: false },
];
/** Smart Girl sans ligne (= Sophia) ; Medical Study sert Micabo + Unswipe ; UGC X est UGC AI vidéo. */
const SMART = { id: "l-smart", slug: "smart_girl", nom: "Smart Girl" };
const MEDICAL = { id: "l-medical", slug: "medical-study", nom: "Medical Study" };
const MICABO_SEUL = { id: "l-mic", slug: "mic", nom: "Mic" };
const UGC_UNSWIPE = { id: "l-ugc", slug: "ugc-x", nom: "UGC X", ugc_ai_video: true };
const LABELS = [SMART, MEDICAL, MICABO_SEUL, UGC_UNSWIPE];
const LIENS = [
  { label_id: MEDICAL.id, application_id: ID_MICABO },
  { label_id: MEDICAL.id, application_id: ID_UNSWIPE },
  { label_id: MICABO_SEUL.id, application_id: ID_MICABO },
  { label_id: UGC_UNSWIPE.id, application_id: ID_UNSWIPE },
];

const choix = (application: string): ChoixCreation => ({ application });
const valider = (c: ChoixCreation, langue: string | null = "fr", liens = LIENS, labels = LABELS) =>
  validerChoixCreation({ choix: c, applications: APPS, liens, labels, langue });

describe("peutChoisirApplicationsCompte", () => {
  it("tous les rôles qui créent des comptes de créateurs", () => {
    expect(peutChoisirApplicationsCompte("admin")).toBe(true);
    expect(peutChoisirApplicationsCompte("head_of_ops")).toBe(true);
    expect(peutChoisirApplicationsCompte("hiring_manager")).toBe(true);
    expect(peutChoisirApplicationsCompte("directing_manager")).toBe(true);
    expect(peutChoisirApplicationsCompte("poster")).toBe(false);
    expect(peutChoisirApplicationsCompte(null)).toBe(false);
  });
});

describe("ce qui part dans le corps", () => {
  it("défaut = Sophia : aucune clé (corps d'avant à l'octet près)", () => {
    expect(CHOIX_CREATION_DEFAUT).toEqual({ application: "sophia" });
    expect(optionsDuChoix(CHOIX_CREATION_DEFAUT)).toStrictEqual({});
    expect(optionsDuChoix(choix(""))).toStrictEqual({});
  });

  it("autre application : { slug: 100 }, jamais de label", () => {
    expect(optionsDuChoix(choix("unswipe"))).toStrictEqual({ partsApplications: { unswipe: 100 } });
    expect("labelId" in optionsDuChoix(choix("unswipe"))).toBe(false);
  });
});

describe("applications proposées et visibilité", () => {
  it("les actives, Sophia d'abord puis par nom", () => {
    expect(applicationsProposees(APPS).map((a) => a.slug)).toEqual(["sophia", "micabo", "unswipe"]);
  });
  it("le bloc n'apparaît qu'à partir de deux applications actives", () => {
    expect(choixApplicationVisible(APPS)).toBe(true);
    expect(choixApplicationVisible(APPS.filter((a) => a.slug === "sophia" || a.slug === "zen"))).toBe(false);
    expect(choixApplicationVisible(null)).toBe(false);
    expect(choixApplicationVisible(undefined)).toBe(false);
  });
});

describe("labelsDeLApplication", () => {
  it("label_applications avec héritage Sophia, labels slideshow seulement", () => {
    expect(labelsDeLApplication(ID_SOPHIA, LABELS, LIENS).map((l) => l.id)).toEqual([SMART.id]);
    // UGC X sert Unswipe mais est UGC AI vidéo : jamais posé par la File.
    expect(labelsDeLApplication(ID_UNSWIPE, LABELS, LIENS).map((l) => l.id)).toEqual([MEDICAL.id]);
    expect(labelsDeLApplication(ID_MICABO, LABELS, LIENS).map((l) => l.id)).toEqual([
      MEDICAL.id,
      MICABO_SEUL.id,
    ]);
  });
  it("la colonne historique labels.application_id n'est pas lue", () => {
    const labels = [{ ...SMART, application_id: ID_UNSWIPE }];
    expect(labelsDeLApplication(ID_UNSWIPE, labels, LIENS)).toEqual([]);
    expect(labelsDeLApplication(ID_SOPHIA, labels, LIENS).map((l) => l.id)).toEqual([SMART.id]);
  });
});

describe("validerChoixCreation", () => {
  it("Sophia ne bloque jamais, même sans aucune lecture", () => {
    expect(valider(CHOIX_CREATION_DEFAUT)).toMatchObject({ ok: true, erreurs: [], infos: [] });
    expect(
      validerChoixCreation({ choix: CHOIX_CREATION_DEFAUT, applications: null, liens: null, labels: null }),
    ).toMatchObject({ ok: true, erreurs: [], infos: [] });
    // Même si aucun label ne sert Sophia : c'est le chemin d'avant, manage-users décide.
    expect(valider(CHOIX_CREATION_DEFAUT, "fr", LIENS, [MEDICAL])).toMatchObject({ ok: true });
  });

  it("Unswipe avec un label qui la sert : ok, sans info pour une langue ciblée", () => {
    const v = valider(choix("unswipe"));
    expect(v.ok).toBe(true);
    expect(v.application?.slug).toBe("unswipe");
    expect(v.infos).toEqual([]);
  });

  it("aucun label slideshow ne sert l'application : envoi bloqué", () => {
    const v = valider(choix("unswipe"), "fr", LIENS, [SMART, MICABO_SEUL, UGC_UNSWIPE]);
    expect(v.ok).toBe(false);
    expect(v.erreurs).toEqual([{ type: "aucunLabel", app: "Unswipe" }]);
  });

  it("application qui ne cible pas la langue : information, pas de blocage", () => {
    const v = valider(choix("unswipe"), "da");
    expect(v.ok).toBe(true);
    expect(v.infos).toEqual([{ type: "langue", app: "Unswipe", langue: "da" }]);
  });

  it("application éteinte ou inconnue : bloqué", () => {
    expect(valider(choix("zen")).erreurs).toEqual([{ type: "applicationInactive", app: "Zen" }]);
    expect(valider(choix("fantome")).erreurs).toEqual([{ type: "applicationInactive", app: "fantome" }]);
  });

  it("lectures absentes : rien ne bloque (manage-users revalide)", () => {
    expect(
      validerChoixCreation({ choix: choix("unswipe"), applications: APPS, liens: null, labels: LABELS }).ok,
    ).toBe(true);
    expect(
      validerChoixCreation({ choix: choix("unswipe"), applications: null, liens: LIENS, labels: LABELS }).ok,
    ).toBe(true);
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
