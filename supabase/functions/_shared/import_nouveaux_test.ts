import { assertEquals } from "jsr:@std/assert@1";

import { instantPostTiktok, plafondEnfilage, profilIllisible, separerTropRecents } from "./import_nouveaux.ts";

// Un identifiant TikTok porte son heure de création dans ses 32 bits hauts.
const idA = (sec: number) => (BigInt(sec) << 32n).toString();
const url = (sec: number) => `https://www.tiktok.com/@source/photo/${idA(sec)}`;
const JOUR = 86_400;
const MAINTENANT = 1_794_000_000;

Deno.test("instantPostTiktok : createTime d'abord, sinon l'identifiant, sinon inconnu", () => {
  assertEquals(instantPostTiktok(url(MAINTENANT - JOUR), MAINTENANT - 3 * JOUR), MAINTENANT - 3 * JOUR);
  assertEquals(instantPostTiktok(url(MAINTENANT - JOUR), (MAINTENANT - 2 * JOUR) * 1000), MAINTENANT - 2 * JOUR);
  assertEquals(instantPostTiktok(url(MAINTENANT - JOUR)), MAINTENANT - JOUR);
  assertEquals(instantPostTiktok("https://www.tiktok.com/@source/photo/abc"), null);
});

Deno.test("separerTropRecents : un post de moins de 7 jours attend le passage suivant", () => {
  const vieux = url(MAINTENANT - 10 * JOUR);
  const recent = url(MAINTENANT - 1 * JOUR);
  const limite = url(MAINTENANT - 7 * JOUR);
  const inconnu = "https://www.tiktok.com/@source/photo/abc";
  const r = separerTropRecents([vieux, recent, limite, inconnu], new Map(), MAINTENANT, 7);
  assertEquals(r.murs, [vieux, limite, inconnu]);
  assertEquals(r.tropRecents, [recent]);
});

Deno.test("separerTropRecents : le createTime du listing l'emporte sur l'identifiant", () => {
  const u = url(MAINTENANT - 1 * JOUR);
  const id = u.split("/").pop()!;
  const r = separerTropRecents([u], new Map([[id, MAINTENANT - 9 * JOUR]]), MAINTENANT, 7);
  assertEquals(r.murs, [u]);
});

Deno.test("separerTropRecents : âge minimal à 0, tout passe", () => {
  const recent = url(MAINTENANT - 60);
  assertEquals(separerTropRecents([recent], new Map(), MAINTENANT, 0), { murs: [recent], tropRecents: [] });
});

Deno.test("plafondEnfilage : une source en essai n'importe que ce qui reste de son essai", () => {
  assertEquals(plafondEnfilage({ essaiMax: 30, dejaDeLaSource: 0, maxParMaj: 100 }), 30);
  assertEquals(plafondEnfilage({ essaiMax: 30, dejaDeLaSource: 12, maxParMaj: 100 }), 18);
  assertEquals(plafondEnfilage({ essaiMax: 30, dejaDeLaSource: 45, maxParMaj: 100 }), 0);
});

Deno.test("plafondEnfilage : hors essai, une mise à jour s'arrête à la tranche", () => {
  assertEquals(plafondEnfilage({ essaiMax: null, dejaDeLaSource: 400, maxParMaj: 100 }), 100);
  assertEquals(plafondEnfilage({ essaiMax: 300, dejaDeLaSource: 0, maxParMaj: 100 }), 100);
});

Deno.test("plafondEnfilage : sans réglage, pas de plafond", () => {
  assertEquals(plafondEnfilage({ essaiMax: null, dejaDeLaSource: 400, maxParMaj: null }), null);
  assertEquals(plafondEnfilage({ essaiMax: null, dejaDeLaSource: 0, maxParMaj: 0 }), null);
});

Deno.test("profilIllisible : rien vu et Apify en erreur, c'est un échec, pas un profil vide", () => {
  const cle = profilIllisible({ vus: 0, apifyErreur: 'Apify 401: {"error": {"type": "user-or-token-not-found"}}' });
  assertEquals(cle?.startsWith("clé Apify refusée"), true);
  assertEquals(profilIllisible({ vus: 0, apifyErreur: "Apify 502: bad gateway" })?.startsWith("profil illisible"), true);
});

Deno.test("profilIllisible : un profil lu, même vide, n'est pas un échec", () => {
  assertEquals(profilIllisible({ vus: 0, apifyErreur: null }), null);
  // La page TikTok a donné des slideshows : Apify en panne ne bloque pas.
  assertEquals(profilIllisible({ vus: 12, apifyErreur: "Apify 401" }), null);
});
