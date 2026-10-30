import { assertEquals } from "jsr:@std/assert@1";

import { decoderHtml, derniersMessagesSalon } from "./contexte.ts";

Deno.test("prompt 27 : les derniers messages d'une conversation Upwork, des deux côtés, triés", () => {
  const noeuds = [
    { id: "1", createdDateTime: "2026-10-20T10:00:00Z", message: "Hi, welcome", user: { id: "client" } },
    { id: "2", createdDateTime: "2026-10-22T09:00:00Z", message: "I'm sick this week", user: { id: "f1" } },
    { id: "3", createdDateTime: "2026-10-21T09:00:00Z", message: "  ", user: { id: "f1" } },
    { id: "4", createdDateTime: "2026-10-23T08:00:00Z", message: "Get well soon", user: { id: "client" } },
    null,
  ];
  const r = derniersMessagesSalon(noeuds, "f1");
  assertEquals(r.map((m) => [m.id, m.de]), [["4", "nous"], ["2", "posteur"], ["1", "nous"]]);
  assertEquals(derniersMessagesSalon(noeuds, "f1", 1).length, 1);
});

Deno.test("le texte encodé en HTML par Upwork est décodé", () => {
  assertEquals(decoderHtml("I&#39;m also wondering &amp; &quot;more&quot;"), 'I\'m also wondering & "more"');
});
