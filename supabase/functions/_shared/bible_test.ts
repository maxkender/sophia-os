import { assertEquals } from "jsr:@std/assert@1";

import { cheminMiniature, estLienCourt, exemplesSansApercu, estLienPost, handleDeLien, idPost, mediane, statsProfil, troisDerniers, troisMeilleurs } from "./bible.ts";

Deno.test("bible : handle et post depuis un lien", () => {
  assertEquals(handleDeLien("https://www.tiktok.com/@CrushedEthereal"), "crushedethereal");
  assertEquals(handleDeLien("https://www.tiktok.com/@sally.htg/photo/7512345678901234567?lang=fr"), "sally.htg");
  assertEquals(handleDeLien("@trusttheprocces1"), "trusttheprocces1");
  assertEquals(handleDeLien("pas un lien du tout"), null);
  assertEquals(idPost("https://www.tiktok.com/@a/video/7512345678901234567"), "7512345678901234567");
  assertEquals(estLienPost("https://www.tiktok.com/@a.b/photo/7512345678901234567"), true);
  assertEquals(estLienPost("https://www.tiktok.com/@a.b"), false);
  assertEquals(cheminMiniature("a.b", "https://www.tiktok.com/@a.b/photo/7512345678901234567", 0), "bible/a.b/7512345678901234567.jpg");
});

Deno.test("bible : les 3 plus vus des 12 derniers, et les stats", () => {
  const posts = Array.from({ length: 15 }, (_, i) => ({
    url: `https://www.tiktok.com/@x/photo/75000000000000000${String(i).padStart(2, "0")}`,
    vues: i === 0 ? 1_000_000 : i * 100, createTime: 1_700_000_000 + i * 86_400,
  }));
  // Le post 0 (le plus vieux, le plus vu) n'est pas dans les 12 derniers.
  assertEquals(troisMeilleurs(posts).map((p) => p.vues), [1400, 1300, 1200]);
  assertEquals(mediane([3, 1, 2]), 2);
  assertEquals(mediane([]), null);
  const s = statsProfil(posts, 5400);
  assertEquals(s.abonnes, 5400);
  assertEquals(s.meilleur_post_vues, 1400);
  assertEquals(s.vues_mediane, 850);
});

Deno.test("bible : liens courts", () => {
  assertEquals(estLienCourt("https://vm.tiktok.com/ZNdAbC123/"), true);
  assertEquals(estLienCourt("https://www.tiktok.com/t/ZTabc12/"), true);
  assertEquals(estLienCourt("https://www.tiktok.com/@a/video/7512345678901234567"), false);
  assertEquals(estLienCourt("https://vm.tiktok.com.evil.com/x"), false);
});

Deno.test("les 3 derniers TikToks (pas les plus vus)", () => {
  const posts = [
    { url: "https://www.tiktok.com/@a/video/7600000000000000001", vues: 9000, createTime: 100 },
    { url: "https://www.tiktok.com/@a/video/7600000000000000002", vues: 10, createTime: 400 },
    { url: "https://www.tiktok.com/@a/photo/7600000000000000003", vues: 20, createTime: 300 },
    { url: "https://www.tiktok.com/@a/video/7600000000000000004", vues: 30, createTime: 200 },
  ];
  assertEquals(troisDerniers(posts).map((p) => p.createTime), [400, 300, 200]);
});

Deno.test("bible : les exemples d'une proposition encore sans aperçu (3 premiers, vrais posts, ni miniature ni erreur)", () => {
  const p = (n: number) => `https://www.tiktok.com/@a.b/photo/751234567890123456${n}`;
  assertEquals(exemplesSansApercu([{ url: p(1) }, { url: p(2), miniature_url: "https://x/y.jpg" }, { url: p(3), erreur: "image 403" }, { url: p(4) }]), [0]);
  assertEquals(exemplesSansApercu([{ url: "https://www.tiktok.com/@a.b" }, { url: p(2), erreur: null }]), [1]);
  assertEquals(exemplesSansApercu(null), []);
});
