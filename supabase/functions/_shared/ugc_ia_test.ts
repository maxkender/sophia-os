import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  cheminGeneration,
  cheminPersona,
  cheminsMontage,
  cheminsUgcIa,
  coupeUtile,
  demandeAssignation,
  demandeMontage,
  demandePostVideo,
  lienTiktok,
  nettoyerCta,
  partieSource,
  passage,
  personasDemandees,
  pngDepuisBase64,
  urlImageExtraite,
  urlVideoFal,
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

// Un PNG 1×1 transparent, en base64.
const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

Deno.test("cheminsMontage : coupe, bandeau et vidéo montée à côté de la génération", () => {
  assertEquals(cheminsMontage("s1", "g1"), {
    coupe: "ugc-ia/s1/g1-coupe.mp4",
    bandeau: "ugc-ia/s1/g1-bandeau.png",
    monte: "ugc-ia/s1/g1-monte.mp4",
  });
});

Deno.test("pngDepuisBase64 : PNG avec ou sans préfixe data:, refuse le reste", () => {
  assertEquals(pngDepuisBase64(PNG_1X1)?.[1], 0x50);
  assertEquals(pngDepuisBase64(`data:image/png;base64,${PNG_1X1}`)?.[1], 0x50);
  assertEquals(pngDepuisBase64(btoa("pas une image")), null);
  assertEquals(pngDepuisBase64("%%%"), null);
  assertEquals(pngDepuisBase64(""), null);
});

Deno.test("demandeMontage : coupe seule, bandeau seul, et leurs erreurs", () => {
  assertEquals(demandeMontage({ debut: "0,5", fin: 3.24 }), { debut: 0.5, fin: 3.2, bandeauTexte: null, bandeauPosition: null, bandeau: null });
  const avec = demandeMontage({ bandeau: { actif: true, texte: "  I could KISS 😭 ", position: 41.6, png: PNG_1X1 } });
  if ("erreur" in avec) throw new Error(avec.erreur);
  assertEquals([avec.debut, avec.fin, avec.bandeauTexte, avec.bandeauPosition, avec.bandeau?.png[0]], [null, null, "I could KISS 😭", 42, 0x89]);
  // Bandeau retiré : on garde son texte et sa hauteur pour la prochaine fois.
  assertEquals(demandeMontage({ bandeau: { actif: false, texte: "abc", position: 30 } }), {
    debut: null,
    fin: null,
    bandeauTexte: "abc",
    bandeauPosition: 30,
    bandeau: null,
  });
  assertEquals("erreur" in demandeMontage({ debut: 1 }), true);
  assertEquals("erreur" in demandeMontage({ debut: 3, fin: 2 }), true);
  assertEquals("erreur" in demandeMontage({ bandeau: { actif: true, texte: "", position: 40, png: PNG_1X1 } }), true);
  assertEquals("erreur" in demandeMontage({ bandeau: { actif: true, texte: "a", position: 140, png: PNG_1X1 } }), true);
  assertEquals("erreur" in demandeMontage({ bandeau: { actif: true, texte: "a", position: 40, png: "xx" } }), true);
});

Deno.test("coupeUtile : inutile si elle garde toute la vidéo", () => {
  assertEquals(coupeUtile(null, null, 4), false);
  assertEquals(coupeUtile(0, 4, 4.04), false);
  assertEquals(coupeUtile(0.3, 4, 4.04), true);
  assertEquals(coupeUtile(0, 3.5, 4.04), true);
  assertEquals(coupeUtile(0, 3.5, null), true);
});

Deno.test("urlVideoFal : video.url ou video_url, avec ou sans enveloppe data", () => {
  assertEquals(urlVideoFal({ video: { url: "https://v3.fal.media/o.mp4" } }), "https://v3.fal.media/o.mp4");
  assertEquals(urlVideoFal({ video_url: "https://v3.fal.media/o.mp4" }), "https://v3.fal.media/o.mp4");
  assertEquals(urlVideoFal({ data: { video: { url: "https://v3.fal.media/o.mp4" } } }), "https://v3.fal.media/o.mp4");
  assertEquals(urlVideoFal({ data: {} }), null);
  assertEquals(urlVideoFal(null), null);
});

