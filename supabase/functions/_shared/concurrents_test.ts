import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  citeConcurrent,
  MOTIF_CONCURRENT,
  MOTIF_CONCURRENT_UNSWIPE,
  motifConcurrentApplication,
  positionConcurrent,
  retirerConcurrent,
  sansConcurrent,
} from "./concurrents.ts";

Deno.test("citeConcurrent : vent now / readup, pas « read up »", () => {
  assertEquals(citeConcurrent("the vent now app quizzes helped me"), true);
  assertEquals(citeConcurrent("l'appli Vent-Now m'a aidé"), true);
  assertEquals(citeConcurrent("i use ReadUp to block tiktok"), true);
  assertEquals(citeConcurrent("read up on history every day"), false);
  assertEquals(citeConcurrent(null), false);
});

Deno.test("retirerConcurrent : retire la parenthèse, garde la phrase", () => {
  assertEquals(
    retirerConcurrent("3) kognitivno kartiranje\n\npo petih ne grem na nobeno aplikacijo (razen na vent now lol). zakaj bi gledal?"),
    "3) kognitivno kartiranje\n\npo petih ne grem na nobeno aplikacijo. zakaj bi gledal?",
  );
});

Deno.test("retirerConcurrent : retire la phrase qui cite le concurrent", () => {
  assertEquals(
    retirerConcurrent("in stille sitzen\n\nsitz jeden tag 20 minuten in stille. die vent now app hat mir gezeigt, dass ich mich drücke. probier es aus!"),
    "in stille sitzen\n\nsitz jeden tag 20 minuten in stille. probier es aus!",
  );
});

Deno.test("retirerConcurrent : texte sans mention inchangé", () => {
  const t = "slow talking\n\nspeak 20% slower. people lean in.";
  assertEquals(retirerConcurrent(t), t);
});

Deno.test("retirerConcurrent : jamais de nom restant, même sans ponctuation", () => {
  assertEquals(citeConcurrent(retirerConcurrent("titre\n\nmerci vent now")), false);
});

Deno.test("positionConcurrent : première slide hors couverture", () => {
  const slides = [
    { position: 1, texte_overlay: "vent now hook" },
    { position: 4, texte_overlay: "the vent now app" },
    { position: 5, texte_overlay: "readup too" },
  ];
  assertEquals(positionConcurrent(slides), 4);
  assertEquals(positionConcurrent([{ position: 2, texte_overlay: "rien" }]), undefined);
});

Deno.test("sansConcurrent : signale la modification", () => {
  const r = sansConcurrent([
    { position: 2, texte_overlay: "a. the vent now app helped. b." },
    { position: 3, texte_overlay: "propre" },
  ]);
  assertEquals(r.modifie, true);
  assertEquals(r.slides[0].texte_overlay, "a. b.");
  assertEquals(r.slides[1].texte_overlay, "propre");
});

// ---------------------------------------------------------------------------
// Unswipe : applis de temps d'écran (phrases réelles du stock, octobre 2026)
// ---------------------------------------------------------------------------

const UNSWIPE = motifConcurrentApplication("unswipe");

Deno.test("motif par application : Sophia (et inconnue) = le motif d'avant, Unswipe = le sien", () => {
  assertStrictEquals(motifConcurrentApplication("sophia"), MOTIF_CONCURRENT);
  assertStrictEquals(motifConcurrentApplication(undefined), MOTIF_CONCURRENT);
  assertStrictEquals(motifConcurrentApplication("autre"), MOTIF_CONCURRENT);
  assertStrictEquals(motifConcurrentApplication(" Unswipe "), MOTIF_CONCURRENT_UNSWIPE);
  assertEquals(MOTIF_CONCURRENT.source, String.raw`\b(vent[\s-]?now|readup)\b`);
  assertEquals(MOTIF_CONCURRENT.flags, "i");
  // Les concurrents de Sophia le sont aussi d'Unswipe.
  assertEquals(citeConcurrent("the vent now app", UNSWIPE), true);
  assertEquals(citeConcurrent("i use ReadUp to block tiktok", UNSWIPE), true);
});

