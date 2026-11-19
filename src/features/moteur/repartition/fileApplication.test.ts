/**
 * File des créateurs PAR APPLICATION (Réglages) : tranche éditée, labels
 * proposés, entrées signalées. La tranche Sophia s'écrit exactement comme
 * avant (file racine recopiée).
 */
import { describe, expect, it } from "vitest";

import type { ReglagesFileLabels } from "../types";
import {
  AJOUT_MAX_FILE,
  applicationsDeLaFile,
  avecEntreesAjoutees,
  avecGroupeDeplace,
  avecItemsApplication,
  entreeHorsApplication,
  fileDeLApplication,
  groupesDeLaFile,
  itemsDeLaFile,
  labelsAjoutables,
  labelsDesAutresApplications,
  lireLabelAutre,
  nombreAjout,
  sansEntreesDuGroupe,
  tirerDeLaFile,
  ugcPossible,
  valeurLabelAutre,
} from "./fileApplication";

const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";
const ID_MICABO = "00000000-0000-4000-8000-000000000005";

const SMART = { id: "l-smart", slug: "smart_girl", nom: "Smart Girl" };
const CLASSIC = { id: "l-classic", slug: "classic-study", nom: "Classic Study" };
const MEDICAL = { id: "l-medical", slug: "medical-study", nom: "Medical Study" };
const UGC = { id: "l-ugc", slug: "ugcv", nom: "UGCV", manuel: true };
const LABELS = [SMART, CLASSIC, MEDICAL, UGC];
const LIENS = [
  { label_id: SMART.id, application_id: ID_SOPHIA },
  { label_id: CLASSIC.id, application_id: ID_UNSWIPE },
  { label_id: MEDICAL.id, application_id: ID_MICABO },
  { label_id: MEDICAL.id, application_id: ID_UNSWIPE },
  { label_id: UGC.id, application_id: ID_UNSWIPE },
];

/** État prod d'aujourd'hui : seule la tranche Sophia est remplie (smart_girl en da et he). */
const PROD: ReglagesFileLabels = {
  items: [],
  par_langue: { da: [{ label_id: SMART.id, ugc: false }], he: [{ label_id: SMART.id, ugc: false }] },
  par_application: {
    sophia: {
      items: [],
      par_langue: { da: [{ label_id: SMART.id, ugc: false }], he: [{ label_id: SMART.id, ugc: false }] },
    },
  },
};

describe("tranche d'une application", () => {
  it("lit la tranche, vide pour une application sans tranche", () => {
    expect(itemsDeLaFile(fileDeLApplication(PROD, "sophia"), "da")).toEqual([{ label_id: SMART.id, ugc: false }]);
    expect(fileDeLApplication(PROD, "unswipe")).toEqual({ items: [], par_langue: {} });
  });

  it("Sophia : écrite comme avant (tranche ET file racine), les autres intactes", () => {
    const avecUnswipe = avecItemsApplication(PROD, "unswipe", "fr", [{ label_id: CLASSIC.id, ugc: false }]);
    const r = avecItemsApplication(avecUnswipe, "sophia", "general", [{ label_id: SMART.id, ugc: true }]);
    expect(r).toStrictEqual({
      items: [{ label_id: SMART.id, ugc: true }],
      par_langue: PROD.par_langue,
      par_application: {
        sophia: { items: [{ label_id: SMART.id, ugc: true }], par_langue: PROD.par_langue },
        unswipe: { items: [], par_langue: { fr: [{ label_id: CLASSIC.id, ugc: false }] } },
      },
    });
  });

  it("autre application : seule sa tranche change, la file racine (Sophia) ne bouge pas", () => {
    const r = avecItemsApplication(PROD, "unswipe", "general", [{ label_id: CLASSIC.id, ugc: false }]);
    expect(r.items).toBe(PROD.items);
    expect(r.par_langue).toBe(PROD.par_langue);
    expect(r.par_application?.sophia).toBe(PROD.par_application?.sophia);
    expect(r.par_application?.unswipe).toEqual({ items: [{ label_id: CLASSIC.id, ugc: false }], par_langue: {} });
  });

  it("vider une file langue retire la clé", () => {
    const r = avecItemsApplication(PROD, "sophia", "da", []);
    expect(Object.keys(r.par_langue)).toEqual(["he"]);
    expect(Object.keys(r.par_application!.sophia!.par_langue)).toEqual(["he"]);
  });
});

