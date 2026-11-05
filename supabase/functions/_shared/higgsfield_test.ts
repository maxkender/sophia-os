import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import { cleHiggsfield, corpsGenjutsu, lireEtatGenjutsu, messageErreurHiggsfield, urlPropre } from "./higgsfield.ts";

Deno.test("cleHiggsfield : clé entière, ou id + secret, sinon null", () => {
  assertEquals(cleHiggsfield((n) => ({ HIGGSFIELD_API_KEY: " id:secret " } as Record<string, string>)[n]), "id:secret");
  assertEquals(cleHiggsfield((n) => ({ HIGGSFIELD_KEY_ID: "id", HIGGSFIELD_KEY_SECRET: "s" } as Record<string, string>)[n]), "id:s");
  assertEquals(cleHiggsfield((n) => ({ HIGGSFIELD_KEY_ID: "id" } as Record<string, string>)[n]), null);
  assertEquals(cleHiggsfield(() => undefined), null);
});

Deno.test("corpsGenjutsu : URLs sans anti-cache, champs exacts du schéma", () => {
  const corps = corpsGenjutsu({
    videoUrl: "https://x.supabase.co/storage/v1/object/public/medias/ugc-ia/1/reaction.mp4?v=123",
    imageUrls: ["https://x.supabase.co/p.jpg?v=9"],
    prompt: "  bouge  ",
  });
  assertEquals(corps, {
    video_url: "https://x.supabase.co/storage/v1/object/public/medias/ugc-ia/1/reaction.mp4",
    image_urls: ["https://x.supabase.co/p.jpg"],
    prompt: "bouge",
    resolution: "720p",
  });
  assertEquals(Object.keys(corps).sort(), ["image_urls", "prompt", "resolution", "video_url"]);
});

Deno.test("corpsGenjutsu : refuse une vidéo ou des images manquantes", () => {
  assertThrows(() => corpsGenjutsu({ videoUrl: "", imageUrls: ["https://a/b.jpg"] }));
  assertThrows(() => corpsGenjutsu({ videoUrl: "https://a/v.mp4", imageUrls: [""] }));
  assertThrows(() => corpsGenjutsu({ videoUrl: "https://a/v.mp4", imageUrls: Array(9).fill("https://a/b.jpg") }));
});

Deno.test("lireEtatGenjutsu : terminée, échouée, NSFW, annulée, en cours", () => {
  assertEquals(lireEtatGenjutsu({ status: "completed", video: { url: "https://cdn/out.mp4" } }), { statut: "prete", videoUrl: "https://cdn/out.mp4" });
  assertEquals(lireEtatGenjutsu({ status: "completed" }).statut, "echec");
  assertEquals(lireEtatGenjutsu({ status: "failed" }).statut, "echec");
  assertEquals(lireEtatGenjutsu({ status: "nsfw" }).statut, "echec");
  assertEquals(lireEtatGenjutsu({ status: "canceled" }).statut, "echec");
  assertEquals(lireEtatGenjutsu({ status: "queued" }), { statut: "en_cours", detail: "queued" });
  assertEquals(lireEtatGenjutsu({ status: "in_progress" }).statut, "en_cours");
  assertEquals(lireEtatGenjutsu(null).statut, "en_cours");
});

Deno.test("messageErreurHiggsfield : detail texte ou liste, cas 401 et 402", () => {
  assertEquals(messageErreurHiggsfield(401, '{"detail":"Invalid credentials"}'), "Higgsfield : clé API refusée (Invalid credentials)");
  assertEquals(messageErreurHiggsfield(402, '{"detail":"Not enough credits"}'), "Higgsfield : solde API insuffisant (Not enough credits)");
  assertEquals(messageErreurHiggsfield(422, '{"detail":[{"msg":"video too short"}]}'), "Higgsfield 422 : video too short");
  assertEquals(messageErreurHiggsfield(500, "oops"), "Higgsfield 500 : oops");
});

Deno.test("urlPropre : retire la query", () => {
  assertEquals(urlPropre(" https://a/b.mp4?v=1 "), "https://a/b.mp4");
});
