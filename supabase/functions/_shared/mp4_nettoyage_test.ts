import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import { nettoyerMp4, tracesRestantes } from "./mp4_nettoyage.ts";

function boite(type: string, ...contenu: Uint8Array[]): Uint8Array {
  const corps = contenu.reduce((s, x) => s + x.length, 0);
  const o = new Uint8Array(8 + corps);
  new DataView(o.buffer).setUint32(0, 8 + corps);
  o.set(new TextEncoder().encode(type), 4);
  let p = 8;
  for (const x of contenu) {
    o.set(x, p);
    p += x.length;
  }
  return o;
}
const octets = (n: number, v = 0) => new Uint8Array(n).fill(v);
const texte = (s: string) => new TextEncoder().encode(s);
function stco(...decalages: number[]): Uint8Array {
  const o = new Uint8Array(8 + 4 * decalages.length);
  const v = new DataView(o.buffer);
  v.setUint32(4, decalages.length);
  decalages.forEach((d, i) => v.setUint32(8 + 4 * i, d));
  return boite("stco", o);
}
function lireStco(mp4: Uint8Array): number[] {
  const s = new TextDecoder("latin1").decode(mp4);
  const i = s.indexOf("stco");
  const v = new DataView(mp4.buffer, mp4.byteOffset);
  const n = v.getUint32(i + 8);
  return Array.from({ length: n }, (_, k) => v.getUint32(i + 12 + 4 * k));
}

/** ftyp, moov (piste + udta « Lavf » + uuid C2PA), uuid C2PA, mdat dont les morceaux sont à 2 décalages. */
function mp4Marque(): { mp4: Uint8Array; morceaux: number[] } {
  const ftyp = boite("ftyp", texte("isom"), octets(4), texte("isomavc1"));
  const udta = boite("udta", boite("meta", octets(4), boite("ilst", texte("Lavf59.27.100"))));
  const uuidC2pa = boite("uuid", texte("c2pa-manifest-jumb-xyz"));
  const fabriquerMoov = (offsets: number[]) =>
    boite("moov", boite("mvhd", octets(20)), boite("trak", boite("tkhd", octets(12)), boite("mdia", boite("minf", boite("stbl", stco(...offsets))))), udta, uuidC2pa);
  const moovTaille = fabriquerMoov([0, 0]).length;
  const avantMdat = ftyp.length + moovTaille + uuidC2pa.length + 8;
  const morceaux = [avantMdat, avantMdat + 6];
  const mdat = boite("mdat", texte("IMAGE1"), texte("IMAGE2"));
  const mp4 = new Uint8Array([...ftyp, ...fabriquerMoov(morceaux), ...uuidC2pa, ...mdat]);
  return { mp4, morceaux };
}

Deno.test("nettoyerMp4 : retire udta, meta et C2PA, et recale les morceaux", () => {
  const { mp4, morceaux } = mp4Marque();
  assertEquals(tracesRestantes(mp4).includes("c2pa"), true);
  const { bytes, rapport } = nettoyerMp4(mp4);
  assertEquals(rapport.retires, ["moov/udta", "moov/uuid", "uuid"]);
  assertEquals(rapport.verifie, true);
  assertEquals(tracesRestantes(bytes), []);
  assertEquals(new TextDecoder().decode(bytes).includes("Lavf"), false);
  // Les morceaux pointent toujours sur les mêmes images.
  const nouveaux = lireStco(bytes);
  const retire = mp4.length - bytes.length;
  assertEquals(nouveaux, morceaux.map((m) => m - retire));
  const dec = new TextDecoder();
  assertEquals(dec.decode(bytes.subarray(nouveaux[0], nouveaux[0] + 6)), "IMAGE1");
  assertEquals(dec.decode(bytes.subarray(nouveaux[1], nouveaux[1] + 6)), "IMAGE2");
});

Deno.test("nettoyerMp4 : un MP4 déjà propre ressort à l'identique", () => {
  const { mp4 } = mp4Marque();
  const une = nettoyerMp4(mp4).bytes;
  const deux = nettoyerMp4(une);
  assertEquals(deux.rapport.retires, []);
  assertEquals(deux.bytes, une);
});

Deno.test("nettoyerMp4 : refuse ce qui n'est pas un MP4", () => {
  assertThrows(() => nettoyerMp4(texte("pas une vidéo du tout")));
});
