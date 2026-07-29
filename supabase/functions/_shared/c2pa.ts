/**
 * Retrait des Content Credentials (C2PA) — métadonnées signées qui indiquent
 * comment une image a été créée ou modifiée (souvent injectées par Seedream /
 * les modèles d'édition).
 *
 * JPEG : décode + ré-encode (tous les marqueurs APP / XMP / JUMBF partent).
 * PNG  : on retire les chunks `caBX` / `c2pa` et les textes XMP associés.
 */

function enBase64(bytes: Uint8Array): string {
  let binaire = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binaire += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binaire);
}

function deBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function estJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function estPng(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

/** Heuristique : la charge utile mentionne C2PA / Content Credentials. */
export function contientContentCredentials(bytes: Uint8Array): boolean {
  const max = Math.min(bytes.length, 256_000);
  let ascii = "";
  for (let i = 0; i < max; i += 1) {
    const b = bytes[i]!;
    ascii += b >= 32 && b < 127 ? String.fromCharCode(b) : "\n";
  }
  return /c2pa|jumb|contentcredentials|content credentials/i.test(ascii);
}

async function jpegSansMetadonnees(bytes: Uint8Array): Promise<Uint8Array> {
  const { decode, encode } = await import("npm:jpeg-js@0.4.4");
  const raw = decode(bytes, { maxMemoryUsageInMB: 256, useTArray: true });
  if (!raw?.width || !raw?.height || !raw?.data) {
    throw new Error("c2pa: décodage JPEG impossible");
  }
  const out = encode(
    { data: raw.data, width: raw.width, height: raw.height },
    92,
  );
  return out.data as Uint8Array;
}

function pngSansC2pa(bytes: Uint8Array): { bytes: Uint8Array; modifie: boolean } {
  const out: number[] = [];
  for (let i = 0; i < 8; i += 1) out.push(bytes[i]!);

  let i = 8;
  let modifie = false;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  while (i + 8 <= bytes.length) {
    const len = dv.getUint32(i);
    const type = String.fromCharCode(
      bytes[i + 4]!,
      bytes[i + 5]!,
      bytes[i + 6]!,
      bytes[i + 7]!,
    );
    const chunkStart = i;
    const chunkEnd = i + 12 + len;
    if (chunkEnd > bytes.length) break;

    const data = bytes.subarray(i + 8, i + 8 + len);
    let drop = type === "caBX" || type === "c2pa";

    if (!drop && (type === "iTXt" || type === "tEXt" || type === "zTXt")) {
      const texte = new TextDecoder().decode(data).toLowerCase();
      if (
        texte.includes("c2pa") ||
        texte.includes("contentcredentials") ||
        texte.includes("content credentials") ||
        texte.includes("adobe:claim")
      ) {
        drop = true;
      }
    }

    if (drop) modifie = true;
    else for (let j = chunkStart; j < chunkEnd; j += 1) out.push(bytes[j]!);

    i = chunkEnd;
    if (type === "IEND") break;
  }

  return { bytes: new Uint8Array(out), modifie };
}

export interface ResultatC2pa {
  base64: string;
  mime: string;
  retire: boolean;
}

/**
 * Retire les Content Credentials. Toujours appelé en fin de chaîne de
 * nettoyage, avant stockage.
 */
export async function retirerContentCredentials(base64: string): Promise<ResultatC2pa> {
  const bytes = deBase64(base64);

  if (estJpeg(bytes)) {
    const clean = await jpegSansMetadonnees(bytes);
    return {
      base64: enBase64(clean),
      mime: "image/jpeg",
      // Ré-encode = métadonnées garanties absentes.
      retire: true,
    };
  }

  if (estPng(bytes)) {
    const { bytes: clean, modifie } = pngSansC2pa(bytes);
    return {
      base64: enBase64(clean),
      mime: "image/png",
      retire: modifie || contientContentCredentials(bytes),
    };
  }

  return { base64, mime: "application/octet-stream", retire: false };
}
