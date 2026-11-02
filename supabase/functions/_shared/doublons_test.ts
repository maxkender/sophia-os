import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";

import {
  distanceEmpreintes,
  ecartsDoublons,
  empreinteDepuisPixels,
  estEmpreinte,
  memeSignature,
  normaliserAccroche,
  SEUIL_EMPREINTE,
  urlMiniature,
} from "./doublons.ts";

Deno.test("normaliserAccroche : casse, ponctuation, émojis et retours à la ligne ne comptent pas", () => {
  const base = normaliserAccroche("hobbies that will make you dangerously confident");
  assertEquals(base, "hobbies that will make you dangerously confident");
  assertEquals(normaliserAccroche("Hobbies That Will Make You\nDANGEROUSLY confident 🔥"), base);
  assertEquals(normaliserAccroche("hobbies that will make you — dangerously confident!!"), base);
  assertEquals(normaliserAccroche("study hacks / i wish i knew earlier"), "study hacks i wish i knew earlier");
  // Une vraie différence reste une différence.
  assertNotEquals(normaliserAccroche("study hacks i wish i knew earlier pt. 2"), normaliserAccroche("study hacks i wish i knew earlier"));
  // Accents et casse turque : la même accroche, quelle que soit sa graphie.
  assertEquals(normaliserAccroche("Ders çalışma İPUÇLARI!"), "ders calisma ipuclari");
  assertEquals(normaliserAccroche("ders çalışma ipuçları"), "ders calisma ipuclari");
  // Toutes les écritures : les lettres non latines sont gardées.
  assertEquals(normaliserAccroche("Привычки, которые сделают тебя умнее"), "привычки которые сделают тебя умнее");
  assertEquals(normaliserAccroche("  "), null);
  assertEquals(normaliserAccroche("🔥!"), null);
  assertEquals(normaliserAccroche(null), null);
});

Deno.test("estEmpreinte et distanceEmpreintes : 16 caractères hexadécimaux, bits qui diffèrent", () => {
  assertEquals(estEmpreinte("195272597968aec6"), true);
  assertEquals(estEmpreinte("195272597968AEC6"), false);
  assertEquals(estEmpreinte("1952725979"), false);
  assertEquals(estEmpreinte(null), false);
  assertEquals(distanceEmpreintes("0000000000000000", "0000000000000000"), 0);
  assertEquals(distanceEmpreintes("0000000000000000", "ffffffffffffffff"), 64);
  assertEquals(distanceEmpreintes("0000000000000000", "0000000000000103"), 3);
});

