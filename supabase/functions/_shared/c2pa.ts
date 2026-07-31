/**
 * Retrait des Content Credentials (C2PA) — métadonnées signées injectées
 * souvent par Fal / partenaires.
 *
 * IMPORTANT QUALITÉ : aucun ré-encodage lossy.
 * - JPEG : on retire uniquement les marqueurs APP (XMP / JUMBF / C2PA),
 *   les données image (SOS…) restent byte-à-byte.
 * - PNG  : on retire les chunks `caBX` / `c2pa` et textes XMP associés.
 * - Si rien à retirer : bytes inchangés.
 *
 * Mémoire : on concatène des sous-vues `Uint8Array` (pas de `number[]` ni
 * base64 intermédiaire) — critique pour l’upscale SeedVR en Edge.
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

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
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

function estWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
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

function payloadSuspectC2pa(payload: Uint8Array): boolean {
  const max = Math.min(payload.length, 64_000);
  let ascii = "";
  for (let i = 0; i < max; i += 1) {
    const b = payload[i]!;
    ascii += b >= 32 && b < 127 ? String.fromCharCode(b) : "\n";
  }
  return /c2pa|jumb|contentcredentials|content credentials|adobe:claim/i.test(ascii);
}

/**
 * Retire les segments APP JPEG liés à C2PA / XMP / JUMBF sans décoder
 * ni ré-encoder l'image (lossless au niveau bitstream).
 */
function jpegStripC2paLossless(bytes: Uint8Array): { bytes: Uint8Array; modifie: boolean } {
  if (!estJpeg(bytes)) return { bytes, modifie: false };

  const parts: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI
  let i = 2;
  let modifie = false;

  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) {
      parts.push(bytes.subarray(i));
      break;
    }

    while (i + 1 < bytes.length && bytes[i] === 0xff && bytes[i + 1] === 0xff) {
      parts.push(bytes.subarray(i, i + 1));
      i += 1;
    }
    if (i + 1 >= bytes.length) break;

    const marker = bytes[i + 1]!;

    if (marker === 0xd9) {
      parts.push(bytes.subarray(i, i + 2));
      i += 2;
      if (i < bytes.length) parts.push(bytes.subarray(i));
      break;
    }

    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(bytes.subarray(i, i + 2));
      i += 2;
      continue;
    }

    // SOS : copie du reste byte-à-byte.
    if (marker === 0xda) {
      parts.push(bytes.subarray(i));
      break;
    }

    if (i + 3 >= bytes.length) {
      parts.push(bytes.subarray(i));
      break;
    }

    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (len < 2 || i + 2 + len > bytes.length) {
      parts.push(bytes.subarray(i));
      break;
    }

    const segmentEnd = i + 2 + len;
    const payload = bytes.subarray(i + 4, segmentEnd);
    const estApp = marker >= 0xe0 && marker <= 0xef;
    const drop = estApp && (
      marker === 0xeb ||
      payloadSuspectC2pa(payload)
    );

    if (drop) modifie = true;
    else parts.push(bytes.subarray(i, segmentEnd));
    i = segmentEnd;
  }

  return { bytes: modifie ? concatBytes(parts) : bytes, modifie };
}

function pngSansC2pa(bytes: Uint8Array): { bytes: Uint8Array; modifie: boolean } {
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
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
    else parts.push(bytes.subarray(chunkStart, chunkEnd));

    i = chunkEnd;
    if (type === "IEND") break;
  }

  return { bytes: modifie ? concatBytes(parts) : bytes, modifie };
}

export interface ResultatC2pa {
  base64: string;
  mime: string;
  retire: boolean;
}

export interface ResultatC2paBytes {
  bytes: Uint8Array;
  mime: string;
  retire: boolean;
}

/** Variante bytes — évite base64 (upscale Edge / gros fichiers). */
export async function retirerContentCredentialsBytes(
  bytes: Uint8Array,
): Promise<ResultatC2paBytes> {
  if (estJpeg(bytes)) {
    if (!contientContentCredentials(bytes)) {
      return { bytes, mime: "image/jpeg", retire: false };
    }
    const { bytes: clean, modifie } = jpegStripC2paLossless(bytes);
    return { bytes: clean, mime: "image/jpeg", retire: modifie };
  }

  if (estPng(bytes)) {
    if (!contientContentCredentials(bytes)) {
      return { bytes, mime: "image/png", retire: false };
    }
    const { bytes: clean, modifie } = pngSansC2pa(bytes);
    return { bytes: clean, mime: "image/png", retire: modifie };
  }

  if (estWebp(bytes)) {
    return { bytes, mime: "image/webp", retire: false };
  }

  return { bytes, mime: "application/octet-stream", retire: false };
}

/**
 * Retire les Content Credentials SANS ré-encodage lossy.
 * Toujours appelé en fin de chaîne de nettoyage, avant stockage.
 */
export async function retirerContentCredentials(base64: string): Promise<ResultatC2pa> {
  const bytes = deBase64(base64);
  const r = await retirerContentCredentialsBytes(bytes);
  return {
    base64: r.retire ? enBase64(r.bytes) : base64,
    mime: r.mime,
    retire: r.retire,
  };
}
