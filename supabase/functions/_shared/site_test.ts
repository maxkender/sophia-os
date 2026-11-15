import { assertEquals } from "jsr:@std/assert@1";

import { urlEmailSite } from "./site.ts";

Deno.test("10/11 : l'email part par vik-studios-creators.com, jamais par l'ancien domaine", () => {
  assertEquals(urlEmailSite("https://sophia-culture.com/api/public/os-email"), "https://vik-studios-creators.com/api/public/os-email");
  assertEquals(urlEmailSite(""), "https://vik-studios-creators.com/api/public/os-email");
  assertEquals(urlEmailSite(null), "https://vik-studios-creators.com/api/public/os-email");
  assertEquals(urlEmailSite("https://vik-studios-creators.com/api/public/os-email"), "https://vik-studios-creators.com/api/public/os-email");
});
