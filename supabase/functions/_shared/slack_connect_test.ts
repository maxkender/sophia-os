/** Prompt 25 MAJ, 7a : « Connect my Slack » et le lien personnel du team_join. */
import { assertEquals } from "jsr:@std/assert@1";

import { identiteSlack, lienJeton, modeLienDm, proposerLienSlack, texteLienDm, urlConnexionSlack } from "./slack_connect.ts";

Deno.test("l'URL Sign in with Slack : scope openid, retour sur le dashboard", () => {
  const u = new URL(urlConnexionSlack({ clientId: "c", redirectUri: "https://os.app/lier-slack", state: "s", nonce: "n", team: "T1" }));
  assertEquals(u.origin + u.pathname, "https://slack.com/openid/connect/authorize");
  assertEquals(u.searchParams.get("scope"), "openid");
  assertEquals(u.searchParams.get("redirect_uri"), "https://os.app/lier-slack");
  assertEquals(u.searchParams.get("team"), "T1");
});

Deno.test("le code échangé donne l'ID Slack du membre", async () => {
  const appels: string[] = [];
  const f = ((url: string) => {
    appels.push(url);
    if (url.endsWith("openid.connect.token")) return Promise.resolve(new Response(JSON.stringify({ ok: true, access_token: "x" })));
    return Promise.resolve(new Response(JSON.stringify({ ok: true, "https://slack.com/user_id": "U123", "https://slack.com/team_id": "T1" })));
  }) as unknown as typeof fetch;
  const r = await identiteSlack({ code: "c", redirectUri: "r", clientId: "i", clientSecret: "s" }, f);
  assertEquals(r, { slack_user_id: "U123", team_id: "T1", erreur: null });
  assertEquals(appels.length, 2);
  const ko = (() => Promise.resolve(new Response(JSON.stringify({ ok: false, error: "invalid_code" })))) as unknown as typeof fetch;
  assertEquals((await identiteSlack({ code: "c", redirectUri: "r", clientId: "i", clientSecret: "s" }, ko)).erreur, "token : invalid_code");
});

Deno.test("le texte du DM et le lien personnel", () => {
  const l = lienJeton("https://os.app/", "abc");
  assertEquals(l, "https://os.app/lier-slack?t=abc");
  assertEquals(texteLienDm(null, l), "Welcome! Click here to link your account: https://os.app/lier-slack?t=abc");
  assertEquals(texteLienDm("Hello", l), "Hello https://os.app/lier-slack?t=abc");
  assertEquals(modeLienDm(undefined), "off");
  assertEquals(modeLienDm("on"), "on");
});

function db(mode: string) {
  const maj: unknown[] = [];
  return {
    maj,
    from: (t: string) => ({
      select: () => ({ in: () => Promise.resolve({ data: t === "reglages" ? [{ cle: "slack_lien_dm_auto", valeur: mode }] : [] }) }),
      update: (v: unknown) => ({ eq: () => Promise.resolve((maj.push(v), { error: null })) }),
    }),
    rpc: () => Promise.resolve({ data: "jeton1", error: null }),
  };
}

Deno.test("off : rien ; test : le lien est créé, rien ne part ; on : le DM part", async () => {
  let posts = 0;
  const f = (() => Promise.resolve((posts++, new Response(JSON.stringify({ ok: true }))))) as unknown as typeof fetch;
  assertEquals((await proposerLienSlack(db("off"), "U1", { osUrl: "https://os.app", ecriture: "t", fetchFn: f })).statut, "off");
  assertEquals((await proposerLienSlack(db("test"), "U1", { osUrl: "https://os.app", ecriture: "t", fetchFn: f })).statut, "test");
  assertEquals(posts, 0);
  const d = db("on");
  assertEquals((await proposerLienSlack(d, "U1", { osUrl: "https://os.app", ecriture: "t", fetchFn: f })).statut, "envoye");
  assertEquals(posts, 1);
});
