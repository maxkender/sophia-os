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

Deno.test("un compte donne ses slideshows les plus récents, pas ses vidéos", () => {
  const posts = [
    { webVideoUrl: "https://www.tiktok.com/@a/photo/1", createTime: 100 },
    { webVideoUrl: "https://www.tiktok.com/@a/video/2", createTime: 300 },
    { webVideoUrl: "https://www.tiktok.com/@a/photo/3", createTime: 200 },
    { webVideoUrl: "https://www.tiktok.com/@a/photo/4", createTime: null },
  ];
  assertEquals(slideshowsDuCompte(posts, 2), ["https://www.tiktok.com/@a/photo/3", "https://www.tiktok.com/@a/photo/1"]);
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
