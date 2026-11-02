import { assertEquals } from "jsr:@std/assert@1";

import {
  applicationARemplacer,
  colonnesBleoPassage,
  type LignePlanBleo,
  lireRemplacantsBleo,
  prochaineLignePlan,
} from "./bleo_plan.ts";

const ligne = (creneau: number, contenuId: string, langue = "de"): LignePlanBleo => ({
  runId: "run",
  creneau,
  contenuId,
  langue,
  applicationId: null,
  fileBleo: "valeur",
  categorie: "recolte",
  valeurTirage: 2.1,
});

Deno.test("plan BLEO : les créneaux sont servis dans l'ordre, un seul essai chacun", () => {
  const restantes = [ligne(1, "a"), ligne(2, "b")];
  assertEquals(prochaineLignePlan(restantes, "de", [])?.contenuId, "a");
  assertEquals(prochaineLignePlan(restantes, "de", [])?.contenuId, "b");
  assertEquals(prochaineLignePlan(restantes, "de", []), null);
});

Deno.test("plan BLEO : saute un contenu déjà pris et une autre langue", () => {
  const restantes = [ligne(1, "a"), ligne(2, "b", "fr"), ligne(3, "c")];
  assertEquals(prochaineLignePlan(restantes, "de", ["a"])?.contenuId, "c");
  assertEquals(restantes.length, 0);
});

Deno.test("plan BLEO : colonnes du passage selon qu'il suit le plan ou non", () => {
  assertEquals(colonnesBleoPassage(ligne(1, "a"), true), {
    bras: "bleo",
    file_bleo: "valeur",
    valeur_tirage: 2.1,
    bleo_run_id: "run",
  });
  // Mode actif, créneau rendu à la tierlist.
  assertEquals(colonnesBleoPassage(null, true), { bras: "temoin" });
  // Mode ombre ou off : rien ne change dans le passage.
  assertEquals(colonnesBleoPassage(null, false), {});
});

Deno.test("remplaçant BLEO : l'application du créneau retiré, sinon celle de la répartition", () => {
  const plan = [
    { ...ligne(1, "a"), applicationId: "app-sophia" },
    { ...ligne(2, "b"), applicationId: "app-unswipe" },
  ];
  // revoquer-post exclut le contenu retiré : son créneau était Unswipe.
  assertEquals(applicationARemplacer(plan, ["b"], "app-defaut"), "app-unswipe");
  // Compte absent du plan, ou contenu retiré hors plan : la répartition décide.
  assertEquals(applicationARemplacer([], ["b"], "app-defaut"), "app-defaut");
  assertEquals(applicationARemplacer(plan, ["z"], null), null);
});

Deno.test("remplaçant BLEO : les candidats deviennent des lignes du plan (file valeur, créneau 0)", async () => {
  let appel: { fn: string; args: Record<string, unknown> } | null = null;
  const supabase = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      appel = { fn, args };
      return Promise.resolve({
        data: [
          { contenu_id: "c1", langue: "de", application_id: "app", valeur: "3.2", categorie: "recolte", relache: null },
          { contenu_id: "c2", langue: "de", application_id: null, valeur: null, categorie: "non_gagnant_neuve", relache: "budget" },
          { contenu_id: null, langue: "de" },
        ],
        error: null,
      });
    },
  } as unknown as Parameters<typeof lireRemplacantsBleo>[0];
  const lignes = await lireRemplacantsBleo(supabase, { runId: "run", jourVise: "2026-11-03" }, {
    compteId: "compte",
    jour: "2026-11-03",
    applicationId: "app",
    exclure: ["x", "y", "x"],
  });
  assertEquals(appel!.fn, "bleo_remplacants");
  assertEquals(appel!.args.p_exclure, ["x", "y"]);
  assertEquals(lignes.length, 2);
  assertEquals(lignes[0], {
    runId: "run",
    creneau: 0,
    contenuId: "c1",
    langue: "de",
    applicationId: "app",
    fileBleo: "valeur",
    categorie: "remplacement · recolte",
    valeurTirage: 3.2,
  });
  assertEquals(lignes[1].categorie, "remplacement · non_gagnant_neuve · relâche budget");
  assertEquals(lignes[1].valeurTirage, null);
  // Le passage créé est un passage BLEO, rattaché au run du jour.
  assertEquals(colonnesBleoPassage(lignes[0], true), {
    bras: "bleo",
    file_bleo: "valeur",
    valeur_tirage: 3.2,
    bleo_run_id: "run",
  });
});
