import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import { cheminsUgcIa, lienTiktok, passage } from "./ugc_ia.ts";

Deno.test("lienTiktok : garde l'origine et le chemin, refuse le reste", () => {
  assertEquals(
    lienTiktok(" https://www.tiktok.com/@a/video/123?is_from_webapp=1&sender_device=pc "),
    "https://www.tiktok.com/@a/video/123",
  );
  assertEquals(lienTiktok("https://vm.tiktok.com/ZMabc/"), "https://vm.tiktok.com/ZMabc/");
  assertThrows(() => lienTiktok(""));
  assertThrows(() => lienTiktok("pas un lien"));
  assertThrows(() => lienTiktok("https://www.youtube.com/watch?v=1"));
  assertThrows(() => lienTiktok("https://tiktok.com.evil.io/v/1"));
  assertThrows(() => lienTiktok("http://www.tiktok.com/@a/video/1"));
});

Deno.test("passage : pas de minimum, 30 s au plus, dans la vidéo", () => {
  assertEquals(passage(1, 7.04, 20), { debut: 1, fin: 7 });
  assertEquals(passage("0,5", "4.5", null), { debut: 0.5, fin: 4.5 });
  assertEquals(passage(0, 10.06, 10), { debut: 0, fin: 10.1 });
  assertEquals(passage(2, 3.5, 20), { debut: 2, fin: 3.5 });
  assertEquals("erreur" in passage(3, 3, 20), true);
  assertEquals("erreur" in passage(4, 2, 20), true);
  assertEquals("erreur" in passage(0, 31, 40), true);
  assertEquals("erreur" in passage(-1, 5, 20), true);
  assertEquals("erreur" in passage(5, 12, 10), true);
  assertEquals("erreur" in passage(null, 5, 10), true);
});

Deno.test("cheminsUgcIa : un dossier par vidéo", () => {
  assertEquals(cheminsUgcIa("abc"), {
    source: "ugc-ia/abc/source.mp4",
    reaction: "ugc-ia/abc/reaction.mp4",
    video: "ugc-ia/abc/video.mp4",
  });
});
