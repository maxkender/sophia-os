import { describe, expect, it } from "vitest";

import {
  cheminCapture,
  comptesDeLaLangue,
  dernieresLignes,
  moteurAuTravail,
  scriptEditable,
  scriptModifie,
  scriptsDifferents, attendLaPilote, languePiloteDe } from "./logique";

const SCRIPT = {
  langue: "en",
  voix: { id: "brian" },
  scenes: [
    { id: "S1", texte: "Switzerland hasn't fought a war. Why?", reperes: [{ mot: "Why?", image: 70 }] },
    { id: "S2", texte: "One: the Alps." },
  ],
  outro: { texte: "Answer all these questions with the Sophia app." },
  legende: "#switzerland",
};

describe("motion : script", () => {
  it("scriptEditable ramène le script à ses textes", () => {
    expect(scriptEditable(SCRIPT)).toEqual({
      scenes: [
        { id: "S1", texte: "Switzerland hasn't fought a war. Why?" },
        { id: "S2", texte: "One: the Alps." },
      ],
      outro: "Answer all these questions with the Sophia app.",
      legende: "#switzerland",
    });
    expect(scriptEditable(null)).toBeNull();
    expect(scriptEditable({ scenes: [] })).toBeNull();
  });

  it("scriptModifie n'envoie que les textes", () => {
    const e = scriptEditable(SCRIPT)!;
    expect(scriptModifie(e)).toEqual({
      scenes: [
        { id: "S1", texte: "Switzerland hasn't fought a war. Why?" },
        { id: "S2", texte: "One: the Alps." },
      ],
      outro: { texte: "Answer all these questions with the Sophia app." },
      legende: "#switzerland",
    });
  });

  it("scriptsDifferents voit une modification", () => {
    const a = scriptEditable(SCRIPT);
    const b = scriptEditable({ ...SCRIPT, legende: "#suisse" });
    expect(scriptsDifferents(a, scriptEditable(SCRIPT))).toBe(false);
    expect(scriptsDifferents(a, b)).toBe(true);
  });
});

describe("motion : suivi", () => {
  it("moteurAuTravail : script demandé, production ou langue en cours", () => {
    expect(moteurAuTravail([])).toBe(false);
    expect(moteurAuTravail([{ statut: "script_pret", langues: [] }])).toBe(false);
    expect(moteurAuTravail([{ statut: "script_demande", langues: [] }])).toBe(true);
    expect(moteurAuTravail([{ statut: "a_valider", langues: [{ statut: "en_cours" }] }])).toBe(true);
    expect(moteurAuTravail([{ statut: "termine", langues: [{ statut: "distribuee" }] }])).toBe(false);
  });

  it("dernieresLignes : les plus récentes d'abord", () => {
    const journal = [1, 2, 3].map((i) => ({ at: `2026-11-06T10:0${i}:00Z`, message: `ligne ${i}` }));
    expect(dernieresLignes(journal, 2).map((l) => l.message)).toEqual(["ligne 3", "ligne 2"]);
    expect(dernieresLignes("pas un journal")).toEqual([]);
  });
});

describe("motion : comptes et capture", () => {
  it("comptesDeLaLangue : exacte, sinon langue de base", () => {
    const comptes = [
      { id: "a", langue: "fr" },
      { id: "b", langue: "pt-BR" },
    ];
    expect(comptesDeLaLangue(comptes, "fr").map((c) => c.id)).toEqual(["a"]);
    expect(comptesDeLaLangue(comptes, "pt").map((c) => c.id)).toEqual(["b"]);
    expect(comptesDeLaLangue(comptes, "de")).toEqual([]);
  });

  it("cheminCapture : une image sous le dossier de la vidéo", () => {
    const id = "0B7C4A1E-5F2D-4C3B-9A8E-1D2C3B4A5F6E";
    expect(cheminCapture(id, "Accueil Sophia.PNG", 1762441200000.5)).toBe(
      "motion/0b7c4a1e-5f2d-4c3b-9a8e-1d2c3b4a5f6e/capture-1762441200000.png",
    );
    expect(cheminCapture(id, "capture.webp", 1)).toMatch(/capture-1\.webp$/);
    expect(cheminCapture(id, "video.mp4", 1)).toBeNull();
    expect(cheminCapture(id, "sansextension", 1)).toBeNull();
  });
});

describe("langue pilote", () => {
  it("l'anglais d'abord, sinon la première langue", () => {
    expect(languePiloteDe(["fr", "en", "de", "it"])).toBe("en");
    expect(languePiloteDe(["fr", "de"])).toBe("fr");
  });

  it("les autres langues attendent la validation de la pilote", () => {
    const toutes = [
      { langue: "en", statut: "a_valider" },
      { langue: "fr", statut: "en_attente" },
    ];
    expect(attendLaPilote(toutes[1], toutes, "en")).toBe(true);
    expect(attendLaPilote(toutes[0], toutes, "en")).toBe(false);
    const apres = [
      { langue: "en", statut: "validee" },
      { langue: "fr", statut: "en_attente" },
    ];
    expect(attendLaPilote(apres[1], apres, "en")).toBe(false);
  });
});
