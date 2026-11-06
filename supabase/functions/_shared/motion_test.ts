import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  cheminCaptureValide,
  cheminDeLaLangue,
  cheminMotion,
  compteMotionDeLaLangue,
  demandeCreation,
  dureeOuNull,
  empreinte,
  fusionnerScriptEdite,
  langueValide,
  languesDemandees,
  memesEmpreintes,
  nouveauJeton,
  premierJourLibre,
  scriptValide,
  statutApresEchec,
  statutVideoDepuisLangues,
} from "./motion.ts";

const VIDEO = "0b7c4a1e-5f2d-4c3b-9a8e-1d2c3b4a5f6e";

Deno.test("langueValide : minuscules, région en majuscules, refuse le reste", () => {
  assertEquals(langueValide(" FR "), "fr");
  assertEquals(langueValide("pt-br"), "pt-BR");
  assertEquals(langueValide("es-419"), "es-419");
  assertEquals(langueValide("français"), null);
  assertEquals(langueValide(""), null);
});

Deno.test("languesDemandees : défaut, dédoublonnage, refus", () => {
  assertEquals(languesDemandees(undefined), ["fr", "en", "de", "it"]);
  assertEquals(languesDemandees(["en", "EN", "de"]), ["en", "de"]);
  assertEquals(languesDemandees([]), { erreur: "Choisis au moins une langue" });
  assertEquals(languesDemandees("fr"), { erreur: "Langues : une liste attendue" });
  assertEquals(languesDemandees(["fr", "xx-yyyy"]), { erreur: "Langue invalide : xx-yyyy" });
});

Deno.test("demandeCreation : sujet obligatoire, consigne facultative", () => {
  assertEquals(demandeCreation({ sujet: "  " }), { erreur: "Écris le sujet de la vidéo" });
  assertEquals(demandeCreation({ sujet: " Why is Switzerland never at war? ", consigne: "" }), {
    sujet: "Why is Switzerland never at war?",
    consigne: null,
    langues: ["fr", "en", "de", "it"],
  });
  assertEquals(demandeCreation({ sujet: "Rome", langues: ["it"] }), { sujet: "Rome", consigne: null, langues: ["it"] });
});

const SCRIPT = {
  langue: "en",
  voix: { id: "brian", reglages: { speed: 1.06 } },
  scenes: [
    { id: "S1", texte: "Switzerland hasn't fought a war. Why?", reperes: [{ mot: "Why?", image: 70 }] },
    { id: "S2", texte: "One: the Alps.", reperes: [] },
  ],
  outro: { texte: "Answer all these questions with the Sophia app.", duree: 9 },
  appli: { cours: "x" },
  legende: "#switzerland",
};

Deno.test("scriptValide : au moins une scène avec un texte", () => {
  assert(scriptValide(SCRIPT));
  assertEquals(scriptValide({ scenes: [] }), null);
  assertEquals(scriptValide({ scenes: [{ id: "S1" }] }), null);
  assertEquals(scriptValide("texte"), null);
});

Deno.test("fusionnerScriptEdite : ne reporte que les textes, l'outro et la légende", () => {
  const fusion = fusionnerScriptEdite(SCRIPT, {
    scenes: [{ id: "S2", texte: " Two: the Alps. ", reperes: "écrasé ?" }],
    outro: { texte: "Learn it with Sophia." },
    legende: " #suisse ",
    voix: { id: "autre" },
  });
  assert(!("erreur" in fusion));
  const f = fusion as typeof SCRIPT;
  assertEquals(f.scenes[0].texte, SCRIPT.scenes[0].texte);
  assertEquals(f.scenes[1].texte, "Two: the Alps.");
  assertEquals(f.scenes[1].reperes, []);
  assertEquals(f.outro, { texte: "Learn it with Sophia.", duree: 9 });
  assertEquals(f.legende, "#suisse");
  assertEquals(f.voix, SCRIPT.voix);
  assertEquals(SCRIPT.scenes[1].texte, "One: the Alps.", "le script stocké n'est pas modifié");
});

Deno.test("fusionnerScriptEdite : refuse un script vide ou une scène sans texte", () => {
  assertEquals(fusionnerScriptEdite(null, SCRIPT), { erreur: "Pas encore de script à modifier" });
  assertEquals(fusionnerScriptEdite(SCRIPT, { scenes: [{ id: "S1", texte: "  " }] }), {
    erreur: "Chaque scène a besoin d'un texte",
  });
});

