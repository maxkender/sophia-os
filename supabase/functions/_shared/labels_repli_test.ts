/**
 * Le repli « label le moins utilisé » ne donne qu'un label qui sert
 * l'application du compte créé.
 */
import { assertEquals, assertRejects } from "jsr:@std/assert@1";

import { filtrerPoolParApplication, labelsServantApplication } from "./labels_repli.ts";
import { ID_SOPHIA } from "./multi_app.ts";

const UNSWIPE = "00000000-0000-4000-8000-000000000003";
const MICABO = "00000000-0000-4000-8000-000000000002";

const liens = [
  { label_id: "unswipe-seul", application_id: UNSWIPE },
  { label_id: "partage", application_id: ID_SOPHIA },
  { label_id: "partage", application_id: UNSWIPE },
  { label_id: "micabo-seul", application_id: MICABO },
];
const pool = ["ancien", "unswipe-seul", "partage", "micabo-seul"];

Deno.test("Sophia : labels sans ligne et labels partagés, jamais un label d'une autre app seule", () => {
  assertEquals(labelsServantApplication(pool, liens, ID_SOPHIA), ["ancien", "partage"]);
  assertEquals(labelsServantApplication(pool, liens, null), ["ancien", "partage"]);
  assertEquals(labelsServantApplication(pool, liens, undefined), ["ancien", "partage"]);
});

Deno.test("Unswipe : seulement les labels qui le servent", () => {
  assertEquals(labelsServantApplication(pool, liens, UNSWIPE), ["unswipe-seul", "partage"]);
});

Deno.test("aucun lien : tout le pool sert Sophia (règle d'héritage)", () => {
  assertEquals(labelsServantApplication(pool, [], ID_SOPHIA), pool);
  assertEquals(labelsServantApplication(pool, [], UNSWIPE), []);
});

function fauxClient(reponse: { data: unknown; error: { message: string } | null }) {
  const appels: { table: string; colonnes: string; colonne: string; valeurs: string[] }[] = [];
  const client = {
    from(table: string) {
      return {
        select(colonnes: string) {
          return {
            in(colonne: string, valeurs: string[]) {
              appels.push({ table, colonnes, colonne, valeurs });
              return Promise.resolve(reponse);
            },
          };
        },
      };
    },
  };
  // deno-lint-ignore no-explicit-any
  return { client: client as any, appels };
}

Deno.test("filtrerPoolParApplication lit label_applications pour le pool, dédoublonné", async () => {
  const { client, appels } = fauxClient({ data: liens, error: null });
  const out = await filtrerPoolParApplication(client, [...pool, "partage", ""], ID_SOPHIA);
  assertEquals(out, ["ancien", "partage"]);
  assertEquals(appels, [{
    table: "label_applications",
    colonnes: "label_id, application_id",
    colonne: "label_id",
    valeurs: pool,
  }]);
});

Deno.test("filtrerPoolParApplication : pool vide, aucune lecture", async () => {
  const { client, appels } = fauxClient({ data: liens, error: null });
  assertEquals(await filtrerPoolParApplication(client, [], ID_SOPHIA), []);
  assertEquals(appels.length, 0);
});

Deno.test("filtrerPoolParApplication : lecture ratée, erreur levée (pas de repli sans filtre)", async () => {
  const { client } = fauxClient({ data: null, error: { message: "boom" } });
  await assertRejects(
    () => filtrerPoolParApplication(client, pool, ID_SOPHIA),
    Error,
    "boom",
  );
});
