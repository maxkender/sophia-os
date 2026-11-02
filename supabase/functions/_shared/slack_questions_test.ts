import { assertEquals } from "jsr:@std/assert@1";

import { epinglerQuestions, lienMessageSlack } from "./slack_questions.ts";

Deno.test("le lien permanent d'un message Slack", () => {
  assertEquals(lienMessageSlack("sophia-system", "D0123", "1700000000.000200"), "https://sophia-system.slack.com/archives/D0123/p1700000000000200");
  assertEquals(lienMessageSlack(null, "D0123", "1.2"), "https://sophia-system.slack.com/archives/D0123/p12");
});

Deno.test("#questions : posté puis épinglé ; épinglage refusé → dit", async () => {
  const appels: string[] = [];
  const faux = (pin: boolean) => ((url: string) => {
    appels.push(url.split("/").pop()!);
    const ok = url.endsWith("chat.postMessage") || pin;
    return Promise.resolve(new Response(JSON.stringify(ok ? { ok: true, ts: "1.2" } : { ok: false, error: "missing_scope" })));
  }) as unknown as typeof fetch;
  assertEquals(await epinglerQuestions("x", "C1", "Questions", faux(true)), { ok: true, ts: "1.2", erreur: null });
  assertEquals(appels, ["chat.postMessage", "pins.add"]);
  const r = await epinglerQuestions("x", "C1", "Questions", faux(false));
  assertEquals([r.ok, r.ts, r.erreur?.startsWith("pins.add : missing_scope")], [false, "1.2", true]);
});
