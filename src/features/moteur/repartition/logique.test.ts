import { describe, expect, it } from "vitest";

import { ID_SOPHIA, type ApplicationMoteur } from "../multiApp";
import {
  curseursBornes,
  etatPartsCompte,
  nomApplicationPromue,
  nomsApplicationsDuLabel,
  partsDepuisCurseurs,
  posterServiApplication,
  resumeParts,
} from "./logique";

const ID_UNSWIPE = "00000000-0000-4000-8000-000000000003";

const SOPHIA: ApplicationMoteur = { id: ID_SOPHIA, slug: "sophia", nom: "Sophia", langues: null, actif: true };
const UNSWIPE: ApplicationMoteur = {
  id: ID_UNSWIPE,
  slug: "unswipe",
  nom: "Unswipe",
  langues: ["fr", "en"],
  actif: true,
};
const APPS = [SOPHIA, UNSWIPE];

const CLEAN = { id: "l-clean", slug: "clean-girl", nom: "Clean Girl" };
const CINEMA = { id: "l-cinema", slug: "cinema", nom: "Cinéma" };
const HOOK = { id: "l-hook", slug: "hook", nom: "Hook" };

/** Clean Girl sert Sophia + Unswipe ; Cinéma n'a aucune ligne (= Sophia). */
const LIENS = [
  { label_id: CLEAN.id, application_id: ID_SOPHIA },
  { label_id: CLEAN.id, application_id: ID_UNSWIPE },
];

describe("nomApplicationPromue", () => {
  it("nomme l'application du post, Sophia si absente ou inconnue", () => {
    expect(nomApplicationPromue(ID_UNSWIPE, APPS)).toBe("Unswipe");
    expect(nomApplicationPromue(ID_SOPHIA, APPS)).toBe("Sophia");
    expect(nomApplicationPromue(null, APPS)).toBe("Sophia");
    expect(nomApplicationPromue(undefined, [])).toBe("Sophia");
    expect(nomApplicationPromue("inconnue", APPS)).toBe("Sophia");
  });
});

describe("applications d'un label", () => {
  it("un label sans ligne sert Sophia", () => {
    expect(nomsApplicationsDuLabel(CINEMA.id, LIENS, APPS)).toEqual(["Sophia"]);
    expect(nomsApplicationsDuLabel(CLEAN.id, LIENS, APPS).sort()).toEqual(["Sophia", "Unswipe"]);
  });

  it("filtre Posters : au moins un compte dont les labels servent l'application", () => {
    expect(posterServiApplication([[CINEMA], [CLEAN]], LIENS, ID_UNSWIPE)).toBe(true);
    expect(posterServiApplication([[CINEMA]], LIENS, ID_UNSWIPE)).toBe(false);
    // Compte sans label, ou seulement des labels système : Sophia.
    expect(posterServiApplication([[]], LIENS, ID_SOPHIA)).toBe(true);
    expect(posterServiApplication([[HOOK]], LIENS, ID_SOPHIA)).toBe(true);
    expect(posterServiApplication([], LIENS, ID_SOPHIA)).toBe(false);
  });
});

describe("curseurs de répartition", () => {
  it("arrondit au pas de 10 et garde un total ≤ 100", () => {
    expect(curseursBornes({ unswipe: 33 })).toEqual({ unswipe: 30 });
    expect(curseursBornes({ a: 70, b: 60 })).toEqual({ a: 70, b: 30 });
    expect(curseursBornes({ a: -5 })).toEqual({ a: 0 });
  });

  it("Sophia = 100 − les autres ; rien hors Sophia = null (100 % Sophia)", () => {
    expect(partsDepuisCurseurs({ unswipe: 30 })).toEqual({ sophia: 70, unswipe: 30 });
    expect(partsDepuisCurseurs({ unswipe: 100 })).toEqual({ unswipe: 100 });
    expect(partsDepuisCurseurs({ unswipe: 0 })).toBeNull();
    expect(partsDepuisCurseurs({})).toBeNull();
  });

  it("résume dans l'ordre Sophia d'abord", () => {
    expect(resumeParts({ unswipe: 30, sophia: 70 }, APPS)).toBe("Sophia 70 % · Unswipe 30 %");
  });
});

