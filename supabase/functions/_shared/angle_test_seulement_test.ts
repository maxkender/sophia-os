/**
 * Garde structurelle : un angle EN TEST ne doit JAMAIS atteindre un placement
 * véritable (nuit, assignation, variations…). Seul le test à blanc
 * « contenus » (a_blanc_contenus.ts) lit les angles en test et impose un angle
 * au placement. Ce test parcourt le code des fonctions Edge et échoue si un
 * autre fichier lit les angles en test ou passe un angle imposé.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

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
  // Lecture brute de la table (tous statuts) : privée au moteur des angles.
  lireAnglesDuContenu: ["_shared/applications_moteur.ts"],
};

/** Lecture directe de la table : seul applications_moteur.ts filtre par statut. */
const LECTURE_TABLE = /\.from\(\s*["'`]angles_placement["'`]/;
const LECTEURS_TABLE = ["_shared/applications_moteur.ts"];

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
  const lecteurs: string[] = [];
  for await (const chemin of fichiersTs(RACINE.replace(/\/$/, ""))) {
    const texte = await Deno.readTextFile(chemin);
    const relatif = chemin.slice(RACINE.length).replace(/^\//, "");
    for (const mot of Object.keys(AUTORISES)) {
      if (new RegExp(`\\b${mot}\\b`).test(texte)) (trouves[mot] ??= []).push(relatif);
    }
    if (LECTURE_TABLE.test(texte)) lecteurs.push(relatif);
  }
  for (const [mot, permis] of Object.entries(AUTORISES)) {
    assertEquals((trouves[mot] ?? []).sort(), [...permis].sort(), `« ${mot} » employé hors du test à blanc`);
  }
  assertEquals(lecteurs.sort(), LECTEURS_TABLE, "angles_placement lue hors de applications_moteur.ts");
});

Deno.test("angles en test : le lecteur de la nuit ne demande que l'actif, celui du test à blanc seul demande « test »", async () => {
  const texte = await Deno.readTextFile(`${RACINE.replace(/\/$/, "")}/_shared/applications_moteur.ts`);
  assert(!/export\s+(async\s+)?function\s+lireAnglesDuContenu/.test(texte), "lireAnglesDuContenu reste privée");
  const corps = (nom: string) => {
    const debut = texte.indexOf(`export async function ${nom}(`);
    assert(debut >= 0, `${nom} introuvable`);
    const fin = texte.indexOf("\n}\n", debut);
    return texte.slice(debut, fin);
  };
  const appels = [...texte.matchAll(/lireAnglesDuContenu\(([^)]*)\)/g)].map((m) => m[1].trim());
  // La définition + un appel « actif » + un appel « test ».
  assertEquals(appels.filter((a) => a.endsWith('"test"')).length, 1, appels.join(" | "));
  assertEquals(appels.filter((a) => a.endsWith('"actif"')).length, 1, appels.join(" | "));
  assert(corps("chargerAnglePlacement").includes('"actif")') && !corps("chargerAnglePlacement").includes('"test"'));
  assert(corps("chargerAnglesTest").includes('"test")'));
});
