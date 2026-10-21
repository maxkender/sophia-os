import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";

import {
  avecReprise,
  enParallele,
  ligneScan,
  motifRetrait,
  slidesAvecImage,
  statutApresAnalyse,
  tierProtege,
  titreCourt,
  type SlideAnalysee,
} from "./nettoyage_stickers.ts";

Deno.test("tier A, S, S+ protégés — Sophia ou une autre application", () => {
  assert(tierProtege(["A"]));
  assert(tierProtege(["s+"]));
  assert(tierProtege(["C", null, "S"]));
  assert(!tierProtege(["B", "C", "D"]));
  assert(!tierProtege([null, undefined]));
  assert(!tierProtege([]));
});

Deno.test("motif de retrait avec ou sans label", () => {
  assertEquals(motifRetrait("RH"), "Sticker pub (nettoyage stickers du label RH) — retiré");
  assertEquals(motifRetrait(null), "Sticker pub (nettoyage stickers) — retiré");
});

Deno.test("slides lues : image brute sinon de référence, dans l'ordre, sans les vides", () => {
  assertEquals(
    slidesAvecImage([
      { position: 2, raw_url: "b" },
      { position: 1, reference_url: "a" },
      { position: 3 },
    ]),
    [{ position: 1, url: "a" }, { position: 2, url: "b" }],
  );
  assertEquals(slidesAvecImage(null), []);
});

const slide = (position: number, sticker: SlideAnalysee["sticker"], erreur?: string): SlideAnalysee => ({
  position,
  url: `u${position}`,
  sticker,
  ...(erreur ? { erreur } : {}),
});

Deno.test("une slide illisible n'est jamais « propre » : nouvel essai, puis erreur", () => {
  const slides = [slide(1, null), slide(2, null, "Téléchargement média 429")];
  assertEquals(statutApresAnalyse(slides, 1), { statut: "a_analyser", erreur: "slide 2 : Téléchargement média 429" });
  assertEquals(statutApresAnalyse(slides, 3).statut, "erreur");
});

Deno.test("une pub suffit, même avec une slide illisible ; sticker de contenu = propre", () => {
  assertEquals(statutApresAnalyse([slide(1, null, "x"), slide(2, "pub")], 1).statut, "pub");
  assertEquals(statutApresAnalyse([slide(1, "contenu"), slide(2, null)], 1), { statut: "propre", erreur: null });
});

Deno.test("lignes du journal", () => {
  const t = titreCourt("  #reading   #smart ", "abcdef1234");
  assertEquals(t, "#reading #smart");
  assertEquals(titreCourt(null, "abcdef1234"), "abcdef12");
  assertEquals(ligneScan(t, "pub", [slide(1, null), slide(2, "pub"), slide(4, "pub")], null), "✗ PUB slides 2, 4 — #reading #smart");
  assertEquals(ligneScan(t, "propre", [], null), "✓ #reading #smart");
  assertEquals(ligneScan(t, "erreur", [], "slide 2 : 503"), "⚠ #reading #smart — erreur : slide 2 : 503");
});

Deno.test("reprise : rejoue les échecs de téléchargement, pas les autres", async () => {
  let n = 0;
  const sansAttente = () => Promise.resolve();
  const r = await avecReprise(() => {
    n += 1;
    return n < 3 ? Promise.reject(new Error("Téléchargement média 429 (https://…)")) : Promise.resolve("ok");
  }, 3, sansAttente);
  assertEquals([r, n], ["ok", 3]);

  let m = 0;
  await assertRejects(() =>
    avecReprise(() => {
      m += 1;
      return Promise.reject(new Error("gemini: requête invalide"));
    }, 3, sansAttente)
  );
  assertEquals(m, 1);
});

Deno.test("en parallèle : résultats dans l'ordre, concurrence bornée", async () => {
  let enCours = 0;
  let max = 0;
  const r = await enParallele([1, 2, 3, 4, 5], 2, async (x) => {
    enCours += 1;
    max = Math.max(max, enCours);
    await new Promise((res) => setTimeout(res, 5));
    enCours -= 1;
    return x * 10;
  });
  assertEquals(r, [10, 20, 30, 40, 50]);
  assertEquals(max, 2);
});