/** Image de test : un dégradé horizontal et une tache, en RGBA. */
function image(largeur: number, hauteur: number, f: (x: number, y: number) => number): Uint8Array {
  const data = new Uint8Array(largeur * hauteur * 4);
  for (let y = 0; y < hauteur; y += 1) {
    for (let x = 0; x < largeur; x += 1) {
      const v = Math.max(0, Math.min(255, Math.round(f(x, y))));
      const i = (y * largeur + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

Deno.test("empreinteDepuisPixels : stable à la taille et à la luminosité, différente pour une autre image", () => {
  const motif = (x: number, y: number, w: number, h: number) =>
    128 + 100 * Math.sin((x / w) * 7) * Math.cos((y / h) * 5) + (x < w / 3 ? 40 : 0);
  const a = empreinteDepuisPixels(image(64, 36, (x, y) => motif(x, y, 64, 36)), 64, 36);
  const grande = empreinteDepuisPixels(image(256, 144, (x, y) => motif(x, y, 256, 144)), 256, 144);
  const eclaircie = empreinteDepuisPixels(image(64, 36, (x, y) => motif(x, y, 64, 36) * 0.8 + 30), 64, 36);
  const autre = empreinteDepuisPixels(image(64, 36, (x, y) => 128 + 100 * Math.cos((y / 36) * 9) * Math.sin((x / 64) * 3)), 64, 36);
  assertEquals(estEmpreinte(a), true);
  assertEquals(distanceEmpreintes(a, grande) <= SEUIL_EMPREINTE, true, `taille : ${distanceEmpreintes(a, grande)}`);
  assertEquals(distanceEmpreintes(a, eclaircie), 0, "même ordre des cases après éclaircissement");
  assertEquals(distanceEmpreintes(a, autre) > SEUIL_EMPREINTE, true, `autre image : ${distanceEmpreintes(a, autre)}`);
});

Deno.test("empreinteDepuisPixels : accepte le RGB et le gris, et une image plus petite que 9 × 8", () => {
  const rgba = image(18, 16, (x) => x * 14);
  const rgb = new Uint8Array(18 * 16 * 3);
  const gris = new Uint8Array(18 * 16);
  for (let p = 0; p < 18 * 16; p += 1) {
    rgb[p * 3] = rgb[p * 3 + 1] = rgb[p * 3 + 2] = rgba[p * 4];
    gris[p] = rgba[p * 4];
  }
  const ref = empreinteDepuisPixels(rgba, 18, 16, 4);
  assertEquals(empreinteDepuisPixels(rgb, 18, 16, 3), ref);
  assertEquals(empreinteDepuisPixels(gris, 18, 16, 1), ref);
  assertEquals(estEmpreinte(empreinteDepuisPixels(image(3, 2, (x) => x * 80), 3, 2)), true);
});

Deno.test("memeSignature : accroche identique, ou couverture sous le seuil", () => {
  const s = (accroche: string | null, empreinte: string | null) => ({ accroche, empreinte });
  assertEquals(memeSignature(s("a b c", null), s("a b c", "ffffffffffffffff")), true, "même accroche suffit");
  assertEquals(memeSignature(s("a b c", "0000000000000000"), s("x y z", "00000000000000ff")), true, "8 bits : même image");
  assertEquals(memeSignature(s("a b c", "0000000000000000"), s("x y z", "00000000000001ff")), false, "9 bits : autre image");
  assertEquals(memeSignature(s(null, null), s(null, null)), false, "rien à comparer : jamais un doublon");
  assertEquals(memeSignature(s(null, "pas une empreinte"), s(null, "pas une empreinte")), false);
});

Deno.test("ecartsDoublons : l'écart au doublon le plus proche, jamais le même contenu", () => {
  const signatures = new Map([
    ["vu-1", { accroche: "hobbies that will make you dangerously confident", empreinte: null }],
    ["vu-2", { accroche: "autre accroche", empreinte: "195272597968aec6" }],
    ["vu-3", { accroche: null, empreinte: null }],
  ]);
  const candidats: Array<[string, { accroche: string | null; empreinte: string | null }]> = [
    ["c-accroche", { accroche: "hobbies that will make you dangerously confident", empreinte: null }],
    ["c-image", { accroche: "nouvelle", empreinte: "195272597968aec7" }],
    ["c-neuf", { accroche: "rien à voir", empreinte: "e6ae687959725219" }],
    ["vu-2", { accroche: "autre accroche", empreinte: "195272597968aec6" }],
  ];
  const ecarts = ecartsDoublons({
    candidats,
    recents: [
      { contenuId: "vu-1", ecart: 6 },
      { contenuId: "vu-1", ecart: 2 },
      { contenuId: "vu-2", ecart: 4 },
      { contenuId: "vu-3", ecart: 1 },
    ],
    signatures,
  });
  assertEquals(ecarts.get("c-accroche"), 2, "le passage le plus proche des deux");
  assertEquals(ecarts.get("c-image"), 4, "même couverture à 1 bit près");
  assertEquals(ecarts.has("c-neuf"), false);
  assertEquals(ecarts.has("vu-2"), false, "le même contenu relève de la règle 0271, pas de celle-ci");
});

Deno.test("ecartsDoublons : aucun post récent, ou aucune signature connue, rend une carte vide", () => {
  const candidats: Array<[string, { accroche: string | null; empreinte: string | null }]> = [["c", { accroche: "x y z", empreinte: null }]];
  assertEquals(ecartsDoublons({ candidats, recents: [], signatures: new Map() }).size, 0);
  assertEquals(ecartsDoublons({ candidats, recents: [{ contenuId: "inconnu", ecart: 1 }], signatures: new Map() }).size, 0);
});

Deno.test("urlMiniature : la miniature du stockage public, rien ailleurs", () => {
  assertEquals(
    urlMiniature("https://abc.supabase.co/storage/v1/object/public/medias/propre/x/1-upscale.jpg?v=1785624260925"),
    "https://abc.supabase.co/storage/v1/render/image/public/medias/propre/x/1-upscale.jpg?width=64&height=64&resize=contain",
  );
  assertEquals(urlMiniature("https://p16.tiktokcdn.com/x.jpg"), null);
});
