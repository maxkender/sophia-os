/**
 * Placement d'une application non-Sophia : le prompt et ses garde-fous.
 *
 * Ce qu'on épingle : le texte Sophia ne fuit JAMAIS dans le prompt d'une autre
 * application (ni sa doctrine, ni ses corrections), le bloc d'angles n'apparaît
 * que s'il existe, et une variante qui oublie l'application ou cite Sophia est
 * écartée de façon déterministe — quoi que dise le modèle.
 */

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import { blocAngles } from "./multi_app.ts";
import {
  construirePromptPlacementApplication,
  integrerApplication,
  type PlacementApplicationEntree,
  positionsAutorisees,
  variantesValidesApplication,
} from "./placement_application.ts";

const UNSWIPE = { slug: "unswipe", nom: "Unswipe" };

function entree(surcharge: Partial<PlacementApplicationEntree> = {}): PlacementApplicationEntree {
  return {
    masterPrompt: "Prompt maître Unswipe : reprendre le contrôle de son temps.",
    slides: [
      { position: 1, text: "5 habitudes pour arrêter de scroller" },
      { position: 2, text: "1. je laisse mon téléphone hors de la chambre" },
      { position: 3, text: "2. je coupe les notifications" },
      { position: 4, text: "3. je lis avant de dormir" },
      { position: 5, text: "4. je marche sans écouteurs" },
    ],
    caption: "#digitaldetox",
    langue: "de",
    application: UNSWIPE,
    angles: "",
    ...surcharge,
  };
}

Deno.test("prompt : règles de marque génériques écrites avec le nom de l'application", () => {
  const prompt = construirePromptPlacementApplication(entree());

  assert(prompt.startsWith("LANGUE DE SORTIE : ALLEMAND."), "la langue ouvre le prompt");
  assertStringIncludes(prompt, "Prompt maître Unswipe : reprendre le contrôle de son temps.");
  assertStringIncludes(prompt, "Application à placer : Unswipe");
  assertStringIncludes(prompt, "Le nom « Unswipe » ne se traduit jamais");
  assertStringIncludes(prompt, "« the Unswipe app »");
  assertStringIncludes(prompt, "« die Unswipe-App »");
  assertStringIncludes(prompt, "« Unswipe\n  uygulaması »");
  assertStringIncludes(prompt, "N'écris JAMAIS la forme française\n  « l'appli »");
  assertStringIncludes(prompt, "ne citer AUCUNE autre application ni marque que Unswipe");
  // Positions permises : les 3 dernières, jamais la couverture.
  assertStringIncludes(prompt, "UNIQUEMENT : 3, 4, 5.");
  assertStringIncludes(prompt, '"variants": ["A","B","C"], "best": 0}');
});

Deno.test("prompt : aucune doctrine Sophia, aucune correction Sophia", () => {
  const prompt = construirePromptPlacementApplication(entree());

  for (const fuite of [
    "MENTION DE SOPHIA",
    "micro-apprentissage",
    "Sophia-App",
    "the Sophia app",
    "Sophia uygulaması",
    "Corrections passées",
    "La slide Sophia",
  ]) {
    assert(!prompt.includes(fuite), `fuite du prompt Sophia : ${fuite}`);
  }
  // La seule occurrence de Sophia est l'interdiction de la citer.
  const occurrences = prompt.match(/sophia/gi) ?? [];
  assertEquals(occurrences.length, 1);
  assertStringIncludes(prompt, "jamais Sophia");
});

Deno.test("prompt : le bloc d'angles n'apparaît que s'il est non vide", () => {
  const sans = construirePromptPlacementApplication(entree({ angles: "" }));
  assert(!sans.includes("Angle à donner"));
  // Sans angle, les slides enchaînent directement sur la sortie.
  assertStringIncludes(sans, 'Slide 5 : "4. je marche sans écouteurs"\n\n--- SORTIE ---');

  const bloc = blocAngles([{ label: "Clean Girl", angle: "reprends le contrôle de ton temps" }], "Unswipe");
  const avec = construirePromptPlacementApplication(entree({ angles: bloc }));
  assertStringIncludes(
    avec,
    'Slide 5 : "4. je marche sans écouteurs"\n\nAngle à donner à Unswipe pour ce slideshow (selon son label) :\n- Clean Girl : reprends le contrôle de ton temps\n\n--- SORTIE ---',
  );
  assert(avec.indexOf("Angle à donner") < avec.indexOf("--- SORTIE ---"), "l'angle est une donnée");
});

Deno.test("positions autorisées : 3 dernières, jamais la slide 1", () => {
  assertEquals(positionsAutorisees([{ position: 1 }, { position: 2 }]), [2]);
  assertEquals(positionsAutorisees([{ position: 1 }]), []);
  assertEquals(
    positionsAutorisees([{ position: 4 }, { position: 1 }, { position: 3 }, { position: 2 }]),
    [2, 3, 4],
  );
});