Deno.test("demandeAssignation : un persona, un compte ou aucun", () => {
  const p = "11111111-1111-4111-8111-111111111111";
  const c = "22222222-2222-4222-8222-222222222222";
  assertEquals(demandeAssignation({ personaId: p, compteId: c.toUpperCase() }), { personaId: p, compteId: c });
  assertEquals(demandeAssignation({ personaId: p, compteId: null }), { personaId: p, compteId: null });
  assertEquals(demandeAssignation({ personaId: p }), { personaId: p, compteId: null });
  assertEquals("erreur" in demandeAssignation({ compteId: c }), true);
  assertEquals("erreur" in demandeAssignation({ personaId: p, compteId: "pas-un-id" }), true);
});

Deno.test("demandePostVideo : un compte, un jour à venir, des vidéos dans l'ordre, un CTA", () => {
  const compteId = "22222222-2222-4222-8222-222222222222";
  const gen = "33333333-3333-4333-8333-333333333333";
  const base = {
    compteId,
    date: "2026-11-07",
    videos: [
      { url: "https://x/reaction.mp4", nom: "Réaction", generationId: gen },
      { url: "https://x/import.mp4", chemin: "ugc-ia/posts/abc/2-demo.mp4" },
    ],
    ctaTexte: "  lien en bio  ",
    captureUrl: "https://x/cta.jpg",
    legende: "my study app #study",
    musiqueUrl: "https://www.tiktok.com/music/son-123",
    musiqueTitre: "son",
  };
  const ok = demandePostVideo(base, "2026-11-06");
  if ("erreur" in ok) throw new Error(ok.erreur);
  assertEquals(ok.videos.map((v) => [v.url, v.chemin, v.generationId]), [
    ["https://x/reaction.mp4", null, gen],
    ["https://x/import.mp4", "ugc-ia/posts/abc/2-demo.mp4", null],
  ]);
  assertEquals(ok.ctaTexte, "lien en bio");
  assertEquals(ok.ctaIncruste, false);
  assertEquals(ok.musiqueTitre, "son");

  // CTA déjà incrusté : ni texte ni capture.
  const incruste = demandePostVideo({ ...base, ctaIncruste: true, ctaTexte: "", captureUrl: "" }, "2026-11-06");
  if ("erreur" in incruste) throw new Error(incruste.erreur);
  assertEquals([incruste.ctaTexte, incruste.captureUrl], [null, null]);

  const erreur = (b: Record<string, unknown>, jour = "2026-11-06") => "erreur" in demandePostVideo(b, jour);
  assertEquals(erreur(base, "2026-11-08"), true); // jour passé
  assertEquals(erreur({ ...base, date: "2026-02-30" }), true);
  assertEquals(erreur({ ...base, videos: [] }), true);
  assertEquals(erreur({ ...base, videos: [{ url: "http://x/a.mp4" }] }), true);
  assertEquals(erreur({ ...base, videos: [{ url: "https://x/a.mp4", chemin: "ugc-ia/abc/a.mp4" }] }), true);
  assertEquals(erreur({ ...base, videos: [{ url: "https://x/a.mp4", chemin: "ugc-ia/posts/../a.mp4" }] }), true);
  assertEquals(erreur({ ...base, ctaTexte: " " }), true); // ni texte ni « incrusté »
  assertEquals(erreur({ ...base, captureUrl: null }), true); // texte sans capture
  assertEquals(erreur({ ...base, musiqueUrl: "son sans lien" }), true);
  assertEquals(erreur({ ...base, legende: "x".repeat(2201) }), true);
  assertEquals(erreur({ ...base, compteId: "pas-un-id" }), true);
});
