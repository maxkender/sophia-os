import { assertEquals } from "jsr:@std/assert@1";

import { octetsDepuisBase64 } from "./base64_octets.ts";

/** L'écriture d'avant, lente : la référence. */
const avant = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

function enBase64(octets: Uint8Array): string {
  let binaire = "";
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(binaire);
}

function alea(n: number): Uint8Array {
  const octets = new Uint8Array(n);
  for (let i = 0; i < n; i += 65536) crypto.getRandomValues(octets.subarray(i, Math.min(n, i + 65536)));
  return octets;
}

Deno.test("octetsDepuisBase64 rend les mêmes octets que l'écriture d'avant, à toutes les tailles", () => {
  for (const taille of [0, 1, 2, 3, 4, 255, 256, 65_535, 65_536, 65_537, 1_000_003]) {
    const octets = alea(taille);
    const base64 = enBase64(octets);
    assertEquals(octetsDepuisBase64(base64), octets);
    assertEquals(octetsDepuisBase64(base64), avant(base64));
  }
});

Deno.test("octetsDepuisBase64 garde toutes les valeurs d'octet, 0 et 255 compris", () => {
  const tous = Uint8Array.from({ length: 256 }, (_, i) => i);
  assertEquals(octetsDepuisBase64(enBase64(tous)), tous);
});

Deno.test("octetsDepuisBase64 est nettement plus rapide sur une image de 4 Mo", () => {
  const base64 = enBase64(alea(4 * 1024 * 1024));
  const chrono = (f: () => unknown) => {
    const debut = performance.now();
    f();
    return performance.now() - debut;
  };
  const lent = chrono(() => avant(base64));
  const rapide = Math.min(chrono(() => octetsDepuisBase64(base64)), chrono(() => octetsDepuisBase64(base64)));
  // Mesuré : environ 300 ms contre 10 ms. Marge large pour ne pas dépendre de la machine.
  assertEquals(rapide * 4 < lent, true, `boucle ${Math.round(rapide)} ms, avant ${Math.round(lent)} ms`);
});
