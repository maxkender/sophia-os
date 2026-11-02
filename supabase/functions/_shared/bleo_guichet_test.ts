import { assert, assertEquals } from "jsr:@std/assert@1";

import { accrocheDuDeck, accrochesEnAttente, debutJourParis, fullTestsDuJour, lireDeclarationBleo } from "./bleo_guichet.ts";

Deno.test("guichet BLEO : la déclaration se lit, sa forme est vérifiée", () => {
  assertEquals(lireDeclarationBleo({}), { typeBleo: null, parentContenuId: null });
  assertEquals(lireDeclarationBleo({ type_bleo: "full_test" }), { typeBleo: "full_test", parentContenuId: null });
  assertEquals(
    lireDeclarationBleo({ type_bleo: "declinaison", parent_contenu_id: "00879A21-A7C2-4B32-A41F-5C2DE6F6801D" }),
    { typeBleo: "declinaison", parentContenuId: "00879a21-a7c2-4b32-a41f-5c2de6f6801d" },
  );
  assert("erreur" in lireDeclarationBleo({ type_bleo: "declinaison", parent_contenu_id: "00879a21" }));
  assert("erreur" in lireDeclarationBleo({ parent_contenu_id: "00879a21-a7c2-4b32-a41f-5c2de6f6801d" }));
});

Deno.test("guichet BLEO : l'accroche est la première slide, normalisée", () => {
  const slides = [
    { position: 2, texte_overlay: "1. read daily" },
    { position: 1, texte_overlay: "Hobbies that will make you DISGUSTINGLY confident 💅" },
  ];
  assertEquals(accrocheDuDeck(slides), "hobbies that will make you disgustingly confident");
  assertEquals(accrocheDuDeck([]), null);
});

Deno.test("guichet BLEO : accroches en attente, sauf la livraison remplacée", () => {
  const livraisons = [
    { id: "a", langue_source: "en", decks: { en: { slides: [{ position: 1, texte_overlay: "Weird advice that works" }] } } },
    { id: "b", langue_source: "en", decks: { en: { slides: [{ position: 1, texte_overlay: "Rules as a man" }] } } },
  ];
  const attente = accrochesEnAttente(livraisons, "b");
  assertEquals([...attente.entries()], [["weird advice that works", "a"]]);
});

Deno.test("guichet BLEO : full tests du jour, au taux de la jauge sur la durée", () => {
  // 3 dépôts par jour, 10 % de full tests : 0,3 par jour, soit 9 sur 30 jours.
  let total = 0;
  for (let i = 0; i < 30; i++) {
    const jour = new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
    const n = fullTestsDuJour(3, 0.1, jour, false);
    assert(n === 0 || n === 1);
    total += n;
  }
  assertEquals(total, 9);
  // 40 % de 3 : 1 ou 2 chaque jour.
  const n40 = fullTestsDuJour(3, 0.4, "2026-11-03", false);
  assert(n40 >= 1 && n40 <= 2);
  // Boîte vide : tout en full tests ; pas de dépôt : rien.
  assertEquals(fullTestsDuJour(3, 0.1, "2026-11-03", true), 3);
  assertEquals(fullTestsDuJour(0, 0.4, "2026-11-03", false), 0);
});

Deno.test("guichet BLEO : minuit à Paris, en hiver et en été", () => {
  assertEquals(debutJourParis("2026-11-03"), "2026-11-02T23:00:00.000Z");
  assertEquals(debutJourParis("2026-07-01"), "2026-06-30T22:00:00.000Z");
});
