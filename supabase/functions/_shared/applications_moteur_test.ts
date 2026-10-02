import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";

import {
  erreurSchemaAbsent,
  oublierSondeMultiApp,
  schemaMultiAppPret,
} from "./applications_moteur.ts";

type Reponse = { data: unknown; error: { code?: string; message?: string } | null; status: number };

/**
 * Faux client : chaque table répond une réponse fixe (ou une suite de
 * réponses, consommées dans l'ordre). Compte les lectures.
 */
function fauxClient(reponses: Record<string, Reponse | Reponse[]>) {
  const lectures: string[] = [];
  const client = {
    from(table: string) {
      return {
        select(_colonnes: string) {
          return {
            limit(_n: number) {
              lectures.push(table);
              const r = reponses[table];
              const suivante = Array.isArray(r) ? (r.length > 1 ? r.shift()! : r[0]) : r;
              return Promise.resolve(suivante ?? { data: [], error: null, status: 200 });
            },
          };
        },
      };
    },
  };
  // deno-lint-ignore no-explicit-any
  return { client: client as any, lectures };
}

const OK: Reponse = { data: [], error: null, status: 200 };

Deno.test("erreurSchemaAbsent : seules l'absence de table / colonne comptent", () => {
  assert(erreurSchemaAbsent({ code: "PGRST205", message: "Could not find the table" }, 404));
  assert(erreurSchemaAbsent({ code: "42P01", message: "relation does not exist" }, 400));
  assert(erreurSchemaAbsent({ code: "42703", message: "column applications.langues does not exist" }, 400));
  assert(erreurSchemaAbsent(null, 404));
  assert(!erreurSchemaAbsent({ code: "", message: "" }, 502));
  assert(!erreurSchemaAbsent({ message: "fetch failed" }, 0));
  assert(!erreurSchemaAbsent({ code: "57014", message: "canceling statement due to statement timeout" }, 500));
});

Deno.test("sonde : 0256 absente (table inconnue en GET) → faux, et SANS HEAD", async () => {
  oublierSondeMultiApp();
  const { client, lectures } = fauxClient({
    label_applications: {
      data: null,
      error: { code: "PGRST205", message: "Could not find the table 'public.label_applications'" },
      status: 404,
    },
  });
  assertEquals(await schemaMultiAppPret(client), false);
  assertEquals(lectures, ["label_applications"]);
});

Deno.test("sonde : 404 sans erreur (le piège HEAD de postgrest-js) n'est jamais « prête »", async () => {
  oublierSondeMultiApp();
  const { client } = fauxClient({
    label_applications: { data: null, error: null, status: 404 },
  });
  assertEquals(await schemaMultiAppPret(client), false);
});

Deno.test("sonde : migration partielle (colonne absente) → faux", async () => {
  oublierSondeMultiApp();
  const { client } = fauxClient({
    label_applications: OK,
    applications: {
      data: null,
      error: { code: "42703", message: "column applications.langues does not exist" },
      status: 400,
    },
  });
  assertEquals(await schemaMultiAppPret(client), false);
});

Deno.test("sonde : présente → vrai, mémorisé pour la vie de l'isolate", async () => {
  oublierSondeMultiApp();
  const { client, lectures } = fauxClient({});
  assertEquals(await schemaMultiAppPret(client), true);
  assertEquals(lectures, ["label_applications", "applications", "passages"]);
  assertEquals(await schemaMultiAppPret(client), true);
  assertEquals(lectures.length, 3, "aucune nouvelle lecture une fois prête");
});

Deno.test("sonde : un 502 passager est retenté, puis la sonde LÈVE sans rien mémoriser", async () => {
  oublierSondeMultiApp();
  const panne: Reponse = { data: null, error: { message: "" }, status: 502 };
  const { client, lectures } = fauxClient({ label_applications: [panne, panne, OK] });
  await assertRejects(() => schemaMultiAppPret(client), Error, "illisible");
  assertEquals(lectures.length, 2, "une seconde tentative avant de lever");
  // Rien n'a été mémorisé : l'appel suivant relit, et voit la base saine.
  assertEquals(await schemaMultiAppPret(client), true);
});

Deno.test("sonde : un 502 suivi d'une lecture saine passe", async () => {
  oublierSondeMultiApp();
  const panne: Reponse = { data: null, error: { message: "Bad Gateway" }, status: 502 };
  const { client } = fauxClient({ label_applications: [panne, OK] });
  assertEquals(await schemaMultiAppPret(client), true);
});
