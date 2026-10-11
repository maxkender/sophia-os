/**
 * File des créateurs PAR APPLICATION (Réglages) : tranche éditée, labels
 * proposés, entrées signalées. La tranche Sophia s'écrit exactement comme
 * avant (file racine recopiée).
 */
import { describe, expect, it } from "vitest";

import type { ReglagesFileLabels } from "../types";
import {
  avecItemsApplication,
  entreeHorsApplication,
  fileDeLApplication,
  itemsDeLaFile,
  labelsAjoutables,
  ugcPossible,
} from "./fileApplication";

const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";
const ID_MICABO = "00000000-0000-4000-8000-000000000005";

const SMART = { id: "l-smart", slug: "smart_girl", nom: "Smart Girl" };
const CLASSIC = { id: "l-classic", slug: "classic-study", nom: "Classic Study" };
const MEDICAL = { id: "l-medical", slug: "medical-study", nom: "Medical Study" };
const UGC = { id: "l-ugc", slug: "ugc-x", nom: "UGC X", ugc_ai_video: true };
const LABELS = [SMART, CLASSIC, MEDICAL, UGC];
const LIENS = [
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
  it("seulement les labels slideshow qui servent l'application (héritage Sophia)", () => {
    expect(labelsAjoutables(ID_SOPHIA, LABELS, LIENS).map((l) => l.id)).toEqual([SMART.id]);
    expect(labelsAjoutables(ID_UNSWIPE, LABELS, LIENS).map((l) => l.id)).toEqual([CLASSIC.id, MEDICAL.id]);
    expect(labelsAjoutables(ID_MICABO, LABELS, LIENS).map((l) => l.id)).toEqual([MEDICAL.id]);
  });
  it("liens pas encore lus : rien n'est proposé ; table absente ([]) : tout sert Sophia", () => {
    expect(labelsAjoutables(ID_SOPHIA, LABELS, null)).toEqual([]);
    expect(labelsAjoutables(ID_SOPHIA, LABELS, []).map((l) => l.id)).toEqual([SMART.id, CLASSIC.id, MEDICAL.id]);
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
