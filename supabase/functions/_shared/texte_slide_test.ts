import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  consigneNettoyage,
  parserLectureSlide,
  PROMPT_LECTURE_SLIDE,
  PROMPT_NETTOYAGE,
  resumeEcartes,
  typeBloc,
} from "./texte_slide.ts";

Deno.test("carte App Store collée : seule la phrase de la créatrice reste (contenu 113291c3, slide 6)", () => {
  const reponse = JSON.stringify({
    blocs: [
      { type: "legende", texte: "When you want to become an A+ student:\n\nQuizlocky..." },
      { type: "sticker", texte: "study to unlock\npass a quiz on your notes,\nearn your screen time back" },
      { type: "sticker", texte: "QuizLocky - Study App Blocker\nGET" },
      { type: "sticker", texte: "Pass a quiz to unlock ->" },
    ],
  });
  const lecture = parserLectureSlide(reponse);
  assertEquals(lecture?.legende, "When you want to become an A+ student:\n\nQuizlocky...");
  assertEquals(resumeEcartes(lecture!.blocs), "sticker×3");
});

Deno.test("recette manuscrite du décor : pas recopiée (#questions, 10/10)", () => {
  const reponse = JSON.stringify({
    blocs: [
      { type: "legende", texte: "Here's one of my autumn breakfast recipes" },
      { type: "decor", texte: "Pumpkin oats\n- 50g oats\n- 1 tbsp pumpkin purée" },
    ],
  });
  assertEquals(parserLectureSlide(reponse)?.legende, "Here's one of my autumn breakfast recipes");
});

Deno.test("plusieurs blocs de légende : gardés dans l'ordre, séparés par une ligne vide", () => {
  const reponse = JSON.stringify({
    blocs: [
      { type: "legende", texte: "3 habits that changed my life" },
      { type: "interface", texte: "9:41" },
      { type: "legende", texte: "1. Reading 10 pages a day" },
    ],
  });
  assertEquals(
    parserLectureSlide(reponse)?.legende,
    "3 habits that changed my life\n\n1. Reading 10 pages a day",
  );
});

Deno.test("bloc de code ```json, clé anglaise blocks, tableau nu : tous lus", () => {
  const blocs = [{ type: "caption", text: "stay hard" }, { type: "logo", text: "Opal" }];
  assertEquals(parserLectureSlide("```json\n" + JSON.stringify({ blocs }) + "\n```")?.legende, "stay hard");
  assertEquals(parserLectureSlide(JSON.stringify({ blocks: blocs }))?.legende, "stay hard");
  assertEquals(parserLectureSlide(JSON.stringify(blocs))?.legende, "stay hard");
});

Deno.test("slide sans texte : légende vide, pas un échec", () => {
  assertEquals(parserLectureSlide('{"blocs":[]}'), { legende: "", blocs: [] });
  assertEquals(parserLectureSlide("(aucun texte)"), { legende: "", blocs: [] });
});

Deno.test("seulement des stickers : légende vide", () => {
  const reponse = JSON.stringify({ blocs: [{ type: "sticker", texte: "★★★★★ 4.8" }] });
  assertEquals(parserLectureSlide(reponse)?.legende, "");
});

Deno.test("réponse inexploitable → null (l'appelant redemande)", () => {
  assertStrictEquals(parserLectureSlide("Voici le texte : stay hard"), null);
  assertStrictEquals(parserLectureSlide('{"blocs": [{"type": "legende", "texte": "coupé'), null);
  assertStrictEquals(parserLectureSlide('{"texte":"stay hard"}'), null);
});

Deno.test("retours chariot normalisés, blocs vides ignorés", () => {
  const reponse = JSON.stringify({
    blocs: [{ type: "legende", texte: "  ligne 1\r\nligne 2  " }, { type: "legende", texte: "   " }, null],
  });
  assertEquals(parserLectureSlide(reponse)?.legende, "ligne 1\nligne 2");
});

Deno.test("typeBloc : synonymes, accents, composés ; inconnu → légende", () => {
  assertEquals(typeBloc("Légende"), "legende");
  assertEquals(typeBloc("Décor"), "decor");
  assertEquals(typeBloc("app_store_card"), "sticker");
  assertEquals(typeBloc("watermark"), "sticker");
  assertEquals(typeBloc("UI"), "interface");
  assertEquals(typeBloc("quelque chose"), "legende");
  assertEquals(typeBloc(undefined), "legende");
});

Deno.test("consigneNettoyage : défaut, surcharge, retour à l'ancien text-removal", () => {
  assertEquals(consigneNettoyage(null), PROMPT_NETTOYAGE);
  assertEquals(consigneNettoyage({ provider_principal: "replicate" }), PROMPT_NETTOYAGE);
  assertEquals(consigneNettoyage({ prompt: "  Remove the caption.  " }), "Remove the caption.");
  assertEquals(consigneNettoyage({ prompt: "   " }), PROMPT_NETTOYAGE);
  assertStrictEquals(consigneNettoyage({ mode: "tout_texte", prompt: "x" }), null);
});

Deno.test("les deux consignes portent la même règle (stickers dehors, décor gardé)", () => {
  assert(PROMPT_LECTURE_SLIDE.includes('{"blocs":[{"type":"legende","texte":"..."}]}'));
  for (const mot of ["sticker", "App Store", "decor", "interface"]) {
    assert(PROMPT_LECTURE_SLIDE.includes(mot), mot);
  }
  for (const mot of ["stickers", "App Store", "handwriting", "book pages", "exactly as it is"]) {
    assert(PROMPT_NETTOYAGE.includes(mot), mot);
  }
});
