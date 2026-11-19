import { describe, expect, it } from "vitest";

import { compterPropositions, jourDe, jourEnLettres, type Proposition, rangerPropositions } from "./propositions";
import { sectionDuLabel } from "./sources";
import type { CarteLabel } from "./moodboard";
import type { LabelBible } from "./types";

const SOPHIA = "00000000-0000-4000-8000-000000000001";
const MICABO = "00000000-0000-4000-8000-000000000002";
const ATALA = "00000000-0000-4000-8000-000000000004";

const proposition = (o: Partial<Proposition>): Proposition => ({
  id: "p1", handle: "un.compte", langue: "en", sorte: "label", labelId: "L1", labelNom: "smart_girl", concept: null, pourquoi: "", risques: null, score: 50,
  piste: "accroches", statut: "propose", raisonRefus: null, note: null, creeLe: "2026-11-19T07:00:00Z",
  chiffres: { posts: null, slideshows: null, vuesMediane: null, vuesMax: null, posts10k: null, posts100k: null, abonnes: null, postsTotal: null, dernierSlideshow: null, releveLe: null },
  exemples: [], ...o,
});
const labels: LabelBible[] = [
  { id: "L1", nom: "smart_girl", style_theme: null, application_id: SOPHIA, apps: [SOPHIA] },
  { id: "L2", nom: "classic_study", style_theme: null, application_id: MICABO, apps: [MICABO] },
  { id: "L3", nom: "white_female_run", style_theme: null, application_id: ATALA, apps: [ATALA] },
  { id: "L4", nom: "beau_smart_girl", style_theme: null, application_id: SOPHIA, apps: [MICABO, SOPHIA] },
];
const carte = (o: Partial<CarteLabel>): CarteLabel => ({
  id: "k1", nom: "smart_girl", titre: null, section: "sophia", badge: "existe", description_da: null, label_id: "L1", ordre: 1, statut: "valide", ...o,
});
const sectionDe = (id: string) => sectionDuLabel(id, [], labels);

describe("les propositions de l'éclaireur, par jour", () => {
  const toutes = [
    proposition({ id: "a", handle: "hier.soir", creeLe: "2026-11-18T22:30:00Z", score: 60 }),          // 23 h 30 à Paris : le 18
    proposition({ id: "b", handle: "nuit", creeLe: "2026-11-18T23:30:00Z", score: 40 }),               // 0 h 30 à Paris : le 19
    proposition({ id: "c", handle: "matin", creeLe: "2026-11-19T07:00:00Z", score: 90, sorte: "concept", labelId: null, labelNom: null, concept: "Chaque tableau a un secret" }),
    proposition({ id: "d", handle: "etude", creeLe: "2026-11-15T10:00:00Z", statut: "plus_tard", labelId: "L2", labelNom: "classic_study" }),
  ];
  const handles = (f: Partial<Parameters<typeof rangerPropositions>[1]>) =>
    rangerPropositions(toutes, { statut: "toutes", recherche: "", section: "", ...f }, sectionDe).map((j) => [j.jour, j.propositions.map((p) => p.handle)]);

  it("le jour est celui de Paris ; le plus récent d'abord, et dans un jour le meilleur score d'abord", () => {
    expect(jourDe("2026-11-18T22:30:00Z")).toBe("2026-11-18");
    expect(jourDe("2026-11-18T23:30:00Z")).toBe("2026-11-19");
    expect(jourEnLettres("2026-11-19")).toBe("jeudi 19 novembre");
    expect(handles({})).toEqual([["2026-11-19", ["matin", "nuit"]], ["2026-11-18", ["hier.soir"]], ["2026-11-15", ["etude"]]]);
    expect(compterPropositions(toutes)).toEqual({ toutes: 4, a_decider: 3, plus_tard: 1 });
  });

  it("filtres : à décider ou plus tard, recherche (handle, label, concept), app du label proposé", () => {
    expect(handles({ statut: "plus_tard" })).toEqual([["2026-11-15", ["etude"]]]);
    expect(handles({ statut: "a_decider" }).flatMap((j) => j[1])).toEqual(["matin", "nuit", "hier.soir"]);
    expect(handles({ recherche: "@nui" }).flatMap((j) => j[1])).toEqual(["nuit"]);
    expect(handles({ recherche: "tableau" }).flatMap((j) => j[1])).toEqual(["matin"]);
    expect(handles({ recherche: "classic" }).flatMap((j) => j[1])).toEqual(["etude"]);
    expect(handles({ section: "micabo" }).flatMap((j) => j[1])).toEqual(["etude"]);
    // Un concept n'a pas de label : il n'est d'aucune app.
    expect(handles({ section: "sans" }).flatMap((j) => j[1])).toEqual(["matin"]);
  });
});

describe("la section d'un label de l'OS", () => {
  it("celle de sa carte de la Bible, sinon l'app qu'il sert (Sophia, puis Micabo, puis Atala)", () => {
    expect(sectionDuLabel("L1", [carte({ section: "idees" })], labels)).toBe("idees");
    expect(sectionDuLabel("L1", [], labels)).toBe("sophia");
    expect(sectionDuLabel("L2", [], labels)).toBe("micabo");
    expect(sectionDuLabel("L3", [], labels)).toBe("atala");
    expect(sectionDuLabel("L4", [], labels)).toBe("sophia");
    expect(sectionDuLabel("inconnu", [], labels)).toBe("sophia");
  });
});
