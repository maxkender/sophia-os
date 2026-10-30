import { assertEquals } from "jsr:@std/assert@1";

import {
  lireLignes,
  motifRefus,
  pseudoDuLien,
  slideshowsDuCompte,
  slidesLues,
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
  const post = (id: number, createTime: number | null, likes: number, type = "photo") => ({
    webVideoUrl: `https://www.tiktok.com/@a/${type}/${id}`,
    createTime,
    stats: { likes },
  });
  const posts = [
    post(1, 100, 900),
    post(2, 300, 99_000, "video"),
    post(3, 200, 10),
    post(4, null, 50_000),
    post(5, 150, 20),
    post(6, 50, 70_000),
  ];
  assertEquals(slideshowsDuCompte(posts, 2, 2), [
    "https://www.tiktok.com/@a/photo/3",
    "https://www.tiktok.com/@a/photo/5",
    "https://www.tiktok.com/@a/photo/6",
    "https://www.tiktok.com/@a/photo/4",
  ]);
  // Un compte avec peu de slideshows les donne tous, sans doublon.
  assertEquals(slideshowsDuCompte(posts.slice(0, 3), 5, 5), [
    "https://www.tiktok.com/@a/photo/3",
    "https://www.tiktok.com/@a/photo/1",
  ]);
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
