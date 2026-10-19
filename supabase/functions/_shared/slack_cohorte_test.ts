/**
 * Ajout au salon de la cohorte Ruul : un poster pas encore dans Slack n'est
 * pas une erreur (on réessaie au prochain passage), un poster déjà dans le
 * salon compte comme ajouté.
 */

import { assertEquals } from "jsr:@std/assert@1";

import { ajouterAuSalon } from "./slack_cohorte.ts";

function faux(reponses: Record<string, unknown>) {
  const appels: string[] = [];
  const fetchFn = ((url: string | URL | Request) => {
    const methode = String(url).split("/api/")[1]!;
    appels.push(methode);
    return Promise.resolve(new Response(JSON.stringify(reponses[methode])));
  }) as typeof fetch;
  return { fetchFn, appels };
}

Deno.test("trouvé puis invité : ajouté", async () => {
  const { fetchFn, appels } = faux({
    "users.lookupByEmail": { ok: true, user: { id: "U1" } },
    "conversations.invite": { ok: true },
  });
  assertEquals(await ajouterAuSalon("t", "C1", "a@b.c", fetchFn), { cas: "ajoute", userId: "U1" });
  assertEquals(appels, ["users.lookupByEmail", "conversations.invite"]);
});

Deno.test("pas dans le workspace : absent, aucune invitation tentée", async () => {
  const { fetchFn, appels } = faux({ "users.lookupByEmail": { ok: false, error: "users_not_found" } });
  assertEquals(await ajouterAuSalon("t", "C1", "a@b.c", fetchFn), { cas: "absent" });
  assertEquals(appels, ["users.lookupByEmail"]);
});

Deno.test("déjà dans le salon : compte comme fait", async () => {
  const { fetchFn } = faux({
    "users.lookupByEmail": { ok: true, user: { id: "U1" } },
    "conversations.invite": { ok: false, error: "already_in_channel" },
  });
  assertEquals(await ajouterAuSalon("t", "C1", "a@b.c", fetchFn), { cas: "deja_dedans", userId: "U1" });
});

Deno.test("bot hors du salon ou scope manquant : erreur lisible", async () => {
  const { fetchFn } = faux({
    "users.lookupByEmail": { ok: true, user: { id: "U1" } },
    "conversations.invite": { ok: false, error: "not_in_channel" },
  });
  assertEquals(await ajouterAuSalon("t", "C1", "a@b.c", fetchFn), { cas: "erreur", erreur: "invite: not_in_channel" });

  const scope = faux({ "users.lookupByEmail": { ok: false, error: "missing_scope" } });
  assertEquals(await ajouterAuSalon("t", "C1", "a@b.c", scope.fetchFn), { cas: "erreur", erreur: "lookup: missing_scope" });
});