Deno.test("cheminMotion et cheminDeLaLangue", () => {
  assertEquals(cheminMotion(VIDEO, "de", "video.mp4"), `motion/${VIDEO}/de/video.mp4`);
  assertEquals(cheminMotion("pas-un-id", "de", "video.mp4"), { erreur: "video_id invalide" });
  assert("erreur" in (cheminMotion(VIDEO, "de", "../x.mp4") as object));
  assert("erreur" in (cheminMotion(VIDEO, "de", "video.exe") as object));
  assert(cheminDeLaLangue(`motion/${VIDEO}/de/video.mp4`, VIDEO, "de"));
  assert(!cheminDeLaLangue(`motion/${VIDEO}/fr/video.mp4`, VIDEO, "de"));
  assert(!cheminDeLaLangue(`motion/${VIDEO}/de/../../x.mp4`, VIDEO, "de"));
});

Deno.test("statutVideoDepuisLangues", () => {
  assertEquals(statutVideoDepuisLangues([]), null);
  assertEquals(statutVideoDepuisLangues(["a_valider", "en_cours"]), null);
  assertEquals(statutVideoDepuisLangues(["a_valider", "rejetee"]), null);
  assertEquals(statutVideoDepuisLangues(["a_valider", "distribuee"]), "a_valider");
  assertEquals(statutVideoDepuisLangues(["distribuee", "distribuee"]), "termine");
});

Deno.test("statutApresEchec : 3 tentatives", () => {
  assertEquals(statutApresEchec(1), "en_attente");
  assertEquals(statutApresEchec(2), "en_attente");
  assertEquals(statutApresEchec(3), "echec");
});

Deno.test("compteMotionDeLaLangue : exact, puis langue de base, actifs, le plus ancien", () => {
  const comptes = [
    { id: "b", langue: "pt-BR", handle_tiktok: "b", is_active: true, created_at: "2026-11-02" },
    { id: "a", langue: "fr", handle_tiktok: "a", is_active: false, created_at: "2026-11-01" },
    { id: "c", langue: "fr", handle_tiktok: "c", is_active: true, created_at: "2026-11-03" },
    { id: "d", langue: "fr", handle_tiktok: "d", is_active: true, created_at: "2026-11-02" },
  ];
  assertEquals(compteMotionDeLaLangue(comptes, "fr")?.id, "d");
  assertEquals(compteMotionDeLaLangue(comptes, "pt")?.id, "b");
  assertEquals(compteMotionDeLaLangue(comptes, "de"), null);
});

Deno.test("premierJourLibre : 1 post par jour sur le compte", () => {
  assertEquals(premierJourLibre("2026-11-06", []), "2026-11-06");
  assertEquals(premierJourLibre("2026-11-06", ["2026-11-06", "2026-11-07"]), "2026-11-08");
  assertEquals(premierJourLibre("2026-11-30", ["2026-11-30"]), "2026-12-01");
  assertEquals(premierJourLibre("2026-11-06", ["2026-11-06"], 1), null);
});

Deno.test("dureeOuNull", () => {
  assertEquals(dureeOuNull(45.47), 45.5);
  assertEquals(dureeOuNull("45,5"), 45.5);
  assertEquals(dureeOuNull(0), null);
  assertEquals(dureeOuNull("abc"), null);
});

Deno.test("jeton : 64 caractères hexadécimaux, comparaison stricte", () => {
  const j = nouveauJeton();
  assert(/^[0-9a-f]{64}$/.test(j));
  assert(memesEmpreintes(j, j));
  assert(!memesEmpreintes(j, nouveauJeton()));
  assert(!memesEmpreintes("", ""));
});

Deno.test("empreinte : SHA-256 hexadécimal", async () => {
  assertEquals(await empreinte("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

Deno.test("cheminCaptureValide : sous le dossier de la vidéo, une image", () => {
  assert(cheminCaptureValide(`motion/${VIDEO}/capture-1762441200000.png`, VIDEO));
  assert(cheminCaptureValide(`motion/${VIDEO}/capture-1762441200000.jpeg`, VIDEO));
  assert(!cheminCaptureValide(`motion/${VIDEO}/capture-1762441200000.mp4`, VIDEO));
  assert(!cheminCaptureValide(`motion/${VIDEO}/fr/capture-1.png`, VIDEO));
  assert(!cheminCaptureValide(`motion/autre/capture-1.png`, VIDEO));
});
