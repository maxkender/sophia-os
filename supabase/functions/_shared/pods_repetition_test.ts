import { assertEquals } from "jsr:@std/assert@1";

import {
  cleMusique,
  compterMemeMusique,
  imagesDesDecks,
  lireReglesRepetition,
  REGLES_REPETITION_DEFAUT,
} from "./pods_repetition.ts";

Deno.test("lireReglesRepetition : défauts, valeurs lues, valeurs fausses ignorées", () => {
  assertEquals(lireReglesRepetition(null), { ...REGLES_REPETITION_DEFAUT });
  assertEquals(lireReglesRepetition({ images_jours: 7, musique_fenetre: 10, musique_max: 3 }), {
    imagesJours: 7,
    musiqueFenetre: 10,
    musiqueMax: 3,
  });
  assertEquals(lireReglesRepetition({ images_jours: -1, musique_max: "x" }), { ...REGLES_REPETITION_DEFAUT });
  assertEquals(lireReglesRepetition({ images_jours: 0 }).imagesJours, 0);
});

Deno.test("imagesDesDecks : toutes les images de tous les decks, sans doublon", () => {
  const decks = {
    en: { slides: [{ media_id: "a" }, { media_id: "b" }, { media_id: null }] },
    fr: { slides: [{ media_id: "a" }, { media_id: "c" }] },
    de: { hashtags: "x" },
  };
  assertEquals(imagesDesDecks(decks).sort(), ["a", "b", "c"]);
  assertEquals(imagesDesDecks(null), []);
});

Deno.test("cleMusique : l'identifiant TikTok du son, sinon l'URL, sinon un titre précis", () => {
  const ballade = "https://www.tiktok.com/music/ballad-to-a-mexican-desert-7209138244645373953";
  assertEquals(cleMusique(ballade, "Ballad to a Mexican Desert"), "tiktok:7209138244645373953");
  assertEquals(cleMusique(`${ballade}?lang=fr`, null), "tiktok:7209138244645373953");
  assertEquals(cleMusique("https://example.com/son/", null), "https://example.com/son");
  assertEquals(cleMusique(null, "Blue Lamp Window"), "titre:blue lamp window");
  assertEquals(cleMusique(null, "original sound"), null);
  assertEquals(cleMusique("", ""), null);
});

Deno.test("compterMemeMusique : compte les livraisons au même son", () => {
  const ballade = "https://www.tiktok.com/music/ballad-to-a-mexican-desert-7209138244645373953";
  const recentes = [
    { musique_url: ballade, musique_titre: "Ballad" },
    { musique_url: `${ballade}?x=1`, musique_titre: "Ballad" },
    { musique_url: null, musique_titre: "Blue Lamp Window" },
    { musique_url: null, musique_titre: null },
  ];
  assertEquals(compterMemeMusique(cleMusique(ballade, null), recentes), 2);
  assertEquals(compterMemeMusique(null, recentes), 0);
});
