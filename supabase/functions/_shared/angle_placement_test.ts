/**
 * Angle de placement (label × application) : la règle d'or est qu'un angle
 * VIDE ne change pas le prompt d'un octet — Sophia (instantanés de
 * gemini_placement_golden_test.ts) comme les autres applications.
 */

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  anglesPourApplication,
  blocConsignePlacement,
  normaliserAngle,
  texteAngle,
} from "./angle_placement.ts";
import { integrateSophia } from "./gemini.ts";
import { construirePromptPlacementApplication } from "./placement_application.ts";

const UNSWIPE = "00000000-0000-4000-8000-000000000003";
const SOPHIA = "00000000-0000-4000-8000-000000000001";

Deno.test("normaliserAngle : blancs de bord retirés, null et undefined = vide", () => {
  assertEquals(normaliserAngle("  insister sur X \n"), "insister sur X");
  assertEquals(normaliserAngle(null), "");
  assertEquals(normaliserAngle(undefined), "");
  assertEquals(normaliserAngle("   "), "");
});

Deno.test("anglesPourApplication : labels du contenu, cette application seulement, sans système ni doublon", () => {
  const labels = [
    { id: "weird", slug: "weird-alpha", nom: "weird_alpha" },
    { id: "hook", slug: "hook", nom: "hook" },
    { id: "study", slug: "faceless-study", nom: "faceless_study" },
  ];
  const liens = [
    { label_id: "weird", application_id: UNSWIPE, angle: " côté discipline " },
    { label_id: "weird", application_id: SOPHIA, angle: "angle Sophia" },
    { label_id: "hook", application_id: UNSWIPE, angle: "jamais lu (label système)" },
    { label_id: "study", application_id: UNSWIPE, angle: "côté discipline" },
    { label_id: "autre", application_id: UNSWIPE, angle: "label d'un autre contenu" },
  ];
  assertEquals(anglesPourApplication(labels, liens, UNSWIPE), ["côté discipline"]);
  assertEquals(anglesPourApplication(labels, liens, SOPHIA), ["angle Sophia"]);
  assertEquals(anglesPourApplication(labels, [{ label_id: "weird", application_id: UNSWIPE }], UNSWIPE), []);
});

Deno.test("texteAngle : un seul angle tel quel, plusieurs en liste, aucun = vide", () => {
  assertEquals(texteAngle([]), "");
  assertEquals(texteAngle(["", "  "]), "");
  assertEquals(texteAngle([" côté X "]), "côté X");
  assertEquals(texteAngle(["côté X", "côté Y", "côté X"]), "- côté X\n- côté Y");
});

Deno.test("blocConsignePlacement : vide sans angle, sinon la consigne et ses limites, sans le mot « angle »", () => {
  assertEquals(blocConsignePlacement("", "Unswipe", "allemand"), "");
  assertEquals(blocConsignePlacement("  ", "Unswipe", "allemand"), "");
  assertEquals(blocConsignePlacement(null, "Unswipe", "allemand"), "");
  const bloc = blocConsignePlacement(" insister sur le temps récupéré ", "Unswipe", "allemand");
  assert(bloc.startsWith("\n\n--- CONSIGNE PROPRE À CE SLIDESHOW ---\ninsister sur le temps récupéré\n"));
  assertStringIncludes(bloc, "Elle ne remplace aucune règle de forme");
  assertStringIncludes(bloc, "Les 3 variantes la suivent");
  assertStringIncludes(bloc, "tes variantes sont en allemand.");
  assert(!/angle/i.test(bloc), "le mot « angle » désigne déjà les 3 variantes dans les prompts maîtres");
});

const ENTREE_APP = {
  masterPrompt: "Prompt maître Unswipe.",
  slides: [
    { position: 1, text: "5 habitudes" },
    { position: 2, text: "1. téléphone hors de la chambre" },
    { position: 3, text: "2. notifications coupées" },
    { position: 4, text: "3. lecture avant de dormir" },
  ],
  caption: "#detox",
  langue: "de",
  application: { slug: "unswipe", nom: "Unswipe" },
};

Deno.test("placement d'une application : angle vide ou blanc = prompt identique octet pour octet", () => {
  const sans = construirePromptPlacementApplication(ENTREE_APP);
  for (const angle of [undefined, "", "   \n "]) {
    assertEquals(construirePromptPlacementApplication({ ...ENTREE_APP, angle }), sans);
  }
});

Deno.test("placement d'une application : l'angle entre le prompt maître et les données, rien d'autre ne bouge", () => {
  const sans = construirePromptPlacementApplication(ENTREE_APP);
  const avec = construirePromptPlacementApplication({ ...ENTREE_APP, angle: "insister sur X" });
  const bloc = blocConsignePlacement("insister sur X", "Unswipe", "allemand");
  assertEquals(
    avec,
    sans.replace("Prompt maître Unswipe.\n\n--- DONNÉES ---", `Prompt maître Unswipe.${bloc}\n\n--- DONNÉES ---`),
  );
});

/** Capture le texte envoyé à Gemini (réponse factice valide : un seul appel). */
async function promptSophia(angle?: string): Promise<string> {
  const vraiFetch = globalThis.fetch;
  const avaitCle = Deno.env.get("GEMINI_API_KEY");
  Deno.env.set("GEMINI_API_KEY", avaitCle ?? "cle-de-test");
  const captures: string[] = [];
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    captures.push(JSON.parse(String(init?.body)).contents[0].parts[0].text);
    const texte = JSON.stringify({ chosen_position: 4, mode: "instructif", variants: ["3. Sophia m'aide"], best: 0 });
    return Promise.resolve(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texte }] } }] }), { status: 200 }),
    );
  }) as typeof fetch;
  try {
    await integrateSophia({
      masterPrompt: "Prompt maître Sophia.",
      corrections: [],
      slides: ENTREE_APP.slides,
      caption: "#etudes",
      langue: "fr",
      ...(angle === undefined ? {} : { angle }),
    });
  } finally {
    globalThis.fetch = vraiFetch;
    if (avaitCle === undefined) Deno.env.delete("GEMINI_API_KEY");
  }
  assertEquals(captures.length, 1);
  return captures[0];
}

Deno.test("placement Sophia : angle vide = prompt identique, angle = bloc entre le prompt maître et les données", async () => {
  const sans = await promptSophia();
  assertEquals(await promptSophia(""), sans);
  assertEquals(await promptSophia("  "), sans);
  const avec = await promptSophia("insister sur la régularité");
  const bloc = blocConsignePlacement("insister sur la régularité", "Sophia", "français");
  assertEquals(
    avec,
    sans.replace("Prompt maître Sophia.\n\n--- DONNÉES ---", `Prompt maître Sophia.${bloc}\n\n--- DONNÉES ---`),
  );
});
