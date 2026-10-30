import { assertEquals } from "jsr:@std/assert@1";

import { historiqueCanal, messageAGarder } from "./slack_messages.ts";

Deno.test("prompt 27 : un message humain d'un canal est gardé, pas un bot ni un événement", () => {
  assertEquals(messageAGarder("C1", { user: "U1", ts: "1761000000.000100", text: "Is there an error?" })?.at, "2025-10-20T22:40:00.000Z");
  assertEquals(messageAGarder("C1", { user: "U1", ts: "1.2", text: "hi", bot_id: "B1" }), null);
  assertEquals(messageAGarder("C1", { user: "U1", ts: "1.2", text: "joined", subtype: "channel_join" }), null);
  assertEquals(messageAGarder("C1", { user: "U1", ts: "1.3", text: "reply", thread_ts: "1.2" })?.fil_ts, "1.2");
});

Deno.test("l'historique d'un canal, avec les réponses dans les fils", async () => {
  const faux = ((url: string) => {
    const corps = url.includes("conversations.history")
      ? { ok: true, messages: [{ user: "U1", ts: "100.1", text: "Question", reply_count: 1 }, { user: "U2", ts: "101.1", text: "Hello" }] }
      : { ok: true, messages: [{ user: "U1", ts: "100.1", text: "Question" }, { user: "U9", ts: "100.2", text: "Answer", thread_ts: "100.1" }] };
    return Promise.resolve(new Response(JSON.stringify(corps)));
  }) as unknown as typeof fetch;
  const r = await historiqueCanal("x", "C1", 0, faux);
  assertEquals(r.map((m) => [m.ts, m.slack_user, m.fil_ts]), [["100.1", "U1", null], ["101.1", "U2", null], ["100.2", "U9", "100.1"]]);
});
