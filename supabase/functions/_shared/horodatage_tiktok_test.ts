/**
 * L'horodatage réel de publication, lu dans l'ID du post TikTok.
 *
 * `publie_at` n'est que l'heure à laquelle le créateur a coché « publié ».
 * Tant qu'on n'avait que ça, impossible de dire si le délai minimum entre
 * publications espace les PUBLICATIONS ou seulement les DÉCLARATIONS — et
 * c'est précisément la question que le réglage pose.
 *
 * Les ID TikTok sont des flocons : les 32 bits de poids fort portent la
 * seconde Unix. Les cas testés ici sont ceux qui feraient écrire une date
 * fausse dans `passages.tiktok_publie_at` :
 *
 *   - un ID réel, dont la date est vérifiable à la main ;
 *   - un lien tronqué ou bricolé, qui donnerait 1970 ;
 *   - un ID futur, signe d'un lien forgé ou d'une horloge folle ;
 *   - le dépassement 32 bits, qu'un `Number` ferait silencieusement dériver :
 *     `>>` en JavaScript tronque à 32 bits, donc un ID de 19 chiffres doit
 *     passer par BigInt sous peine de rendre n'importe quoi.
 */

import { assertEquals } from "jsr:@std/assert@1";

import { horodatageDepuisIdTiktok } from "./resolution_publication.ts";

const MAINTENANT = Date.UTC(2026, 9, 2, 12, 0, 0);

Deno.test("un ID réel rend la seconde de publication", () => {
  // 7535299877481827606 >> 32 = 1754448720 → 2025-08-06T02:52:00Z
  assertEquals(
    horodatageDepuisIdTiktok("7535299877481827606", MAINTENANT),
    "2025-08-06T02:52:00.000Z",
  );
});

Deno.test("passe par BigInt : un décalage sur 32 bits mentirait", () => {
  const id = "7535299877481827606";
  // Ce que donnerait un `Number(id) >> 32` naïf : un négatif, donc une date
  // AVANT 1970. Le piège n'est pas théorique, il est à portée de refactor.
  assertEquals(Number(id) >> 32, -1722201088);
  const rendu = horodatageDepuisIdTiktok(id, MAINTENANT)!;
  assertEquals(new Date(rendu).getUTCFullYear(), 2025);
});

Deno.test("refuse ce qui n'est pas un ID de post", () => {
  for (const mauvais of [null, undefined, "", "   ", "abc", "12345", "75352998774818276061234567890"]) {
    assertEquals(horodatageDepuisIdTiktok(mauvais, MAINTENANT), null);
  }
});

Deno.test("refuse une date hors plage plutôt que de l'écrire", () => {
  // 1000000000000000 >> 32 = 232830 s → 1970. Un lien tronqué donnerait ça.
  assertEquals(horodatageDepuisIdTiktok("1000000000000000", MAINTENANT), null);
  // Un ID postérieur à aujourd'hui : lien forgé, ou horloge folle.
  const futur = String((BigInt(Math.floor(MAINTENANT / 1000) + 3 * 86_400) << 32n) + 1n);
  assertEquals(horodatageDepuisIdTiktok(futur, MAINTENANT), null);
});

Deno.test("tolère un jour d'avance, pas plus", () => {
  const dansDouzeHeures = String(
    (BigInt(Math.floor(MAINTENANT / 1000) + 12 * 3600) << 32n) + 1n,
  );
  assertEquals(horodatageDepuisIdTiktok(dansDouzeHeures, MAINTENANT) !== null, true);
});
