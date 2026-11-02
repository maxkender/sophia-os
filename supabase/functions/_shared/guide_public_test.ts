import { assertEquals } from "jsr:@std/assert@1";

import { GUIDE_POSTER_PUBLIC, liensPublics } from "./guide_public.ts";

Deno.test("le lien du Poster Guide : toujours le site public, jamais app.notion.com", () => {
  assertEquals(
    liensPublics("Guide: https://app.notion.com/p/Vik-Studios-TikTok-Poster-Guide-3f4241308d6681f8ad41dc507f2c8505?source=copy_link."),
    `Guide: ${GUIDE_POSTER_PUBLIC}.`,
  );
  assertEquals(liensPublics("(https://app.notion.com/p/3fc241308d668118b2aec359592c288d)"), "(https://star-water-a0e.notion.site/3fc241308d668118b2aec359592c288d)");
  assertEquals(liensPublics("https://www.notion.so/3f4241308d6681f8ba1ada3465aea6ed"), "https://star-water-a0e.notion.site/3f4241308d6681f8ba1ada3465aea6ed");
  // L'API Notion et le lien public déjà bon ne bougent pas.
  assertEquals(liensPublics("https://api.notion.com/v1/pages"), "https://api.notion.com/v1/pages");
  assertEquals(liensPublics(GUIDE_POSTER_PUBLIC), GUIDE_POSTER_PUBLIC);
});
