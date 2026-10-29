/**
 * Lecture du profil TikTok public (warm-up de Check, Kill or Double). Sans réseau.
 */

import { assertEquals } from "jsr:@std/assert@1";

import { lireProfilTiktokFiable, profilDepuisHtml, type ProfilTiktok } from "./profil_tiktok.ts";

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

Deno.test("prompt 25 MAJ, 7b : une page illisible est relue une 2e fois avant de conclure", async () => {
  const p = (existe: boolean | null): ProfilTiktok => ({ existe, creeLe: null, abonnements: null, likes: null, abonnes: null, videos: null, erreur: existe === null ? "blocage" : null });
  let n = 0;
  const lectures = [p(null), p(true)];
  assertEquals((await lireProfilTiktokFiable("a", async () => lectures[n++]!, 0)).existe, true);
  assertEquals(n, 2);
  n = 0;
  assertEquals((await lireProfilTiktokFiable("a", async () => { n++; return p(false); }, 0)).existe, false);
  assertEquals(n, 1);
  const deux = await lireProfilTiktokFiable("a", async () => p(null), 0);
  assertEquals(deux.existe, null);
  assertEquals(deux.erreur, "2 lectures illisibles : blocage");
});
