import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  AB_TRADUCTION_COUPE,
  brasDuPost,
  colonnesAbTraduction,
  hashUnitaire,
  langueEnTest,
  lireReglageAbTraduction,
  nettoyerTexteSlide,
  recalerDeck,
} from "./ab_traduction.ts";

const ALLUME = {
  actif: true,
  langues: ["de", "pt"],
  part_natif: 0.5,
  graine: "g",
  circuit_production: "natif-1",
};

Deno.test("A/B traduction : le réglage se lit, et reste coupé sans circuit ni langue", () => {
  assertEquals(lireReglageAbTraduction(null), AB_TRADUCTION_COUPE);
  const r = lireReglageAbTraduction(ALLUME);
  assertEquals(r, { actif: true, langues: ["de", "pt"], partNatif: 0.5, graine: "g", circuitProduction: "natif-1" });
  assertEquals(lireReglageAbTraduction({ ...ALLUME, circuit_production: null }).actif, false);
  assertEquals(lireReglageAbTraduction({ ...ALLUME, langues: [] }).actif, false);
  assertEquals(lireReglageAbTraduction({ ...ALLUME, part_natif: 2 }).partNatif, 0.5);
});

Deno.test("A/B traduction : `pt` couvre `pt-BR`, l'anglais n'est pas en test", () => {
  const r = lireReglageAbTraduction(ALLUME);
  assert(langueEnTest(r, "de"));
  assert(langueEnTest(r, "pt-BR"));
  assert(!langueEnTest(r, "en"));
});

Deno.test("A/B traduction : un post tombe toujours dans le même bras, la moitié en natif", () => {
  const r = lireReglageAbTraduction(ALLUME);
  const post = { compteId: "c1", contenuId: "k1", jour: "2026-11-04", langue: "de" };
  assertEquals(brasDuPost(r, post), brasDuPost(r, { ...post }));
  assertEquals(hashUnitaire("abc"), hashUnitaire("abc"));
  assertEquals(brasDuPost(r, { ...post, langue: "en" }), null);
  assertEquals(brasDuPost(lireReglageAbTraduction({ ...ALLUME, actif: false }), post), null);

  let natifs = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) {
    if (brasDuPost(r, { compteId: `c${i % 30}`, contenuId: `k${i}`, jour: "2026-11-04", langue: "de" }) === "natif") {
      natifs++;
    }
  }
  assert(Math.abs(natifs / n - 0.5) < 0.03, `part natif ${natifs / n}`);
});

Deno.test("A/B traduction : le deck d'un circuit est recalé sur la source, ou refusé", () => {
  const source = [
    { position: 1, texte_overlay: "Hook", position_sophia: false },
    { position: 2, texte_overlay: "Tip 1", position_sophia: false },
    { position: 3, texte_overlay: null, position_sophia: false },
    { position: 4, texte_overlay: "Tip 2", position_sophia: false },
  ];
  const ecrit = [
    { position: 1, texte_overlay: " Haken " },
    { position: 2, texte_overlay: "Tipp 1" },
    { position: 3, texte_overlay: "" },
    { position: 4, texte_overlay: "Sophia", position_sophia: true },
  ];
  assertEquals(recalerDeck(source, ecrit), {
    slides: [
      { position: 1, texte_overlay: "Haken", position_sophia: false },
      { position: 2, texte_overlay: "Tipp 1", position_sophia: false },
      { position: 3, texte_overlay: null, position_sophia: false },
      { position: 4, texte_overlay: "Sophia", position_sophia: true },
    ],
  });
  assert("erreur" in recalerDeck(source, ecrit.slice(0, 3)));
  assert("erreur" in recalerDeck(source, [...ecrit, { position: 5, texte_overlay: "x" }]));
  assert("erreur" in recalerDeck(source, ecrit.map((s) => s.position === 2 ? { ...s, texte_overlay: " " } : s)));
  assert("erreur" in recalerDeck(source, ecrit.map((s) => ({ ...s, position_sophia: false }))));
  assert("erreur" in recalerDeck(source, ecrit.map((s) => ({ ...s, position_sophia: s.position === 1 }))));
});

Deno.test("A/B traduction : colonnes du passage, rien hors A/B", () => {
  assertEquals(colonnesAbTraduction(null, null), {});
  const ancien = { circuit: "gemini", deck_version: null, voie_cta: null, forme_cta: null };
  assertEquals(colonnesAbTraduction("temoin", null), { bras_traduction: "temoin", ...ancien });
  assertEquals(colonnesAbTraduction("natif", null), { bras_traduction: "natif", ...ancien });
  assertEquals(
    colonnesAbTraduction("natif", {
      slides: [],
      hashtags: "",
      versionFiche: 3,
      cta: { voie: "essai", forme: "astuce_perso" },
    }),
    { bras_traduction: "natif", circuit: "natif", deck_version: 3, voie_cta: "essai", forme_cta: "astuce_perso" },
  );
});

Deno.test("A/B traduction : le texte d'une slide est nettoyé des fautes de frappe mécaniques", () => {
  assertEquals(nettoyerTexteSlide("  3.  Lies  **jeden** Tag \n\n\n\nDu wirst  sehen  "), "3. Lies jeden Tag\n\nDu wirst sehen");
  assertEquals(nettoyerTexteSlide("titre\r\nligne"), "titre\nligne");
  // L'espace insécable de la ponctuation française reste.
  assertEquals(nettoyerTexteSlide("pourquoi\u00a0?"), "pourquoi\u00a0?");
  assertEquals(nettoyerTexteSlide("   "), "");
});