describe("labels proposés et entrées signalées", () => {
  it("seulement les labels slideshow qui servent l'application (cochée)", () => {
    expect(labelsAjoutables(ID_SOPHIA, LABELS, LIENS).map((l) => l.id)).toEqual([SMART.id]);
    expect(labelsAjoutables(ID_UNSWIPE, LABELS, LIENS).map((l) => l.id)).toEqual([CLASSIC.id, MEDICAL.id]);
    expect(labelsAjoutables(ID_MICABO, LABELS, LIENS).map((l) => l.id)).toEqual([MEDICAL.id]);
  });
  it("liens pas encore lus : rien ; « tous » (liens illisibles, File Sophia) : tous les slideshow ; aucun lien : personne", () => {
    expect(labelsAjoutables(ID_SOPHIA, LABELS, null)).toEqual([]);
    expect(labelsAjoutables(ID_SOPHIA, LABELS, "tous").map((l) => l.id)).toEqual([SMART.id, CLASSIC.id, MEDICAL.id]);
    expect(labelsAjoutables(ID_SOPHIA, LABELS, [])).toEqual([]);
    expect(labelsAjoutables(ID_UNSWIPE, LABELS, [])).toEqual([]);
  });
  it("une entrée dont le label ne sert plus l'application est signalée", () => {
    expect(entreeHorsApplication({ label_id: SMART.id, ugc: false }, ID_UNSWIPE, LIENS)).toBe(true);
    expect(entreeHorsApplication({ label_id: CLASSIC.id, ugc: false }, ID_UNSWIPE, LIENS)).toBe(false);
    expect(entreeHorsApplication({ label_id: CLASSIC.id, ugc: false }, ID_SOPHIA, LIENS)).toBe(true);
    expect(entreeHorsApplication({ label_id: CLASSIC.id, ugc: false }, ID_SOPHIA, null)).toBe(false);
  });
  it("UGC : Sophia seulement", () => {
    expect(ugcPossible("sophia")).toBe(true);
    expect(ugcPossible("unswipe")).toBe(false);
  });
});

describe("tirage par langue", () => {
  it("un compte pt-br tire la file pt-BR", () => {
    const file: ReglagesFileLabels = {
      items: [],
      par_langue: { "pt-BR": [{ label_id: SMART.id, ugc: false }] },
      par_application: {},
    };
    const r = tirerDeLaFile(file, "sophia", "pt-br", [SMART.id]);
    expect(r.item).toEqual({ label_id: SMART.id, ugc: false });
    expect(itemsDeLaFile(fileDeLApplication(r.file, "sophia"), "pt-BR")).toEqual([]);
  });
});

describe("les applications dont la File s'édite", () => {
  const APPS = [
    { slug: "micabo", nom: "micabo", actif: true },
    { slug: "atala", nom: "Atala", actif: false },
    { slug: "sophia", nom: "Sophia", actif: true },
    { slug: "vieille", nom: "Vieille", actif: false },
  ];

  it("sans application en préparation : les actives, Sophia d'abord", () => {
    expect(applicationsDeLaFile(APPS).map((a) => a.slug)).toEqual(["sophia", "micabo"]);
  });

  it("une application en préparation a sa File, une inactive sans label non", () => {
    // Atala au 19/11 : inactive, mais ses comptes se recrutent déjà. Sans
    // File, impossible de dire dans quel label ils partent.
    expect(applicationsDeLaFile(APPS, ["atala"]).map((a) => a.slug)).toEqual(["sophia", "atala", "micabo"]);
  });
});