Deno.test("variantes : il faut le nom de l'application, et jamais Sophia", () => {
  const brutes = [
    "3. die Unswipe-App hilft mir dabei",
    "3. die App hilft mir dabei",
    "3. Unswipe und Sophia helfen mir",
    "3. mit der unswipe-app klappt das",
    "3. l'appli Unswipe m'aide",
  ];
  assertEquals(variantesValidesApplication(brutes, "de", "Unswipe"), [
    "3. die Unswipe-App hilft mir dabei",
    "3. mit der unswipe-app klappt das",
  ]);
  // En français, « l'appli » est la formule attendue.
  assertEquals(variantesValidesApplication(["3. l'appli Unswipe m'aide"], "fr", "Unswipe"), [
    "3. l'appli Unswipe m'aide",
  ]);
  // « Sophia » en mot entier seulement.
  assertEquals(variantesValidesApplication(["Unswipe & SOPHIA"], "en", "Unswipe"), []);
  assertEquals(variantesValidesApplication(["Unswipe, sophiatown"], "en", "Unswipe"), [
    "Unswipe, sophiatown",
  ]);
});

/** Fausse API Gemini : une réponse par appel, dans l'ordre. */
async function avecGemini<T>(
  reponses: string[],
  fn: () => Promise<T>,
): Promise<{ resultat: T; prompts: string[] }> {
  const vraiFetch = globalThis.fetch;
  const avaitCle = Deno.env.get("GEMINI_API_KEY");
  const prompts: string[] = [];
  Deno.env.set("GEMINI_API_KEY", avaitCle ?? "cle-de-test");
  globalThis.fetch = ((_url: string, init?: RequestInit) => {
    prompts.push(JSON.parse(String(init?.body)).contents[0].parts[0].text);
    const texte = reponses[Math.min(prompts.length - 1, reponses.length - 1)];
    return Promise.resolve(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texte }] } }] }), {
        status: 200,
      }),
    );
  }) as typeof fetch;
  try {
    return { resultat: await fn(), prompts };
  } finally {
    globalThis.fetch = vraiFetch;
    if (avaitCle === undefined) Deno.env.delete("GEMINI_API_KEY");
  }
}

const sansAttente = { attendre: () => Promise.resolve() };

Deno.test("integrerApplication : variantes toutes invalides → relance, puis résultat filtré", async () => {
  const { resultat, prompts } = await avecGemini(
    [
      JSON.stringify({ chosen_position: 4, mode: "confession", variants: ["3. Sophia hilft", "3. eine App hilft"], best: 0 }),
      JSON.stringify({
        chosen_position: 4,
        mode: "confession",
        variants: ["3. Sophia hilft", "3. die Unswipe-App hilft", "3. Unswipe hilft mir"],
        best: 2,
      }),
    ],
    () => integrerApplication(entree(), sansAttente),
  );

  assertEquals(prompts.length, 2, "le premier essai sans variante valable est relancé");
  assertEquals(resultat, {
    chosenPosition: 4,
    mode: "confession",
    variants: ["3. die Unswipe-App hilft", "3. Unswipe hilft mir"],
    // `best` visait la 3e variante brute : on la suit à travers le filtre.
    bestIndex: 1,
  });
});

Deno.test("integrerApplication : position hors zone ramenée sur la dernière autorisée", async () => {
  const { resultat } = await avecGemini(
    [JSON.stringify({ chosen_position: 1, mode: "instructif", variants: ["Unswipe"], best: 0 })],
    () => integrerApplication(entree(), sansAttente),
  );
  assertEquals(resultat?.chosenPosition, 5);
});

Deno.test("integrerApplication : 4 essais sans variante valable → null (jamais de repli)", async () => {
  const attentes: number[] = [];
  const { resultat, prompts } = await avecGemini(
    [JSON.stringify({ chosen_position: 4, mode: "instructif", variants: ["l'app Sophia"], best: 0 })],
    () =>
      integrerApplication(entree(), {
        attendre: (ms) => {
          attentes.push(ms);
          return Promise.resolve();
        },
      }),
  );
  assertEquals(resultat, null);
  assertEquals(prompts.length, 4);
  assertEquals(attentes.length, 3, "une attente entre chaque essai");
});

Deno.test("integrerApplication : réponse illisible → relance", async () => {
  const { resultat, prompts } = await avecGemini(
    ["pas du json", JSON.stringify({ chosen_position: 3, mode: "instructif", variants: ["Unswipe !"], best: 7 })],
    () => integrerApplication(entree(), sansAttente),
  );
  assertEquals(prompts.length, 2);
  assertEquals(resultat?.bestIndex, 0, "best hors bornes → première variante valable");
});
