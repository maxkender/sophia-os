/**
 * Test à blanc — déploiement : `scripts/fonctions-touchees.mjs` (celui du
 * workflow deploy-edge-functions) doit rattacher chaque pièce du test à blanc
 * à la fonction `assignation-a-blanc`, et à ELLE SEULE.
 *
 *  - un correctif de l'intercepteur ou de installer.ts doit la redéployer
 *    (d'où l'import NOMMÉ de installer.ts : le script ne suit que `from "…"`) ;
 *  - aucune fonction existante n'importe un module a_blanc_* : la nuit,
 *    l'assignation test et Sophia ne sont jamais redéployées par ce chantier ;
 *  - les fichiers de test ne sont importés par aucune fonction.
 */

import { assertEquals } from "jsr:@std/assert@1";

const RACINE = new URL("../../../", import.meta.url);

async function touchees(fichiers: string[]): Promise<string> {
  const sortie = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "scripts/fonctions-touchees.mjs", ...fichiers],
    cwd: RACINE,
    env: { DETAIL: "0" },
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!sortie.success) throw new Error(new TextDecoder().decode(sortie.stderr));
  return new TextDecoder().decode(sortie.stdout).trim();
}

const MODULES = [
  "supabase/functions/_shared/a_blanc_postgrest.ts",
  "supabase/functions/_shared/a_blanc_calque.ts",
  "supabase/functions/_shared/a_blanc_intercepteur.ts",
  "supabase/functions/_shared/a_blanc_decks.ts",
  "supabase/functions/_shared/a_blanc_execution.ts",
  "supabase/functions/assignation-a-blanc/installer.ts",
  "supabase/functions/assignation-a-blanc/index.ts",
];

Deno.test("déploiement : chaque pièce du test à blanc redéploie assignation-a-blanc, et elle seule", async () => {
  for (const f of MODULES) assertEquals(await touchees([f]), "assignation-a-blanc", f);
  assertEquals(await touchees(MODULES), "assignation-a-blanc");
});

Deno.test("déploiement : les fichiers de test ne sont importés par aucune fonction", async () => {
  const tests = [
    "supabase/functions/_shared/a_blanc_test_utils.ts",
    "supabase/functions/_shared/a_blanc_postgrest_test.ts",
    "supabase/functions/_shared/a_blanc_calque_test.ts",
    "supabase/functions/_shared/a_blanc_intercepteur_test.ts",
    "supabase/functions/_shared/a_blanc_decks_test.ts",
    "supabase/functions/_shared/a_blanc_execution_test.ts",
    "supabase/functions/_shared/a_blanc_deploiement_test.ts",
    "supabase/functions/_shared/a_blanc_installer_test.ts",
  ];
  assertEquals(await touchees(tests), "");
});