describe("décider le label des N prochains comptes", () => {
  const A = { label_id: "l-a", ugc: false };
  const B = { label_id: "l-b", ugc: false };

  it("un ajout de 50 pose 50 entrées : une entrée = un compte", () => {
    const file = avecEntreesAjoutees([A], B, 50);
    expect(file).toHaveLength(51);
    expect(file.slice(1).every((x) => x.label_id === "l-b")).toBe(true);
    // Chaque entrée est sa propre valeur : en retoucher une ne touche pas les autres.
    expect(file[1]).not.toBe(file[2]);
  });

  it("le nombre saisi est borné : jamais zéro, jamais une faute de frappe à 5000", () => {
    expect(nombreAjout("")).toBe(1);
    expect(nombreAjout(0)).toBe(1);
    expect(nombreAjout(-3)).toBe(1);
    expect(nombreAjout("12.9")).toBe(12);
    expect(nombreAjout(5000)).toBe(AJOUT_MAX_FILE);
  });

  it("la File s'affiche par groupes, sans changer son ordre", () => {
    const file = [A, A, A, B, A];
    expect(groupesDeLaFile(file).map((g) => [g.item.label_id, g.debut, g.n])).toEqual([
      ["l-a", 0, 3],
      ["l-b", 3, 1],
      ["l-a", 4, 1],
    ]);
    expect(groupesDeLaFile([])).toEqual([]);
  });

  it("une entrée UGC et une entrée normale du même label ne font pas un groupe", () => {
    const file = [A, { ...A, ugc: true }];
    expect(groupesDeLaFile(file).map((g) => g.n)).toEqual([1, 1]);
  });

  it("retirer un compte d'un groupe, ou le groupe entier", () => {
    const file = [A, A, A, B];
    expect(sansEntreesDuGroupe(file, 0, 1)).toEqual([A, A, B]);
    expect(sansEntreesDuGroupe(file, 0)).toEqual([B]);
    expect(sansEntreesDuGroupe(file, 1)).toEqual([A, A, A]);
    // Groupe inconnu : rien ne bouge.
    expect(sansEntreesDuGroupe(file, 7)).toEqual(file);
  });

  it("un groupe se déplace en bloc, et rejoint son voisin du même label", () => {
    const file = [A, A, B, A];
    // B monte devant les deux A : les trois A se retrouvent ensemble.
    const monte = avecGroupeDeplace(file, 1, -1);
    expect(monte).toEqual([B, A, A, A]);
    expect(groupesDeLaFile(monte).map((g) => g.n)).toEqual([1, 3]);
    expect(avecGroupeDeplace(file, 0, 1)).toEqual([B, A, A, A]);
    // Aux extrémités, rien ne bouge.
    expect(avecGroupeDeplace(file, 0, -1)).toEqual(file);
    expect(avecGroupeDeplace(file, 2, 1)).toEqual(file);
  });
});

describe("les labels des autres applications dans « Ajouter un label »", () => {
  const APPS = [
    { id: ID_SOPHIA, slug: "sophia" },
    { id: ID_UNSWIPE, slug: "unswipe" },
    { id: ID_MICABO, slug: "micabo" },
    { id: "id-vide", slug: "vide" },
  ];

  it("depuis Sophia : un groupe par autre application, avec les labels qui la servent", () => {
    const groupes = labelsDesAutresApplications(APPS, "sophia", LABELS, LIENS);
    expect(groupes.map((g) => [g.application.slug, g.labels.map((l) => l.id)])).toEqual([
      // Le label manuel (UGCV) n'est jamais proposé, même s'il « sert » Unswipe.
      ["unswipe", [CLASSIC.id, MEDICAL.id]],
      ["micabo", [MEDICAL.id]],
      // « vide » n'a aucun label : pas de groupe.
    ]);
  });

  it("l'application qu'on édite n'est pas répétée dans les autres", () => {
    const slugs = labelsDesAutresApplications(APPS, "unswipe", LABELS, LIENS).map((g) => g.application.slug);
    expect(slugs).toEqual(["sophia", "micabo"]);
  });

  it("liens illisibles : aucun groupe, on ne sait pas qui sert quoi", () => {
    expect(labelsDesAutresApplications(APPS, "sophia", LABELS, null)).toEqual([]);
  });

  it("la valeur d'une option se relit, et un label de l'application affichée n'en est pas une", () => {
    const v = valeurLabelAutre("atala", "c9a8b949-c97c-4feb-b74d-0935bc7eb91c");
    expect(lireLabelAutre(v)).toEqual({ slug: "atala", labelId: "c9a8b949-c97c-4feb-b74d-0935bc7eb91c" });
    expect(lireLabelAutre("c9a8b949-c97c-4feb-b74d-0935bc7eb91c")).toBeNull();
    expect(lireLabelAutre("")).toBeNull();
  });
});
