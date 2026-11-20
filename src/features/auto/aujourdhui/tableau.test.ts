import { describe, expect, it } from "vitest";

import type { LigneJour, PosteurJour, SectionJour } from "./api";
import { dureeCourte, lundiPrecedent } from "./PageQualite";
import {
  categories, compteur, deplacer, depuisCourt, derniersEchanges, FILTRES_VIDES, lignePasse, phraseResume, posteurCorrespond,
  sectionsFiltrees, tonSection,
} from "./tableau";

const ligne = (x: Partial<LigneJour> & { id: string }): LigneJour => ({
  titre: x.id, detail: null, ton: "gris", depuis: null, nb: 1, montant: null, posteurs: [], demandes: [], lien: null,
  lien_label: null, categorie: null, plateforme: null, ...x,
});

const POSTEURS = new Map<string, PosteurJour>([
  ["p1", { id: "p1", nom: "Ana Test", email: "ana.test@example.com", plateforme: "ruul", handles: ["@ana.reads"] }],
  ["p2", { id: "p2", nom: "Bob Exemple", email: "bob@example.com", plateforme: "upwork", handles: [] }],
]);

const SECTIONS: SectionJour[] = [
  { cle: "posteurs", titre: "Posteurs", lignes: [
    ligne({ id: "support:bug", ton: "gris", categorie: "bug", posteurs: ["p2"], depuis: "2026-11-20T10:00:00Z" }),
    ligne({ id: "support:posting", ton: "orange", categorie: "posting", posteurs: ["p1"], depuis: "2026-11-18T10:00:00Z", plateforme: "ruul" }),
  ] },
  { cle: "argent", titre: "Argent", lignes: [ligne({ id: "support:paie", ton: "rouge", categorie: "paie", posteurs: ["p1", "p2"] })] },
];

describe("Aujourd'hui (21/11) : logique de la page", () => {
  it("depuis en clair", () => {
    const m = new Date("2026-11-21T12:00:00Z");
    expect(depuisCourt(null, m)).toBe("");
    expect(depuisCourt("2026-11-21T11:40:00Z", m)).toBe("20 min");
    expect(depuisCourt("2026-11-21T07:00:00Z", m)).toBe("5 h");
    expect(depuisCourt("2026-11-18T12:00:00Z", m)).toBe("3 j");
  });

  it("recherche par nom, @ (avec ou sans @) et email, sans accents ni majuscules", () => {
    const p = POSTEURS.get("p1")!;
    for (const q of ["ana", "ANA TEST", "@ana.reads", "ana.reads", "example.com", ""]) expect(posteurCorrespond(p, q), q).toBe(true);
    expect(posteurCorrespond(p, "bob")).toBe(false);
    expect(posteurCorrespond({ ...p, nom: "Élodie" }, "elodie")).toBe(true);
  });

  it("filtres : catégorie, plateforme, urgence, recherche sur les posteurs de la ligne", () => {
    const l = SECTIONS[0].lignes[1];
    expect(lignePasse(l, FILTRES_VIDES, POSTEURS)).toBe(true);
    expect(lignePasse(l, { ...FILTRES_VIDES, categorie: "bug" }, POSTEURS)).toBe(false);
    expect(lignePasse(l, { ...FILTRES_VIDES, plateforme: "upwork" }, POSTEURS)).toBe(false);
    expect(lignePasse(l, { ...FILTRES_VIDES, urgence: "orange" }, POSTEURS)).toBe(true);
    expect(lignePasse(l, { ...FILTRES_VIDES, recherche: "@ana" }, POSTEURS)).toBe(true);
    expect(lignePasse(l, { ...FILTRES_VIDES, recherche: "bob" }, POSTEURS)).toBe(false);
    // Une ligne sans plateforme (paie Upwork + Ruul) reste visible quel que soit le filtre.
    expect(lignePasse(ligne({ id: "x" }), { ...FILTRES_VIDES, plateforme: "ruul" }, POSTEURS)).toBe(true);
  });

  it("sections dans l'ordre, lignes rouge → orange → gris, compteur sans les grises", () => {
    const s = sectionsFiltrees(SECTIONS, FILTRES_VIDES, POSTEURS);
    expect(s.map((x) => x.cle)).toEqual(["argent", "posteurs"]);
    expect(s[1].lignes.map((l) => l.id)).toEqual(["support:posting", "support:bug"]);
    expect(compteur(s[1])).toBe(1);
    expect(tonSection(s[0])).toBe("rouge");
    expect(tonSection(s[1])).toBe("orange");
    expect(categories(SECTIONS)).toEqual(["bug", "paie", "posting"]);
  });

  it("J / K : suivante, précédente, bornées", () => {
    const ids = ["a", "b", "c"];
    expect(deplacer(ids, null, 1)).toBe("a");
    expect(deplacer(ids, null, -1)).toBe("c");
    expect(deplacer(ids, "a", 1)).toBe("b");
    expect(deplacer(ids, "c", 1)).toBe("c");
    expect(deplacer(ids, "a", -1)).toBe("a");
    expect(deplacer([], "a", 1)).toBeNull();
  });

  it("les 5 derniers échanges, sans les actions de l'OS", () => {
    const fil = Array.from({ length: 8 }, (_, i) => ({ sens: i === 7 ? "action" : i % 2 ? "out" : "in", at: `2026-11-2${i}` }));
    expect(derniersEchanges(fil).map((e) => e.at)).toEqual(["2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"]);
  });

  it("la phrase du haut", () => {
    expect(phraseResume({ a_valider: 1, cas: 3, problemes: 0, reponses: 12, corrections: 1 }))
      .toBe("1 chose à valider · 3 cas pour toi · 0 problème · géré seul : 12 réponses, 1 correction");
  });

  it("rapport qualité : durées et lundis", () => {
    expect(dureeCourte(null)).toBe("—");
    expect(dureeCourte(0.5)).toBe("30 s");
    expect(dureeCourte(95)).toBe("1,6 h");
    expect(lundiPrecedent(0, new Date("2026-11-23T10:00:00Z"))).toBe("2026-11-16");
    expect(lundiPrecedent(0, new Date("2026-11-22T10:00:00Z"))).toBe("2026-11-09");
    expect(lundiPrecedent(1, new Date("2026-11-23T10:00:00Z"))).toBe("2026-11-09");
  });
});
