/**
 * Test à blanc — la pose de l'intercepteur par assignation-a-blanc/installer.ts.
 *
 * Ce fichier a son propre isolate de test : la pose y est VERROUILLÉE comme en
 * production (fetch non réinscriptible), sans effet sur les autres tests.
 */

import { assert, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";

import { intercepteurActif } from "./a_blanc_intercepteur.ts";

const installer = new URL("../assignation-a-blanc/installer.ts", import.meta.url).href;

Deno.test("installer : sans SUPABASE_URL, ne lève pas et reste inactif (la fonction refusera tout)", async () => {
  const avant = Deno.env.get("SUPABASE_URL");
  Deno.env.delete("SUPABASE_URL");
  try {
    const { etatInstallation } = await import(`${installer}?sans-url`);
    assertEquals(etatInstallation, { actif: false, verrouille: false, erreur: "SUPABASE_URL manquant" });
    assertEquals(intercepteurActif(), false);
  } finally {
    if (avant !== undefined) Deno.env.set("SUPABASE_URL", avant);
  }
});

Deno.test("installer : pose verrouillée — actif, non réinscriptible, tout bloqué hors contexte", async () => {
  Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
  const { etatInstallation } = await import(`${installer}?avec-url`);
  assertEquals(etatInstallation, { actif: true, verrouille: true, erreur: null });
  assert(intercepteurActif());
  const pose = globalThis.fetch;
  assertThrows(() => {
    (globalThis as { fetch: unknown }).fetch = () => Promise.resolve(new Response("vrai"));
  }, TypeError);
  assertEquals(globalThis.fetch, pose, "personne ne peut remettre un autre fetch");
  // Hors contexte de test : même une lecture est refusée, rien ne sort.
  const warn = console.warn;
  console.warn = () => {};
  try {
    const r = await fetch("https://test.supabase.co/rest/v1/comptes?select=id");
    assertEquals(r.status, 403);
    assertEquals((await r.json()).code, "ABLANC");
    await assertRejects(() => fetch("https://queue.fal.run/x", { method: "POST" }), TypeError);
  } finally {
    console.warn = warn;
  }
  // Une seconde pose est refusée, sans lever au chargement.
  const { etatInstallation: second } = await import(`${installer}?seconde`);
  assertEquals(second.actif, false);
  assert(String(second.erreur).includes("déjà installé"));
});
