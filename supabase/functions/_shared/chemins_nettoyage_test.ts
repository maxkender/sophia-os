import { assertEquals } from "jsr:@std/assert@1";

import { cheminsPourEssai } from "./chemins_nettoyage.ts";
import { imagesObligatoires, lireRegleImagesObligatoires } from "./images_obligatoires.ts";

Deno.test("sans numéro d'essai : principal puis second, comme avant", () => {
  assertEquals(cheminsPourEssai("replicate"), ["replicate", "fal"]);
  assertEquals(cheminsPourEssai("fal", null), ["fal", "replicate"]);
});

Deno.test("les essais alternent Replicate et Fal ; l'effaceur ne sert qu'au dernier essai", () => {
  assertEquals(cheminsPourEssai("replicate", 1), ["replicate", "fal"]);
  assertEquals(cheminsPourEssai("replicate", 2), ["fal", "replicate"]);
  assertEquals(cheminsPourEssai("replicate", 3), ["replicate", "fal"]);
  assertEquals(cheminsPourEssai("replicate", 4), ["effaceur"]);
  assertEquals(cheminsPourEssai("fal", 2), ["replicate", "fal"]);
  assertEquals([1, 2, 3].some((e) => cheminsPourEssai("replicate", e).includes("effaceur")), false);
});

Deno.test("règle des images obligatoires : par label ou par source ; absente ou mal formée, aucune", () => {
  const regle = lireRegleImagesObligatoires({ provider_principal: "replicate", images_obligatoires_labels: ["art", 3, ""], images_obligatoires_sources: ["noct"] });
  assertEquals(regle, { labels: ["art"], sources: ["noct"] });
  assertEquals(imagesObligatoires(regle, { compteReferenceId: "x", labelIds: ["sport", "art"] }), true);
  assertEquals(imagesObligatoires(regle, { compteReferenceId: "noct", labelIds: [] }), true);
  assertEquals(imagesObligatoires(regle, { compteReferenceId: "x", labelIds: ["sport"] }), false);
  assertEquals(lireRegleImagesObligatoires(null), { labels: [], sources: [] });
  assertEquals(lireRegleImagesObligatoires({ images_obligatoires_labels: "art" }), { labels: [], sources: [] });
});
