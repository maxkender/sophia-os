/**
 * Garde structurelle : un angle EN TEST ne doit JAMAIS atteindre un placement
 * véritable (nuit, assignation, variations…). Seul le test à blanc
 * « contenus » (a_blanc_contenus.ts) lit les angles en test et impose un angle
 * au placement. Ce test parcourt le code des fonctions Edge et échoue si un
 * autre fichier lit les angles en test ou passe un angle imposé.
 */

import { assertEquals } from "jsr:@std/assert@1";

const RACINE = new URL("..", import.meta.url).pathname;

/** Mot → fichiers (relatifs à supabase/functions) qui ont le droit de l'employer. */
const AUTORISES: Record<string, string[]> = {
  // Lecture des angles en test : définie ici, lue par le test à blanc seulement.
  chargerAnglesTest: ["_shared/applications_moteur.ts", "_shared/a_blanc_contenus.ts"],
  anglesTestPourApplication: ["_shared/angle_placement.ts", "_shared/applications_moteur.ts"],
  // Angle imposé au placement : défini dans deck_application, passé par le test à blanc seulement.
  angleBrouillon: ["_shared/deck_application.ts", "_shared/a_blanc_contenus.ts"],
  // Option qui seule permet un angle imposé : test à blanc seulement.
  ignorerCache: ["_shared/deck_application.ts", "_shared/a_blanc_contenus.ts"],
};

async function* fichiersTs(dossier: string): AsyncGenerator<string> {
  for await (const e of Deno.readDir(dossier)) {
    const chemin = `${dossier}/${e.name}`;
    if (e.isDirectory) {
      if (e.name === "node_modules") continue;
      yield* fichiersTs(chemin);
    } else if (e.name.endsWith(".ts") && !e.name.endsWith("_test.ts") && !e.name.endsWith("_test_utils.ts")) {
      yield chemin;
    }
  }
}

Deno.test("angles en test : lus et imposés par le test à blanc « contenus » SEULEMENT", async () => {
  const trouves: Record<string, string[]> = {};
  for await (const chemin of fichiersTs(RACINE.replace(/\/$/, ""))) {
    const texte = await Deno.readTextFile(chemin);
    const relatif = chemin.slice(RACINE.length).replace(/^\//, "");
    for (const mot of Object.keys(AUTORISES)) {
      if (new RegExp(`\\b${mot}\\b`).test(texte)) (trouves[mot] ??= []).push(relatif);
    }
  }
  for (const [mot, permis] of Object.entries(AUTORISES)) {
    assertEquals((trouves[mot] ?? []).sort(), [...permis].sort(), `« ${mot} » employé hors du test à blanc`);
  }
});
