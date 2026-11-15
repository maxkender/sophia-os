import { describe, expect, it } from "vitest";

import {
  ajouterScene,
  cheminCapture,
  problemeScript,
  SCENES_MAX,
  supprimerScene,
  comptesDeLaLangue,
  dernieresLignes,
  moteurAuTravail,
  scriptEditable,
  scriptModifie,
  scriptsDifferents, attendLaPilote, languePiloteDe,
  etapesVideo, groupeVideo, languesOrdonnees, ongletParDefaut, prochaineAction,
  type StatutLangueMotion, type StatutVideoMotion } from "./logique";

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
  it("scriptEditable ramène le script à ce qui se modifie", () => {
    expect(scriptEditable({ ...SCRIPT, scenes: [SCRIPT.scenes[0], { ...SCRIPT.scenes[1], animation: "Des montagnes surgissent." }] })).toEqual({
      scenes: [
        { id: "S1", origine: 0, texte: "Switzerland hasn't fought a war. Why?", animation: "" },
        { id: "S2", origine: 1, texte: "One: the Alps.", animation: "Des montagnes surgissent." },
      ],
      outro: "Answer all these questions with the Sophia app.",
      legende: "#switzerland",
    });
    expect(scriptEditable(null)).toBeNull();
    expect(scriptEditable({ scenes: [] })).toBeNull();
  });

  it("scriptModifie envoie la liste des scènes voulue, sans les repères", () => {
    const e = scriptEditable(SCRIPT)!;
    expect(scriptModifie(e)).toEqual({
      scenes: [
        { origine: 0, id: "S1", texte: "Switzerland hasn't fought a war. Why?", animation: "" },
        { origine: 1, id: "S2", texte: "One: the Alps.", animation: "" },
      ],
      outro: { texte: "Answer all these questions with the Sophia app." },
      legende: "#switzerland",
    });
  });

  it("ajouterScene et supprimerScene", () => {
    const e = scriptEditable(SCRIPT)!;
    const plus = ajouterScene(e, 0);
    expect(plus.scenes.map((s) => s.origine)).toEqual([0, null, 1]);
    expect(plus.scenes[1]).toEqual({ id: null, origine: null, texte: "", animation: "" });
    expect(ajouterScene(e, -1).scenes[0].origine).toBeNull();
    expect(supprimerScene(plus, 0).scenes.map((s) => s.origine)).toEqual([null, 1]);
    const une = supprimerScene(e, 1);
    expect(supprimerScene(une, 0)).toBe(une);
    let pleine = e;
    for (let i = 0; i < 30; i++) pleine = ajouterScene(pleine, 0);
    expect(pleine.scenes).toHaveLength(SCENES_MAX);
  });

  it("problemeScript : scène sans texte ou animation trop longue", () => {
    const e = scriptEditable(SCRIPT)!;
    expect(problemeScript(e)).toBeNull();
    expect(problemeScript(ajouterScene(e, 1))).toBe("texte_vide");
    expect(problemeScript({ ...e, scenes: [{ ...e.scenes[0], animation: "x".repeat(1001) }] })).toBe("animation_longue");
  });

  it("scriptsDifferents voit une modification", () => {
    const a = scriptEditable(SCRIPT);
    const b = scriptEditable({ ...SCRIPT, legende: "#suisse" });
    expect(scriptsDifferents(a, scriptEditable(SCRIPT))).toBe(false);
    expect(scriptsDifferents(a, b)).toBe(true);
    expect(scriptsDifferents(a, ajouterScene(a!, 0))).toBe(true);
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

describe("avancement d'une vidéo", () => {
  const v = (statut: StatutVideoMotion, langues: Array<[string, StatutLangueMotion]>) => ({
    statut,
    erreur: null,
    langues_visees: ["fr", "en", "de", "it"],
    langues: langues.map(([langue, s]) => ({ langue, statut: s })),
  });

  it("script à relire : à toi", () => {
    const x = v("script_pret", []);
    expect(groupeVideo(x)).toBe("a_toi");
    expect(prochaineAction(x)).toEqual({ cle: "relire_script" });
    expect(etapesVideo(x).map((e) => e.etat)).toEqual(["a_toi", "a_venir", "a_venir", "a_venir"]);
    expect(ongletParDefaut(x)).toBe("script");
  });

  it("le moteur rend la pilote, les autres attendent", () => {
    const x = v("production", [["en", "en_cours"], ["fr", "en_attente"]]);
    expect(groupeVideo(x)).toBe("moteur");
    expect(prochaineAction(x)).toEqual({ cle: "moteur_rend", langues: ["en"] });
    expect(etapesVideo(x).map((e) => e.etat)).toEqual(["faite", "moteur", "a_venir", "a_venir"]);
  });

  it("pilote à valider, puis les autres langues", () => {
    expect(prochaineAction(v("a_valider", [["en", "a_valider"]]))).toEqual({ cle: "valider_pilote", langues: ["en"] });
    const x = v("a_valider", [["en", "validee"], ["fr", "a_valider"], ["de", "en_cours"]]);
    expect(groupeVideo(x)).toBe("a_toi");
    expect(prochaineAction(x)).toEqual({ cle: "valider_langues", langues: ["fr"] });
    expect(etapesVideo(x).map((e) => e.etat)).toEqual(["faite", "faite", "moteur", "a_toi"]);
    expect(ongletParDefaut(x)).toBe("videos");
  });

  it("les autres langues ne sont pas faites tant qu'il en manque", () => {
    const x = v("a_valider", [["en", "validee"], ["fr", "a_valider"]]);
    expect(etapesVideo(x).find((e) => e.cle === "traductions")?.etat).toBe("a_venir");
  });

  it("tout validé : terminée", () => {
    const x = { ...v("termine", [["en", "distribuee"], ["fr", "validee"]]), langues_visees: ["en", "fr"] };
    expect(groupeVideo(x)).toBe("fini");
    expect(prochaineAction(x)).toEqual({ cle: "terminee" });
  });

  it("archive et échec", () => {
    expect(groupeVideo(v("archive", []))).toBe("archive");
    expect(prochaineAction(v("a_valider", [["en", "echec"]]))).toEqual({ cle: "echec" });
  });

  it("la pilote d'abord", () => {
    expect(languesOrdonnees([{ langue: "it" }, { langue: "fr" }, { langue: "en" }], "en").map((l) => l.langue)).toEqual(["en", "fr", "it"]);
  });
});
