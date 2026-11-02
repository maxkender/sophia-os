import { assertEquals } from "jsr:@std/assert@1";

import { detecterDone, lienMessage, lireFil, texteDone } from "./cm_suivi.ts";

const PARENT = { ts: "1761300000.000100", bot_id: "B1", text: "New comment to post" };

Deno.test("texte : « done » ou ✅, pas « undone »", () => {
  assertEquals(texteDone("Done"), true);
  assertEquals(texteDone("done!"), true);
  assertEquals(texteDone("c'est fait ✅"), true);
  assertEquals(texteDone("fait :white_check_mark:"), true);
  assertEquals(texteDone("undone"), false);
  assertEquals(texteDone("abandoned"), false);
  assertEquals(texteDone("ok"), false);
});

Deno.test("Done par une réponse « done » dans le fil : qui et quand", () => {
  const d = detecterDone([PARENT, { ts: "1761300600.000200", user: "U1", text: "hello" }, { ts: "1761301200.000300", user: "U2", text: "DONE" }]);
  assertEquals(d, { mode: "fil", user: "U2", at: new Date(1761301200000).toISOString() });
});

Deno.test("Done par une réaction ✅ sur le message", () => {
  const d = detecterDone([{ ...PARENT, reactions: [{ name: "eyes", users: ["U9"] }, { name: "white_check_mark", users: ["U3"] }] }]);
  assertEquals(d, { mode: "reaction", user: "U3", at: null });
});

Deno.test("la première réponse l'emporte sur la réaction ; un bot ne compte pas", () => {
  const d = detecterDone([
    { ...PARENT, reactions: [{ name: "white_check_mark", users: ["U3"] }] },
    { ts: "1761300700.0", bot_id: "B1", text: "Done: 12 likes" },
    { ts: "1761300900.0", user: "U4", text: "✅" },
  ]);
  assertEquals(d?.mode, "fil");
  assertEquals(d?.user, "U4");
});

Deno.test("rien : pas de Done", () => {
  assertEquals(detecterDone([PARENT, { ts: "1761300700.0", user: "U1", text: "on it" }]), null);
  assertEquals(detecterDone([]), null);
});

Deno.test("lecture du fil et lien du message", async () => {
  const fetchFn = ((url: string) => {
    assertEquals(url.startsWith("https://slack.com/api/conversations.replies?channel=C1&ts=1.2"), true);
    return Promise.resolve(new Response(JSON.stringify({ ok: true, messages: [PARENT] })));
  }) as unknown as typeof fetch;
  assertEquals(await lireFil("xoxb", "C1", "1.2", fetchFn), { ok: true, fil: [PARENT] });
  assertEquals(lienMessage("C1", "1761300000.000100"), "https://slack.com/archives/C1/p1761300000000100");
});