describe("etatPartsCompte", () => {
  const compte = { langue: "fr", ugc_ai: false, parts_applications: null };

  it("compte Sophia seul : rien à afficher, 100 % Sophia", () => {
    const e = etatPartsCompte({ compte, labels: [CINEMA], liens: LIENS, applications: APPS });
    expect(e.afficher).toBe(false);
    expect(e.autres).toEqual([]);
    expect(e.effectives).toEqual({ sophia: 100 });
    expect(e.avertissements).toEqual([]);
  });

  it("label partagé : un curseur Unswipe, initialisé depuis la répartition", () => {
    const e = etatPartsCompte({
      compte: { ...compte, parts_applications: { sophia: 70, unswipe: 30 } },
      labels: [CLEAN, CINEMA],
      liens: LIENS,
      applications: APPS,
    });
    expect(e.afficher).toBe(true);
    expect(e.servies.map((a) => a.slug)).toEqual(["sophia", "unswipe"]);
    expect(e.autres.map((a) => a.slug)).toEqual(["unswipe"]);
    expect(e.curseurs).toEqual({ unswipe: 30 });
    expect(e.effectives).toEqual({ sophia: 70, unswipe: 30 });
    expect(e.avertissements).toEqual([]);
  });

  it("prévient : application éteinte, langue non ciblée, compte UGC", () => {
    const eteinte = etatPartsCompte({
      compte: { ...compte, parts_applications: { unswipe: 30 } },
      labels: [CLEAN],
      liens: LIENS,
      applications: [SOPHIA, { ...UNSWIPE, actif: false }],
    });
    expect(eteinte.avertissements).toEqual([{ type: "inactive", app: "Unswipe" }]);
    expect(eteinte.effectives).toEqual({ sophia: 100 });

    const langue = etatPartsCompte({
      compte: { ...compte, langue: "de", parts_applications: { unswipe: 30 } },
      labels: [CLEAN],
      liens: LIENS,
      applications: APPS,
    });
    expect(langue.avertissements).toEqual([{ type: "langue", app: "Unswipe", langue: "de" }]);
    expect(langue.effectives).toEqual({ sophia: 100 });

    const ugc = etatPartsCompte({
      compte: { ...compte, ugc_ai: true, parts_applications: { unswipe: 30 } },
      labels: [CLEAN],
      liens: LIENS,
      applications: APPS,
    });
    expect(ugc.avertissements).toEqual([{ type: "ugc" }]);
    expect(ugc.effectives).toEqual({ sophia: 100 });
  });

  it("répartition enregistrée devenue sans objet : affichée pour être réinitialisée", () => {
    const e = etatPartsCompte({
      compte: { ...compte, parts_applications: { sophia: 70, unswipe: 30 } },
      labels: [CINEMA],
      liens: LIENS,
      applications: APPS,
    });
    expect(e.afficher).toBe(true);
    expect(e.autres).toEqual([]);
    expect(e.avertissements).toEqual([{ type: "obsolete", app: "Unswipe" }]);
    expect(e.effectives).toEqual({ sophia: 100 });
  });

  it("labels qui ne servent QUE Unswipe : Sophia non servie, 100 % Unswipe", () => {
    const liens = [{ label_id: CLEAN.id, application_id: ID_UNSWIPE }];
    const e = etatPartsCompte({ compte, labels: [CLEAN], liens, applications: APPS });
    expect(e.servies.map((a) => a.slug)).toEqual(["unswipe"]);
    // Une seule application servie : pas de curseur à régler, rien à afficher.
    expect(e.afficher).toBe(false);
    expect(e.effectives).toEqual({ unswipe: 100 });
  });
});
