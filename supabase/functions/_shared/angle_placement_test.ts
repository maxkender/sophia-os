/**
 * Angle de placement (label × application) : la règle d'or est qu'un angle
 * VIDE ne change pas le prompt d'un octet — Sophia (instantanés de
 * gemini_placement_golden_test.ts) comme les autres applications.
 */

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  anglesActifsPourApplication,
  anglesTestPourApplication,
  blocConsignePlacement,
  choisirAngleActif,
  copieAngle,
  normaliserAngle,
  variantesSansCopieAngle,
} from "./angle_placement.ts";
import { integrateSophia } from "./gemini.ts";
import { construirePromptPlacementApplication, variantesValidesApplication } from "./placement_application.ts";

const UNSWIPE = "00000000-0000-4000-8000-000000000003";
const SOPHIA = "00000000-0000-4000-8000-000000000001";

Deno.test("normaliserAngle : blancs de bord retirés, null et undefined = vide", () => {
  assertEquals(normaliserAngle("  insister sur X \n"), "insister sur X");
  assertEquals(normaliserAngle(null), "");
  assertEquals(normaliserAngle(undefined), "");
  assertEquals(normaliserAngle("   "), "");
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

const ANGLE_FR = "insister sur le temps récupéré pour ce qui compte vraiment";

Deno.test("copieAngle : 6 mots d'affilée de l'angle (casse, accents, ponctuation ignorés), pas moins", () => {
  assert(copieAngle("3. Unswipe hilft: INSISTER sur le temps recupere pour ce qui compte", ANGLE_FR));
  assert(!copieAngle("3. Unswipe hilft mir, Zeit für das zu haben, was wirklich zählt", ANGLE_FR));
  assert(!copieAngle("insister sur le temps", ANGLE_FR), "5 mots seulement");
  assert(!copieAngle("insister sur le temps récupéré", "insister sur le temps récupéré"), "angle de moins de 6 mots");
});

Deno.test("variantesSansCopieAngle : hors français seulement, et jamais sans angle", () => {
  const recopiee = "3. die Unswipe-App: insister sur le temps récupéré pour ce qui compte";
  const propre = "3. die Unswipe-App gibt mir Zeit für das, was zählt";
  assertEquals(variantesSansCopieAngle([recopiee, propre], ANGLE_FR, "de"), [propre]);
  assertEquals(variantesSansCopieAngle([recopiee, propre], ANGLE_FR, "fr"), [recopiee, propre]);
  assertEquals(variantesSansCopieAngle([recopiee, propre], "", "de"), [recopiee, propre]);
  assertEquals(variantesSansCopieAngle([recopiee, propre], undefined, "de"), [recopiee, propre]);
});

Deno.test("variantesValidesApplication : la formule recopiée de l'angle est écartée hors français", () => {
  const recopiee = "3. die Unswipe-App: insister sur le temps récupéré pour ce qui compte";
  const propre = "3. die Unswipe-App gibt mir Zeit für das, was zählt";
  assertEquals(variantesValidesApplication([recopiee, propre], "de", "Unswipe", undefined, ANGLE_FR), [propre]);
  assertEquals(variantesValidesApplication([recopiee, propre], "de", "Unswipe"), [recopiee, propre]);
});

Deno.test("placement Sophia : une variante qui recopie l'angle hors français est écartée", async () => {
  const vraiFetch = globalThis.fetch;
  const avaitCle = Deno.env.get("GEMINI_API_KEY");
  Deno.env.set("GEMINI_API_KEY", avaitCle ?? "cle-de-test");
  globalThis.fetch = (() => {
    const texte = JSON.stringify({
      chosen_position: 4,
      mode: "instructif",
      variants: [
        "3. die Sophia-App: insister sur le temps récupéré pour ce qui compte",
        "3. die Sophia-App schenkt mir Zeit für das, was zählt",
      ],
      best: 0,
    });
    return Promise.resolve(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texte }] } }] }), { status: 200 }),
    );
  }) as typeof fetch;
  try {
    const r = await integrateSophia({
      masterPrompt: "Prompt maître Sophia.",
      corrections: [],
      slides: ENTREE_APP.slides,
      caption: "#etudes",
      langue: "de",
      angle: ANGLE_FR,
    });
    assertEquals(r?.variants, ["3. die Sophia-App schenkt mir Zeit für das, was zählt"]);
  } finally {
    globalThis.fetch = vraiFetch;
    if (avaitCle === undefined) Deno.env.delete("GEMINI_API_KEY");
  }
});

Deno.test("anglesActifsPourApplication / anglesTestPourApplication : les actifs pour la nuit, les tests pour le test à blanc", () => {
  const labels = [
    { id: "w", slug: "weird-alpha", nom: "weird_alpha" },
    { id: "h", slug: "hook", nom: "hook" },
  ];
  const angles = [
    { id: "9", label_id: "w", application_id: UNSWIPE, texte: "actif B", statut: "actif" },
    { id: "1", label_id: "w", application_id: UNSWIPE, texte: " actif A ", statut: "actif" },
    { id: "8", label_id: "w", application_id: UNSWIPE, texte: "actif A", statut: "actif" },
    { id: "7", label_id: "h", application_id: UNSWIPE, texte: "actif système", statut: "actif" },
    { id: "2", label_id: "w", application_id: UNSWIPE, texte: " test A ", statut: "test" },
    { id: "3", label_id: "w", application_id: UNSWIPE, texte: "test A", statut: "test" },
    { id: "4", label_id: "w", application_id: SOPHIA, texte: "test Sophia", statut: "test" },
    { id: "5", label_id: "h", application_id: UNSWIPE, texte: "test système", statut: "test" },
    { id: "6", label_id: "w", application_id: UNSWIPE, texte: "test B", statut: "test" },
  ];
  // Rangés par id, sans doublon de texte (le premier reçu reste), sans label système.
  assertEquals(anglesActifsPourApplication(labels, angles, UNSWIPE), [
    { id: "1", texte: "actif A" },
    { id: "9", texte: "actif B" },
  ]);
  assertEquals(anglesActifsPourApplication(labels, angles, SOPHIA), []);
  assertEquals(anglesTestPourApplication(labels, angles, UNSWIPE), [
    { id: "2", texte: "test A" },
    { id: "6", texte: "test B" },
  ]);
  assertEquals(anglesTestPourApplication(labels, angles, SOPHIA), [{ id: "4", texte: "test Sophia" }]);
});

Deno.test("choisirAngleActif : un seul angle par contenu, toujours le même, réparti entre les actifs", () => {
  const actifs = [
    { id: "a", texte: "côté A" },
    { id: "b", texte: "côté B" },
    { id: "c", texte: "côté C" },
  ];
  assertEquals(choisirAngleActif("contenu", []), null);
  assertEquals(choisirAngleActif("contenu", [actifs[0]]), actifs[0]);
  const contenu = "6f1c2a0e-1b2c-4d3e-8f90-123456789abc";
  assertEquals(choisirAngleActif(contenu, actifs), choisirAngleActif(contenu, [...actifs]));
  // 3 000 contenus : chaque angle en reçoit environ un tiers.
  const parAngle = new Map<string, number>();
  for (let i = 0; i < 3000; i += 1) {
    const id = crypto.randomUUID();
    const choisi = choisirAngleActif(id, actifs)!;
    parAngle.set(choisi.id, (parAngle.get(choisi.id) ?? 0) + 1);
  }
  for (const a of actifs) {
    const n = parAngle.get(a.id) ?? 0;
    assert(n > 850 && n < 1150, `${a.id} : ${n} contenus sur 3000`);
  }
});
