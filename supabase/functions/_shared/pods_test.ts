import { assertEquals } from "jsr:@std/assert@1";
import {
  CHEMIN_POD,
  contenusLivresHorsLangue,
  deckLivrePret,
  metadonneesJpeg,
  prochainJour,
  sha256Hex,
  verifierDepot,
  verifierOriginal,
  verifierVideo,
} from "./pods.ts";

Deno.test("deckLivrePret : toutes les slides doivent avoir leur image", () => {
  assertEquals(deckLivrePret([]), false);
  assertEquals(deckLivrePret(null), false);
  assertEquals(deckLivrePret([{ position: 1, media_id: "a" }, { position: 2, media_id: null }]), false);
  assertEquals(deckLivrePret([{ position: 1, media_id: "a" }, { position: 2, media_id: "b" }]), true);
});

Deno.test("metadonneesJpeg : repère EXIF, ICC, C2PA, commentaires ; ignore JFIF", () => {
  const seg = (m: number, n = 4) => [0xff, m, 0, n + 2, ...new Array(n).fill(0)];
  const jpeg = (...segs: number[][]) => new Uint8Array([0xff, 0xd8, ...segs.flat(), 0xff, 0xda, 0, 2]);
  assertEquals(metadonneesJpeg(jpeg(seg(0xe0))), []);
  assertEquals(metadonneesJpeg(jpeg(seg(0xe0), seg(0xe1), seg(0xe2), seg(0xeb), seg(0xfe))), ["0xe1", "0xe2", "0xeb", "0xfe"]);
  assertEquals(metadonneesJpeg(new Uint8Array([0x89, 0x50])), null);
});

Deno.test("verifierDepot : langue source, slide de l'app, positions uniques", () => {
  const s = (position: number, position_sophia = false) => ({ position, position_sophia, jpeg_base64: "" });
  assertEquals(verifierDepot({ fr: { slides: [s(1), s(2, true)] } }, "fr"), []);
  assertEquals(verifierDepot({}, "fr"), ["aucun deck"]);
  assertEquals(verifierDepot({ de: { slides: [s(1, true)] } }, "fr"), ["pas de deck dans la langue source (fr)"]);
  assertEquals(verifierDepot({ fr: { slides: [s(1), s(1, true)] } }, "fr"), ["fr : positions en double"]);
  assertEquals(verifierDepot({ fr: { slides: [s(1)] } }, "fr"), ["fr : aucune slide de l'app"]);
});

Deno.test("sha256Hex", async () => {
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

Deno.test("verifierOriginal : positions, images, une slide Sophia, inspiration, aucune autre appli", () => {
  const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const ref = (n: number) => `https://abc.supabase.co/storage/v1/object/public/medias/brut/7667/${n}.jpg`;
  const ok = [1, 2, 3, 4, 5, 6].map((p) => ({
    position: p,
    media_id: id(p),
    texte_overlay: `slide ${p}`,
    reference_url: ref(p),
    texte_sophia: p === 5 ? "a micro-learning app like the Sophia app" : undefined,
  }));
  const avec = (i: number, champ: Record<string, unknown>) => ok.map((s, k) => (k === i ? { ...s, ...champ } : s));
  assertEquals(verifierOriginal(ok), []);
  assertEquals(verifierOriginal(ok.slice(0, 3)).length > 0, true);
  assertEquals(verifierOriginal(avec(5, { position: 7 })).length > 0, true);
  assertEquals(verifierOriginal(avec(5, { media_id: id(1) })), ["même image utilisée deux fois"]);
  assertEquals(verifierOriginal(avec(5, { texte_overlay: "i use the sophia app" })).length, 1);
  assertEquals(verifierOriginal(avec(5, { texte_overlay: "the vent now app helped" })).length, 1);
  assertEquals(verifierOriginal(avec(0, { texte_overlay: "x".repeat(121) })).length, 1);
  assertEquals(verifierOriginal(avec(5, { texte_overlay: " " })), ["#6 : texte vide"]);
  assertEquals(verifierOriginal(avec(4, { texte_sophia: null })), ["0 slide(s) Sophia (une seule attendue)"]);
  assertEquals(verifierOriginal(avec(3, { texte_sophia: "the Sophia app" })).length, 1);
  assertEquals(verifierOriginal(avec(4, { texte_sophia: "a micro-learning app" })).length, 1);
  assertEquals(verifierOriginal(avec(2, { reference_url: "https://p16.tiktokcdn.com/x.jpg" })).length, 1);
});

/** Client minimal : `from(table)` → filtres eq/in appliqués sur des lignes fixes. */
function faux(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      let lignes = tables[table] ?? [];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((lignes = lignes.filter((l) => l[c] === v)), q),
        in: (c: string, vs: unknown[]) => ((lignes = lignes.filter((l) => vs.includes(l[c]))), q),
        then: (ok: (r: { data: unknown; error: null }) => unknown) => Promise.resolve(ok({ data: lignes, error: null })),
      };
      return q;
    },
  };
}

