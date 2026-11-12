import { assertEquals } from "jsr:@std/assert@1";

import { ecrireAuPosteur, prevenirPosteur, texteRecreation } from "./slack_posteur.ts";

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

function fauxSupabase(profil: Record<string, unknown>) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: profil, error: null }),
          // 0574 : l'email Slack des posteurs du site (hub_posteurs) ; aucun ici.
          maybeSingle: () => Promise.resolve({ data: table === "hub_posteurs" ? null : profil, error: null }),
        }),
      }),
    }),
    // Le grand interrupteur (0412) est lu avant tout envoi : ici, pas de pause.
    rpc: () => Promise.resolve({ data: false, error: null }),
  };
}

Deno.test("ecrireAuPosteur : l'ID Slack connu, sans chercher par email", async () => {
  Deno.env.set("SLACK_HM_BOT_TOKEN", "xoxb-hm");
  const { fetchFn, appels } = faux({ "chat.postMessage": [{ ok: true }] });
  const r = await ecrireAuPosteur(fauxSupabase({ slack_user_id: "U0SLACK1", email: "a@sophia.com" }), "p", "Hi", fetchFn);
  assertEquals(r, { statut: "envoye", userId: "U0SLACK1" });
  assertEquals(appels.map((a) => a.methode), ["chat.postMessage"]);
});

Deno.test("ecrireAuPosteur : sans ID Slack, par les emails", async () => {
  Deno.env.set("SLACK_HM_BOT_TOKEN", "xoxb-hm");
  const { fetchFn, appels } = faux({
    "users.lookupByEmail": [{ ok: true, user: { id: "U7" } }],
    "chat.postMessage": [{ ok: true }],
  });
  const r = await ecrireAuPosteur(fauxSupabase({ slack_user_id: null, email_perso: "x@y.z" }), "p", "Hi", fetchFn);
  assertEquals(r, { statut: "envoye", userId: "U7" });
  assertEquals(appels.map((a) => a.methode), ["users.lookupByEmail", "chat.postMessage"]);
});

Deno.test("0684 : un posteur qui a dit STOP ne reçoit plus de DM ; la confirmation d'arrêt et la paie passent", async () => {
  Deno.env.set("SLACK_HM_BOT_TOKEN", "xoxb-hm");
  const stop = { slack_user_id: "U0STOP", email: "s@sophia.com", relances_stop_at: "2026-11-12T16:00:00Z" };
  const a = faux({ "chat.postMessage": [{ ok: true }] });
  const r = await ecrireAuPosteur(fauxSupabase(stop), "p", "Reminder: start your warm-up", a.fetchFn);
  assertEquals(r.statut, "erreur");
  assertEquals(a.appels.length, 0);
  for (const motif of ["confirmation_arret", "paie"] as const) {
    const b = faux({ "chat.postMessage": [{ ok: true }] });
    const ok = await ecrireAuPosteur(fauxSupabase(stop), "p", "We've received your request.", b.fetchFn, undefined, { malgreStop: motif });
    assertEquals(ok, { statut: "envoye", userId: "U0STOP" });
  }
});

Deno.test("0692 : DM Slack aux posteurs en pause → rien ne part, aucune exception", async () => {
  Deno.env.set("SLACK_HM_BOT_TOKEN", "xoxb-hm");
  const a = faux({ "chat.postMessage": [{ ok: true }] });
  const pause = { slack_user_id: "U0P", email: "p@sophia.com", valeur: "off" };
  for (const motif of [undefined, "paie", "reponse", "manuel"] as const) {
    const r = await ecrireAuPosteur(fauxSupabase(pause), "p", "Hi", a.fetchFn, undefined, motif ? { malgreStop: motif } : {});
    assertEquals(r.statut, "erreur");
  }
  assertEquals(a.appels.length, 0);
});

Deno.test("0692 : la pause ne vise que les posteurs ; l'équipe (Max) reçoit son point du soir", async () => {
  Deno.env.set("SLACK_HM_BOT_TOKEN", "xoxb-hm");
  const a = faux({ "chat.postMessage": [{ ok: true }] });
  const profil = { slack_user_id: "U0MAX", email: "max@os.com", valeur: "off" };
  const base = fauxSupabase(profil);
  const db = {
    ...base,
    from: (table: string) =>
      table === "user_roles"
        ? { select: () => ({ eq: () => Promise.resolve({ data: [{ role: "admin" }], error: null }) }) }
        : base.from(table),
  };
  assertEquals(await ecrireAuPosteur(db, "max", "Bilan du soir", a.fetchFn), { statut: "envoye", userId: "U0MAX" });
});
