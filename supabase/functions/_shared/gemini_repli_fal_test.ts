import { assertEquals } from "jsr:@std/assert@1";

import { callWithFallback, corpsRepliFal, MODELE_REPLI_FAL } from "./gemini.ts";

Deno.test("repli fal : corps texte, puis vision avec les images en data URI", () => {
  assertEquals(corpsRepliFal([{ text: "Traduis" }, { text: "Bonjour" }]), {
    modelId: "fal-ai/any-llm",
    body: { prompt: "Traduis\n\nBonjour", model: MODELE_REPLI_FAL },
  });
  const vision = corpsRepliFal([{ text: "Lis" }, { inline_data: { mime_type: "image/png", data: "AAA" } }], { temperature: 0.2 });
  assertEquals(vision.modelId, "fal-ai/any-llm/vision");
  assertEquals(vision.body.image_urls, ["data:image/png;base64,AAA"]);
  assertEquals(vision.body.temperature, 0.2);
});

Deno.test("repli fal : Gemini à 402, la réponse vient de fal sans réessai", async () => {
  const avant = globalThis.fetch;
  Deno.env.set("GEMINI_API_KEY", "test");
  Deno.env.set("FAL_KEY", "test");
  const appels: string[] = [];
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    appels.push(url.replace(/\?.*$/, ""));
    if (url.includes("generativelanguage")) {
      return Promise.resolve(new Response('{"error":{"code":402,"status":"RESOURCE_EXHAUSTED"}}', { status: 402 }));
    }
    return Promise.resolve(new Response(JSON.stringify({ output: "Hallo" }), { status: 200 }));
  }) as typeof fetch;
  try {
    const parts = await callWithFallback(["gemini-3.5-flash", "gemini-2.0-flash"], [{ text: "Bonjour" }]);
    assertEquals(parts, [{ text: "Hallo" }]);
    assertEquals(appels.length, 2, "un appel Gemini, un appel fal");
    assertEquals(appels[1], "https://fal.run/fal-ai/any-llm");
  } finally {
    globalThis.fetch = avant;
  }
});
