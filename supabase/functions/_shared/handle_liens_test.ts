import { assertEquals } from "jsr:@std/assert@1";

import { estLienCourt, handleDuLien, handleMajoritaire, handlesProches, resoudreLienCourt } from "./handle_liens.ts";

Deno.test("le @ d'un lien TikTok, et les @ proches (chiffres de la fin)", () => {
  assertEquals(handleDuLien("https://www.tiktok.com/@clara.fortschritt/video/7564?lang=de"), "clara.fortschritt");
  assertEquals(handleDuLien("https://vm.tiktok.com/ZNdAbc/"), null);
  assertEquals(estLienCourt("https://vm.tiktok.com/ZNdAbc/"), true);
  assertEquals(handlesProches("clara.fortschritt528", "clara.fortschritt"), true);
  assertEquals(handlesProches("luca.antrieb473", "luca.antrieb47"), true);
  assertEquals(handlesProches("alexandru.focus769", "alexandru.focus76"), true);
  assertEquals(handlesProches("paul.wille408", "paul.klein51"), false);
  assertEquals(handlesProches("martina.lee348", "mentecuriosa535"), false);
  assertEquals(handleMajoritaire(["a", null, "b", "a"]), { handle: "a", liens: 2 });
});

Deno.test("un lien court suivi jusqu'au @", async () => {
  const faux = ((url: string) =>
    Promise.resolve(
      url.includes("vm.tiktok.com")
        ? new Response(null, { status: 301, headers: { location: "https://www.tiktok.com/@alexandru.focus76/video/1?_r=1" } })
        : new Response(""),
    )) as unknown as typeof fetch;
  assertEquals(await resoudreLienCourt("https://vm.tiktok.com/ZNdAbc/", faux), "alexandru.focus76");
});
