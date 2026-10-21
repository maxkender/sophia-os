/**
 * Profil d'un compte (abonnés, lien cliquable) lu sur un scrape Apify. Sans réseau.
 */

import { assertEquals } from "jsr:@std/assert@1";

import { lienBioDe } from "./apify.ts";
import { profilDepuisPosts } from "./profil_compte.ts";

Deno.test("lienBioDe : chaîne, objet { link } ou rien", () => {
  assertEquals(lienBioDe("taap.it/sophia"), "taap.it/sophia");
  assertEquals(lienBioDe("  https://taap.it/unswipe "), "https://taap.it/unswipe");
  assertEquals(lienBioDe({ link: "taap.it/micabo", risk: 0 }), "taap.it/micabo");
  assertEquals(lienBioDe(""), null);
  assertEquals(lienBioDe(null), null);
  assertEquals(lienBioDe(undefined), null);
  assertEquals(lienBioDe(42), null);
});

Deno.test("profilDepuisPosts : le premier post qui porte le profil, sinon rien", () => {
  assertEquals(
    profilDepuisPosts([
      { auteur: { abonnes: null, lienBio: null } },
      { auteur: { abonnes: 1240, lienBio: "taap.it/sophia" } },
    ]),
    { abonnes: 1240, lienBio: "taap.it/sophia" },
  );
  assertEquals(profilDepuisPosts([{ auteur: { abonnes: 0, lienBio: null } }]), { abonnes: 0, lienBio: null });
  assertEquals(profilDepuisPosts([]), null, "compte sans post : on n'écrit pas 0 abonné");
  assertEquals(profilDepuisPosts([{ auteur: { abonnes: null, lienBio: "x" } }]), null);
});
