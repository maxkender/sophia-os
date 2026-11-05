import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  cheminGeneration,
  cheminPersona,
  cheminsUgcIa,
  lienTiktok,
  nettoyerCta,
  partieSource,
  passage,
  personasDemandees,
  urlImageExtraite,
} from "./ugc_ia.ts";

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

Deno.test("passage : la partie téléphone a son propre plafond", () => {
  assertEquals(passage(4, 64, 90, 180), { debut: 4, fin: 64 });
  assertEquals("erreur" in passage(4, 64, 90), true);
  assertEquals("erreur" in passage(0, 181, 200, 180), true);
});

Deno.test("partieSource : réaction par défaut, téléphone, sinon null", () => {
  assertEquals(partieSource(undefined), "reaction");
  assertEquals(partieSource("telephone"), "telephone");
  assertEquals(partieSource("demo"), null);
});

Deno.test("chemins : un dossier par source, les générations dedans, les personas à part", () => {
  assertEquals(cheminsUgcIa("abc"), {
    source: "ugc-ia/abc/source.mp4",
    reaction: "ugc-ia/abc/reaction.mp4",
    telephone: "ugc-ia/abc/telephone.mp4",
    cta: "ugc-ia/abc/cta.jpg",
  });
  assertEquals(cheminGeneration("abc", "g1"), "ugc-ia/abc/g1.mp4");
  assertEquals(cheminPersona("p1", "image/png"), "ugc-ia/personas/p1.png");
  assertEquals(cheminPersona("p1", "image/jpeg"), "ugc-ia/personas/p1.jpg");
});

Deno.test("personasDemandees : identifiants valides, sans doublon, 1 à 10", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  assertEquals(personasDemandees([a, b, a.toUpperCase(), "pas-un-id", null]), [a, b]);
  assertEquals("erreur" in (personasDemandees([]) as object), true);
  assertEquals("erreur" in (personasDemandees("x") as object), true);
  const onze = Array.from({ length: 11 }, (_, i) => `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`);
  assertEquals("erreur" in (personasDemandees(onze) as object), true);
});

Deno.test("urlImageExtraite : images[0].url de fal, avec ou sans enveloppe data", () => {
  assertEquals(urlImageExtraite({ images: [{ url: "https://v3.fal.media/f.jpg" }] }), "https://v3.fal.media/f.jpg");
  assertEquals(urlImageExtraite({ data: { images: [{ url: "https://v3.fal.media/f.jpg" }] } }), "https://v3.fal.media/f.jpg");
  assertEquals(urlImageExtraite({ images: [] }), null);
  assertEquals(urlImageExtraite({ images: [{ url: "http://x/f.jpg" }] }), null);
  assertEquals(urlImageExtraite(null), null);
});

Deno.test("nettoyerCta : lignes vides et guillemets retirés", () => {
  assertEquals(nettoyerCta('  "I could KISS the person\n\n who showed me this 😭😭"  '), "I could KISS the person\nwho showed me this 😭😭");
  assertEquals(nettoyerCta(null), "");
});
