import { assertEquals } from "jsr:@std/assert@1";
import { cheminRetouche, hauteurBande, recouvrirBandeBas } from "./retouche_bande.ts";

Deno.test("hauteurBande : 7 % par défaut, bornée entre 2 % et 20 % et à un tiers de l'image", () => {
  assertEquals(hauteurBande(1920, 0.07), 134);
  assertEquals(hauteurBande(1920, 0.5), 384); // 20 % au plus
  assertEquals(hauteurBande(1920, 0), 38); // 2 % au moins
  assertEquals(hauteurBande(1920, Number.NaN), 134); // valeur par défaut
  assertEquals(hauteurBande(3, 0.2), 1); // au moins 1 px, au plus un tiers
});

Deno.test("recouvrirBandeBas : la bande du bas reprend les lignes juste au-dessus, le reste ne bouge pas", () => {
  // Image 2 × 10 : chaque ligne porte son numéro dans tous ses octets.
  const l = 2, h = 10;
  const data = new Uint8Array(l * h * 4);
  for (let y = 0; y < h; y++) data.fill(y, y * l * 4, (y + 1) * l * 4);
  const hb = recouvrirBandeBas(data, l, h, 0.2); // 2 lignes
  assertEquals(hb, 2);
  const lignes = Array.from({ length: h }, (_, y) => data[y * l * 4]);
  assertEquals(lignes, [0, 1, 2, 3, 4, 5, 6, 7, 6, 7]);
});

Deno.test("cheminRetouche : même dossier, suffixe fixe, relancer ne l'empile pas", () => {
  assertEquals(cheminRetouche("propre/abc/7.jpg"), "propre/abc/7-bande.jpg");
  assertEquals(cheminRetouche("propre/abc/7-bande.jpg"), "propre/abc/7-bande.jpg");
  assertEquals(cheminRetouche("propre/abc/7.png"), "propre/abc/7-bande.jpg");
});