Deno.test("contenusLivresHorsLangue : retire les livrés sans deck complet dans la langue", async () => {
  const sb = faux({
    contenus: [
      { id: "a", livre: true },
      { id: "b", livre: true },
      { id: "c", livre: false },
    ],
    contenu_langues: [
      { contenu_id: "a", langue: "en", slides: [{ position: 1, media_id: "m1" }] },
      { contenu_id: "b", langue: "en", slides: [{ position: 1, media_id: null }] },
      { contenu_id: "a", langue: "fr", slides: [{ position: 1, media_id: "m2" }] },
      { contenu_id: "b", langue: "fr", slides: [{ position: 1, media_id: "m3" }] },
    ],
  });
  assertEquals([...(await contenusLivresHorsLangue(sb, "en"))], ["b"]);
  assertEquals([...(await contenusLivresHorsLangue(sb, "fr"))], []);
  assertEquals([...(await contenusLivresHorsLangue(sb, "de"))].sort(), ["a", "b"]);
});

Deno.test("verifierVideo : chemins du pod, textes, comptes uniques", () => {
  const c = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const item = (n: number) => ({
    compte_id: c(n),
    reaction_path: `pods/reactions_ugc/reactions/hook-01/${c(n)}.mp4`,
    texte_ecran: "je pourrais EMBRASSER la personne qui m'a montré ça",
    legende: "#culture #apprendre #astuce",
  });
  assertEquals(verifierVideo("reactions_ugc", [item(1), item(2)]), []);
  assertEquals(verifierVideo("reactions_ugc", []), ["aucun compte"]);
  assertEquals(verifierVideo("reactions_ugc", [item(1), item(1)]), ["même compte deux fois"]);
  assertEquals(verifierVideo("reactions_ugc", [{ ...item(1), reaction_path: "autre/x.mp4" }]).length, 1);
  assertEquals(verifierVideo("reactions_ugc", [{ ...item(1), texte_ecran: " " }]).length, 1);
});

Deno.test("prochainJour : demain au plus tôt, puis le lendemain de la dernière vidéo", () => {
  assertEquals(prochainJour(null, "2026-10-06"), "2026-10-07");
  assertEquals(prochainJour("2026-10-01", "2026-10-06"), "2026-10-07");
  assertEquals(prochainJour("2026-10-09", "2026-10-06"), "2026-10-10");
  assertEquals(prochainJour("2026-12-31", "2026-12-30"), "2027-01-01");
});

Deno.test("CHEMIN_POD : personas, réactions et sources seulement", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  assertEquals(CHEMIN_POD.test(`personas/${id}.jpg`), true);
  assertEquals(CHEMIN_POD.test(`reactions/hook-01/${id}.mp4`), true);
  assertEquals(CHEMIN_POD.test(`../propre/x.jpg`), false);
  assertEquals(CHEMIN_POD.test(`reactions/hook-01/${id}.mov`), false);
  assertEquals(CHEMIN_POD.test(`sources/hook-01/reaction.mp4`), true);
  assertEquals(CHEMIN_POD.test(`sources/hook-01/${id}.jpg`), true);
  assertEquals(CHEMIN_POD.test(`sources/hook-01/autre.mp4`), false);
  assertEquals(CHEMIN_POD.test(`sources/../x/reaction.mp4`), false);
});
