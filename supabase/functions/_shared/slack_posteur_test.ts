import { assertEquals } from "jsr:@std/assert@1";

import { prevenirPosteur, texteRecreation } from "./slack_posteur.ts";

function faux(reponses: Record<string, unknown[]>) {
  const appels: { methode: string; jeton: string; corps: string }[] = [];
  const fetchFn = ((url: string, init: RequestInit) => {
    const methode = url.split("/").pop()!;
    appels.push({
      methode,
      jeton: String((init.headers as Record<string, string>).authorization),
      corps: String(init.body),
    });
    const file = reponses[methode] ?? [{ ok: false, error: "inconnu" }];
    const r = file.length > 1 ? file.shift() : file[0];
    return Promise.resolve(new Response(JSON.stringify(r)));
  }) as unknown as typeof fetch;
  return { fetchFn, appels };
}

const TEXTE = texteRecreation({ ancien: "old", nouveau: "new", le: "Thu 29 Oct", lundi: "2 Nov" });

Deno.test("texte : ancien, nouveau, warm-up avant dimanche minuit, reprise lundi", () => {
  assertEquals(
    TEXTE,
    'Your TikTok account @old has been replaced by @new on Thu 29 Oct. Please create @new on TikTok and press "Start warmup" in the OS before Sunday midnight. Your posts resume on Monday 2 Nov.',
  );
});

Deno.test("email perso d'abord, puis l'email de connexion ; DM au premier trouvé", async () => {
  const { fetchFn, appels } = faux({
    "users.lookupByEmail": [{ ok: false, error: "users_not_found" }, { ok: true, user: { id: "U9" } }],
    "chat.postMessage": [{ ok: true }],
  });
  const r = await prevenirPosteur({ ecriture: "xoxb-hm" }, ["Ana@Perso.com", "ana@sophia.com"], TEXTE, fetchFn);
  assertEquals(r, { statut: "envoye", userId: "U9" });
  assertEquals(appels.map((a) => a.methode), ["users.lookupByEmail", "users.lookupByEmail", "chat.postMessage"]);
  assertEquals(appels[0].corps, "email=ana%40perso.com");
  assertEquals(appels[2].corps.startsWith("channel=U9"), true);
});

Deno.test("introuvable sous toutes ses adresses : rien n'est envoyé", async () => {
  const { fetchFn, appels } = faux({ "users.lookupByEmail": [{ ok: false, error: "users_not_found" }] });
  const r = await prevenirPosteur({ ecriture: "xoxb-hm" }, ["a@b.c", null, ""], TEXTE, fetchFn);
  assertEquals(r, { statut: "introuvable" });
  assertEquals(appels.map((a) => a.methode), ["users.lookupByEmail"]);
});

Deno.test("bot sans le droit de lire les emails : la recherche passe par le second jeton", async () => {
  const { fetchFn, appels } = faux({
    "users.lookupByEmail": [{ ok: false, error: "missing_scope" }, { ok: true, user: { id: "U2" } }],
    "chat.postMessage": [{ ok: true }],
  });
  const r = await prevenirPosteur({ ecriture: "xoxb-hm", lecture: "xoxb-lecture" }, ["a@b.c"], TEXTE, fetchFn);
  assertEquals(r, { statut: "envoye", userId: "U2" });
  assertEquals(appels.map((a) => a.jeton), ["Bearer xoxb-hm", "Bearer xoxb-lecture", "Bearer xoxb-hm"]);
});

Deno.test("échec d'envoi : erreur rendue, jamais levée", async () => {
  const { fetchFn } = faux({
    "users.lookupByEmail": [{ ok: true, user: { id: "U1" } }],
    "chat.postMessage": [{ ok: false, error: "channel_not_found" }],
  });
  const r = await prevenirPosteur({ ecriture: "xoxb-hm" }, ["a@b.c"], TEXTE, fetchFn);
  assertEquals(r, { statut: "erreur", erreur: "postMessage: channel_not_found" });
});
