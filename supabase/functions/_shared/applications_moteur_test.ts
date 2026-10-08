import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";

import {
  erreurSchemaAbsent,
  oublierSondeMultiApp,
  schemaMultiAppPret,
  schemaMultiAppPretSinonSophia,
  sonderSchemaMultiApp,
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

/** Ce que rend PostgREST quand la base ne répond plus (mesuré : 503). */
const PGRST002 = {
  code: "PGRST002",
  message: "Could not query the database for the schema cache. Retrying.",
};

Deno.test("erreurSchemaAbsent : une panne de la base (503 PGRST002) n'est JAMAIS une absence", () => {
  // Le message parle du « schema cache » : l'ancienne règle y lisait « 0256
  // absente » et faisait publier en Sophia des comptes 100 % Unswipe.
  assert(!erreurSchemaAbsent(PGRST002, 503));
  assert(!erreurSchemaAbsent(PGRST002), "le code suffit, même sans statut");
  for (const code of ["PGRST000", "PGRST001", "PGRST003"]) {
    assert(!erreurSchemaAbsent({ code, message: "Database client error. Retrying the connection." }, 503), code);
  }
  assert(!erreurSchemaAbsent({ message: "... the schema cache ..." }), "« schema cache » seul ne dit rien");
});

Deno.test("erreurSchemaAbsent : un 5xx n'est jamais une absence, quel que soit le message", () => {
  assert(!erreurSchemaAbsent({ message: "Internal Server Error" }, 500));
  assert(!erreurSchemaAbsent(null, 500));
  assert(!erreurSchemaAbsent({ message: 'relation "public.label_applications" does not exist' }, 500));
  assert(!erreurSchemaAbsent({ code: "PGRST205", message: "Could not find the table" }, 503));
});

Deno.test("erreurSchemaAbsent : les vraies absences restent reconnues (code, 404, message explicite)", () => {
  assert(erreurSchemaAbsent({
    code: "PGRST205",
    message: "Could not find the table 'public.label_applications' in the schema cache",
  }, 404));
  assert(erreurSchemaAbsent({ code: "42703", message: "column passages.application_id does not exist" }, 400));
  assert(erreurSchemaAbsent({
    code: "PGRST204",
    message: "Could not find the 'langues' column of 'applications' in the schema cache",
  }, 400));
  // Sans code ni statut : seul un message EXPLICITE compte.
  assert(erreurSchemaAbsent({ message: 'relation "public.label_applications" does not exist' }));
  assert(erreurSchemaAbsent({ message: "column applications.actif does not exist" }));
  assert(erreurSchemaAbsent({ message: "Could not find the table 'public.applications' in the schema cache" }));
  assert(erreurSchemaAbsent({ message: "Could not find the 'actif' column of 'applications' in the schema cache" }));
  assert(!erreurSchemaAbsent({ message: "function public.truc() does not exist" }), "une fonction n'est pas le schéma 0256");
});

Deno.test("sonde : une panne PGRST002 (503) est « illisible », jamais « absente », et rien n'est mémorisé", async () => {
  oublierSondeMultiApp();
  const panne: Reponse = { data: null, error: PGRST002, status: 503 };
  const { client, lectures } = fauxClient({ label_applications: [panne, panne, OK] });
  assertEquals(await sonderSchemaMultiApp(client), "illisible");
  assertEquals(lectures.length, 2, "une seconde tentative, puis illisible");
  // Ni « absent » mémorisé 5 min, ni rien d'autre : la base revenue, la sonde
  // relit tout de suite et la voit prête.
  assertEquals(await sonderSchemaMultiApp(client), "pret");
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

Deno.test("sonde tolérante : illisible vaut « pas prête » (chemin Sophia), sans être mémorisé", async () => {
  oublierSondeMultiApp();
  const panne: Reponse = { data: null, error: { message: "" }, status: 503 };
  const { client } = fauxClient({ label_applications: [panne, panne, OK] });
  assertEquals(await sonderSchemaMultiApp(client), "illisible");
  oublierSondeMultiApp();
  const { client: client2 } = fauxClient({ label_applications: [panne, panne, OK] });
  assertEquals(await schemaMultiAppPretSinonSophia(client2), false);
  // Non mémorisé : la lecture suivante, saine, voit la base prête.
  assertEquals(await schemaMultiAppPretSinonSophia(client2), true);
});
