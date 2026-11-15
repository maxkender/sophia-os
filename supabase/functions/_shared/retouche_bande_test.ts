import { assertEquals } from "jsr:@std/assert@1";
import { cheminEtape, cheminRetouche, dejaRetouchee, recadrages, urlRendu } from "./retouche_bande.ts";

Deno.test("recadrages : même largeur, 7 % en haut et en bas en moins, puis le format d'origine", () => {
  assertEquals(recadrages(1760, 2368, 0.07), { etape: { l: 1760, h: 2036 }, finale: { l: 1760, h: 2368 } });
  assertEquals(recadrages(1080, 1920, 0.5).etape.h, 1344); // 15 % au plus
  assertEquals(recadrages(1080, 1920, 0).etape.h, 1843); // 2 % au moins
  assertEquals(recadrages(1080, 1920, Number.NaN).etape.h, 1651); // valeur par défaut
  // Au-delà de 2 500 px, ramené sous la limite des transformations Storage.
  assertEquals(recadrages(3000, 4000, 0.07), { etape: { l: 1875, h: 2150 }, finale: { l: 1875, h: 2500 } });
});

Deno.test("urlRendu : rendu Storage recadré au centre, chemin encodé, clé anti-cache", () => {
  assertEquals(
    urlRendu("https://x.supabase.co", "medias", "propre/abc/7 b.jpg", 1080, 1651, "k1"),
    "https://x.supabase.co/storage/v1/render/image/public/medias/propre/abc/7%20b.jpg?width=1080&height=1651&resize=cover&quality=92&v=k1",
  );
});

Deno.test("chemins : même dossier, suffixes fixes ; une photo retouchée est reconnue", () => {
  assertEquals(cheminRetouche("propre/abc/7.jpg"), "propre/abc/7-bande.jpg");
  assertEquals(cheminEtape("propre/abc/7.jpg"), "propre/abc/7-bande-etape.jpg");
  assertEquals(cheminRetouche("propre/abc/7-bande-etape.jpg"), "propre/abc/7-bande.jpg");
  assertEquals(dejaRetouchee("propre/abc/7-bande.jpg"), true);
  assertEquals(dejaRetouchee("propre/abc/7.jpg"), false);
});
