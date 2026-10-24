/**
 * Lecture du profil TikTok public (warm-up de Check, Kill or Double). Sans réseau.
 */

import { assertEquals } from "jsr:@std/assert@1";

import { profilDepuisHtml } from "./profil_tiktok.ts";

function page(detail: unknown): string {
  const donnees = { __DEFAULT_SCOPE__: { "webapp.app-context": {}, "webapp.user-detail": detail } };
  return `<html><head></head><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${
    JSON.stringify(donnees)
  }</script></body></html>`;
}

Deno.test("un compte qui existe : création, abonnements, likes donnés", () => {
  const profil = profilDepuisHtml(page({
    statusCode: 0,
    statusMsg: "",
    userInfo: {
      user: { uniqueId: "matias.crecimiento507", createTime: 1792853463 },
      stats: { followerCount: 0, followingCount: 4, heartCount: 0, videoCount: 0, diggCount: 12 },
    },
  }));
  assertEquals(profil, {
    existe: true,
    creeLe: new Date(1792853463 * 1000).toISOString(),
    abonnements: 4,
    likes: 12,
    abonnes: 0,
    videos: 0,
    erreur: null,
  });
});

Deno.test("les chiffres en texte (statsV2) se lisent aussi", () => {
  const profil = profilDepuisHtml(page({
    statusCode: 0,
    userInfo: { user: { createTime: "1792853463" }, statsV2: { followingCount: "7", diggCount: "0", followerCount: "3", videoCount: "1" } },
  }));
  assertEquals([profil.existe, profil.abonnements, profil.likes, profil.abonnes, profil.videos], [true, 7, 0, 3, 1]);
});

Deno.test("un compte qui n'existe pas : existe = false", () => {
  const profil = profilDepuisHtml(page({ statusCode: 10221, statusMsg: "" }));
  assertEquals(profil.existe, false);
  assertEquals(profil.erreur, null);
});

Deno.test("une page bloquée ne dit jamais « n'existe pas »", () => {
  assertEquals(profilDepuisHtml("<html><body>captcha</body></html>").existe, null);
  assertEquals(profilDepuisHtml(page({ statusCode: 10000 })).existe, null);
  assertEquals(
    profilDepuisHtml('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{pas du json</script>').existe,
    null,
  );
});