Deno.test("Unswipe : les applis de temps d'écran sont reconnues", () => {
  for (const texte of [
    "2. j'ai installé Opal pour bloquer TikTok",
    "i use unscroll: it blocks the apps that waste your time",
    "bunu aşmamı sağlayan şey unscroll uygulaması oldu",
    "the one sec app makes you breathe before opening instagram",
    "onesec changed my mornings",
    "ScreenZen is free",
    "AppBlock / AppBlocker",
    "i tried clearspace",
    "i know everyone talks about it, but\nthe brick phone blocker is such a\nhelpful tool.",
    "die brick phone blocker is echt zo handig",
    "the Brick app",
    "Freedom blocks distracting websites and apps across devices.",
    "1. freedom blocks distracting websites",
    "the freedom app",
    "forest app",
    "die Forest-App",
    "l'app forest",
    "1. forest\nstay focused by growing a\nvirtual tree while you work.",
    "3. forest\n\ntu restes focus en faisant pousser un arbre virtuel",
  ]) {
    assertEquals(citeConcurrent(texte, UNSWIPE), true, texte);
    // Le motif Sophia n'en voit aucune : Sophia ne change pas.
    assertEquals(citeConcurrent(texte), false, `Sophia : ${texte}`);
  }
});

Deno.test("Unswipe : pas de faux positif sur les mots courants", () => {
  for (const texte of [
    "Cut distractions quick. Build yourself brick by brick.",
    "Every unspoken truth you bury becomes a brick on your chest.",
    "Build a skill like a mason lays bricks. One brick is nothing.",
    "you hit the brick wall of week three",
    "Discipline is remembering what freedom will feel like.",
    "Law of Structure: Freedom is built on structure.",
    "forest bathing (Shinrin-yoku) 🌤️ walking slowly through a forest",
    "hike in a forest\nhiking among trees triggers endorphins",
    "An eldritch glow surrounded the ancient forest.",
    "hold handshakes one second longer than usual.",
    "pause for one sec and breathe",
    "a clear space helps you focus on one thing at a time",
    "use an app blocker on your phone",
    "skapa hinder: appblockerare eller mobilen i ett annat rum.",
    "my opal ring",
    "opal nails for fall",
    "a fire opal pendant",
    "she wore an opal",
    "stopala u širini ramena",
    "read up on history every day",
    "jomo: the joy of missing out",
  ]) {
    assertEquals(citeConcurrent(texte, UNSWIPE), false, texte);
  }
});

Deno.test("Unswipe : position imposée et nettoyage avec le motif de l'application", () => {
  const slides = [
    { position: 1, texte_overlay: "8 habitudes pour arrêter de scroller" },
    { position: 2, texte_overlay: "1. téléphone hors de la chambre" },
    { position: 3, texte_overlay: "2. j'ai installé Opal pour bloquer TikTok" },
    { position: 4, texte_overlay: "3. lecture avant de dormir. merci unscroll pour ça." },
  ];
  assertEquals(positionConcurrent(slides, UNSWIPE), 3);
  // Motif Sophia par défaut : rien vu, comportement d'avant.
  assertEquals(positionConcurrent(slides), undefined);
  assertEquals(sansConcurrent(slides).modifie, false);

  const r = sansConcurrent(slides, UNSWIPE);
  assertEquals(r.modifie, true);
  assertEquals(r.slides[3].texte_overlay, "3. lecture avant de dormir.");
  for (const s of r.slides) assertEquals(citeConcurrent(s.texte_overlay, UNSWIPE), false);
  assertEquals(
    retirerConcurrent("1. forest\nstay focused by growing a virtual tree", UNSWIPE),
    "1.\nstay focused by growing a virtual tree",
  );
});

Deno.test("Unswipe : « brick by brick » n'est jamais détecté", () => {
  const slides = [
    { position: 1, texte_overlay: "rebuild yourself" },
    { position: 2, texte_overlay: "rebuild your mind brick by brick" },
  ];
  assertEquals(positionConcurrent(slides, UNSWIPE), undefined);
  assertEquals(sansConcurrent(slides, UNSWIPE).modifie, false);
});

Deno.test("citeConcurrent : un motif global n'a pas de mémoire entre deux appels", () => {
  const global = new RegExp(MOTIF_CONCURRENT.source, "gi");
  assertEquals(citeConcurrent("vent now", global), true);
  assertEquals(citeConcurrent("vent now", global), true);
});
