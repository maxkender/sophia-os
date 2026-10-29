/** Prompt 22 : le grand interrupteur, sans réseau. */
import { assertEquals } from "jsr:@std/assert@1";

import { automationEnPause, bloquer, PAUSE } from "./pause.ts";
import { ecrireAuPosteur } from "./slack_posteur.ts";

function db(pause: boolean | "erreur") {
  const appels: { fn: string; args?: Record<string, unknown> }[] = [];
  return {
    appels,
    rpc(fn: string, args?: Record<string, unknown>) {
      appels.push({ fn, args });
      if (fn === "automation_en_pause") {
        return Promise.resolve(pause === "erreur" ? { data: null, error: { message: "x" } } : { data: pause, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
    from() {
      throw new Error("ne doit pas lire le profil quand c'est en pause");
    },
  };
}

Deno.test("en pause : bloqué et noté (motif paused) ; sinon rien n'est noté", async () => {
  const d = db(true);
  assertEquals(await bloquer(d, { fonction: "upwork", action: "message", cible: "c1" }), true);
  assertEquals(d.appels.map((a) => a.fn), ["automation_en_pause", "noter_action_bloquee"]);
  assertEquals(d.appels[1]!.args, { p_fonction: "upwork", p_action: "message", p_poster: null, p_cible: "c1", p_detail: null });
  const libre = db(false);
  assertEquals(await bloquer(libre, { fonction: "upwork", action: "message" }), false);
  assertEquals(libre.appels.map((a) => a.fn), ["automation_en_pause"]);
});

Deno.test("état illisible : prudence, tout est bloqué ; une lecture par minute", async () => {
  assertEquals(await automationEnPause(db("erreur")), true);
  const d = db(false);
  await automationEnPause(d);
  await automationEnPause(d);
  assertEquals(d.appels.length, 1);
});

Deno.test("aucun message Slack au posteur pendant la pause (avant même le profil)", async () => {
  Deno.env.set("SLACK_HM_BOT_TOKEN", "xoxb-test");
  let appelsSlack = 0;
  const fetchFaux = (() => {
    appelsSlack++;
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  const issue = await ecrireAuPosteur(db(true), "p1", "Hi", fetchFaux);
  assertEquals(issue, { statut: "erreur", erreur: PAUSE });
  assertEquals(appelsSlack, 0);
});
