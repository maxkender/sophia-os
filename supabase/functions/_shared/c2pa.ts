/**
 * Retrait des Content Credentials (C2PA) — métadonnées signées injectées
 * souvent par Fal / partenaires.
 *
 * IMPORTANT QUALITÉ : aucun ré-encodage lossy.
 * - JPEG : on retire uniquement les marqueurs APP (XMP / JUMBF / C2PA),
 *   les données image (SOS…) restent byte-à-byte.
 * - PNG  : on retire les chunks `caBX` / `c2pa` et textes XMP associés.
 * - Si rien à retirer : bytes inchangés.
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

  const out: number[] = [0xff, 0xd8];
  let i = 2;
  let modifie = false;

  while (i + 1 < bytes.length) {
    if (bytes[i] !== 0xff) {
      // Données non alignées — on copie le reste tel quel.
      for (let j = i; j < bytes.length; j += 1) out.push(bytes[j]!);
      break;
    }

    // Sauter les fill bytes 0xFF
    while (i + 1 < bytes.length && bytes[i] === 0xff && bytes[i + 1] === 0xff) {
      out.push(0xff);
      i += 1;
    }
    if (i + 1 >= bytes.length) break;

    const marker = bytes[i + 1]!;

    // SOI déjà consommé ; EOI
    if (marker === 0xd9) {
      out.push(0xff, 0xd9);
      i += 2;
      // Copie éventuelle traîne après EOI
      for (let j = i; j < bytes.length; j += 1) out.push(bytes[j]!);
      break;
    }

    // RST0–RST7 / TEM : pas de longueur
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(0xff, marker);
      i += 2;
      continue;
    }

    // SOS : début des données entropiques — on copie TOUT le reste (pas de
    // parse des FF 00), donc zéro altération des pixels.
    if (marker === 0xda) {
      for (let j = i; j < bytes.length; j += 1) out.push(bytes[j]!);
      break;
    }

    if (i + 3 >= bytes.length) {
      for (let j = i; j < bytes.length; j += 1) out.push(bytes[j]!);
      break;
    }

    const len = (bytes[i + 2]! << 8) | bytes[i + 3]!;
    if (len < 2 || i + 2 + len > bytes.length) {
      for (let j = i; j < bytes.length; j += 1) out.push(bytes[j]!);
      break;
    }

    const segmentEnd = i + 2 + len;
    const payload = bytes.subarray(i + 4, segmentEnd);

    // APP0–APP15 (E0–EF) : candidats C2PA / XMP / JUMBF.
    // APP11 (EB) porte souvent le JUMBF C2PA ; APP1 (E1) l'XMP.
    const estApp = marker >= 0xe0 && marker <= 0xef;
    const drop = estApp && (
      marker === 0xeb || // APP11 / JUMBF — quasi toujours C2PA chez Fal
      payloadSuspectC2pa(payload)
    );

    if (drop) {
      modifie = true;
    } else {
      for (let j = i; j < segmentEnd; j += 1) out.push(bytes[j]!);
    }
    i = segmentEnd;
  }

  return { bytes: new Uint8Array(out), modifie };
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

export interface ResultatC2paOctets {
  bytes: Uint8Array;
  mime: string;
  retire: boolean;
}

/**
 * Variante octets — évite les allers-retours base64 (critique pour l'upscale
 * Recraft : images lourdes, workers Edge à mémoire limitée).
 */
export async function retirerContentCredentialsOctets(
  bytes: Uint8Array,
): Promise<ResultatC2paOctets> {
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

  // WebP (sortie Recraft) : pas de strip segmentaire — on ne ré-encode jamais.
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
  const strip = await retirerContentCredentialsOctets(deBase64(base64));
  return {
    base64: enBase64(strip.bytes),
    mime: strip.mime,
    retire: strip.retire,
  };
}
