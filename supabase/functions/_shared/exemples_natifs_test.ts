import { assertEquals } from "jsr:@std/assert@1";

import {
  apresEchec,
  idPost,
  lireLignes,
  motifRefus,
  postDuLien,
  pseudoDuLien,
  slideshowsDuCompte,
  slidesLues,
  TENTATIVES_MAX,
  texteExemple,
} from "./exemples_natifs.ts";

Deno.test("lit les liens de posts, les comptes et les lignes inconnues, sans doublon", () => {
  const lu = lireLignes(`
https://www.tiktok.com/@motiversum/video/7382525966091930912?is_from_webapp=1
https://tiktok.com/@Sensiblio/photo/7300906918636162336
https://www.tiktok.com/@motiversum/video/7382525966091930912
@deineweisheiten
https://www.tiktok.com/@zitatxplorer
zitatxplorer, texting.max
https://vm.tiktok.com/ZMabc123/
`);
  assertEquals(lu.posts, [
    "https://www.tiktok.com/@motiversum/video/7382525966091930912",
    "https://www.tiktok.com/@Sensiblio/photo/7300906918636162336",
  ]);
  assertEquals(lu.comptes, ["deineweisheiten", "zitatxplorer", "texting.max"]);
  assertEquals(lu.ignorees, ["https://vm.tiktok.com/ZMabc123/"]);
});

Deno.test("le pseudo d'un lien de post", () => {
  assertEquals(pseudoDuLien("https://www.tiktok.com/@Motiversum/photo/123"), "motiversum");
  assertEquals(pseudoDuLien("https://www.tiktok.com/@motiversum"), null);
});

Deno.test("un compte donne ses slideshows les plus récents, puis les plus likés, jamais ses vidéos", () => {
  // Apify renvoie /video/ même pour un slideshow : ce sont les images, ou la
  // page publique du compte, qui disent qu'un post est un slideshow.
  const post = (id: number, createTime: number | null, likes: number, images = 0) => ({
    webVideoUrl: `https://www.tiktok.com/@a/video/${id}`,
    createTime,
    imageUrls: Array.from({ length: images }, (_, i) => `https://img/${id}/${i}`),
    stats: { likes },
  });
  const posts = [
    post(1, 100, 900, 6),
    post(2, 300, 99_000), // une vidéo : ni images, ni page
    post(3, 200, 10, 5),
    post(4, null, 50_000), // slideshow seulement d'après la page publique
    post(5, 150, 20, 7),
    post(6, 50, 70_000, 4),
  ];
  const r = slideshowsDuCompte(posts, new Set(["4"]), 2, 2);
  assertEquals(r.verifies, true);
  assertEquals(r.urls, [
    "https://www.tiktok.com/@a/video/3",
    "https://www.tiktok.com/@a/video/5",
    "https://www.tiktok.com/@a/video/6",
    "https://www.tiktok.com/@a/video/4",
  ]);
  // Un petit compte donne tout ce qu'il a, sans doublon.
  assertEquals(slideshowsDuCompte(posts.slice(0, 3), new Set(), 5, 5).urls, [
    "https://www.tiktok.com/@a/video/3",
    "https://www.tiktok.com/@a/video/1",
  ]);
  // Un lien /photo/ suffit.
  assertEquals(
    slideshowsDuCompte([{ webVideoUrl: "https://www.tiktok.com/@a/photo/9", createTime: 1 }]).urls,
    ["https://www.tiktok.com/@a/photo/9"],
  );
});

Deno.test("rien de reconnu : les posts candidats partent quand même, marqués non vérifiés", () => {
  const posts = [
    { webVideoUrl: "https://www.tiktok.com/@a/video/1", createTime: 1, stats: { likes: 5 } },
    { webVideoUrl: "https://www.tiktok.com/@a/video/2", createTime: 2, stats: { likes: 1 } },
  ];
  assertEquals(slideshowsDuCompte(posts), {
    urls: ["https://www.tiktok.com/@a/video/2", "https://www.tiktok.com/@a/video/1"],
    verifies: false,
  });
  assertEquals(slideshowsDuCompte([]), { urls: [], verifies: false });
});

Deno.test("l'identifiant d'un post, /photo/ ou /video/", () => {
  assertEquals(idPost("https://www.tiktok.com/@a/photo/123?x=1"), "123");
  assertEquals(idPost("https://www.tiktok.com/@a/video/456"), "456");
  assertEquals(idPost("https://www.tiktok.com/@a"), null);
});

Deno.test("le post d'Apify d'un lien de la banque, /photo/ ou /video/", () => {
  const posts = [
    { postId: "111", webVideoUrl: "https://www.tiktok.com/@a/video/111" },
    { postId: "", webVideoUrl: "https://www.tiktok.com/@a/video/222" },
  ];
  assertEquals(postDuLien("https://www.tiktok.com/@a/photo/111", posts), posts[0]);
  assertEquals(postDuLien("https://www.tiktok.com/@a/photo/222", posts), posts[1]);
  assertEquals(postDuLien("https://www.tiktok.com/@a/photo/333", posts), null);
  assertEquals(postDuLien("https://www.tiktok.com/@a", posts), null);
});

Deno.test("un échec retourne en file, sauf au dernier essai", () => {
  assertEquals(apresEchec(1, "Apify : 502"), { statut: "en_attente", erreur: "Apify : 502" });
  assertEquals(apresEchec(TENTATIVES_MAX, "Apify : 502"), { statut: "erreur", erreur: "Apify : 502" });
});

Deno.test("les slides lues gardent leur position et perdent les slides vides", () => {
  assertEquals(slidesLues(["  Accroche \n suite ", "", "Tipp 1"]), [
    { position: 1, texte: "Accroche\nsuite" },
    { position: 3, texte: "Tipp 1" },
  ]);
});

Deno.test("refuse une vidéo et un slideshow sans assez de texte", () => {
  assertEquals(motifRefus(0, []), "Pas un slideshow (aucune image) : c'est sans doute une vidéo.");
  assertEquals(
    motifRefus(6, slidesLues(["a", "b"])),
    "Seulement 2 slide(s) avec du texte sur 6 : il en faut au moins 3.",
  );
  assertEquals(motifRefus(4, slidesLues(["a", "b", "c"])), null);
});

Deno.test("le texte d'un exemple, slide par slide dans l'ordre", () => {
  assertEquals(
    texteExemple([
      { position: 2, texte: "zwei" },
      { position: 1, texte: "eins" },
      { position: 3, texte: "  " },
    ]),
    "eins\nzwei",
  );
  assertEquals(texteExemple(null), "");
});
