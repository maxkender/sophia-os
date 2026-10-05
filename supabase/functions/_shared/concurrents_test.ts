import { assertEquals } from "jsr:@std/assert@1";

import { citeConcurrent, positionConcurrent, retirerConcurrent, sansConcurrent } from "./concurrents.ts";

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
