/**
 * Nettoyage final d'un MP4 (UGC IA, 0666) : retire tout ce qui, dans le
 * conteneur, peut dire d'où vient la vidéo, sans toucher à l'image ni au son
 * (aucun réencodage).
 *
 * Retirés, au niveau du fichier, du `moov` et de chaque piste :
 *   - `udta` / `meta` : balises (encodeur « Lavf… », outil, XMP, titres…) ;
 *   - `uuid` : boîtes privées, dont les Content Credentials (C2PA) et le XMP ;
 *   - `jumb` : manifeste C2PA en JUMBF.
 * Si le `moov` est avant les données (`mdat`), les décalages des morceaux
 * (`stco` / `co64`) sont corrigés du nombre d'octets retirés devant.
 *
 * Puis vérification : plus aucune trace de C2PA, JUMBF ni XMP dans le
 * conteneur, sinon on s'arrête (mieux vaut un échec qu'une vidéo marquée).
 */

const A_RETIRER = new Set(["udta", "meta", "uuid", "jumb"]);
/** Boîtes dont on descend dans les enfants pour y retirer les mêmes boîtes. */
const CONTENEURS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf"]);

interface Boite {
  type: string;
  debut: number;
  taille: number;
  entete: number;
}

function lireBoites(o: Uint8Array, debut: number, fin: number): Boite[] {
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength);
  const boites: Boite[] = [];
  let p = debut;
  while (p + 8 <= fin) {
    let taille = v.getUint32(p);
    let entete = 8;
    if (taille === 1) {
      if (p + 16 > fin) throw new Error("MP4 illisible (taille 64 bits tronquée)");
      taille = Number(v.getBigUint64(p + 8));
      entete = 16;
    } else if (taille === 0) {
      taille = fin - p;
    }
    if (taille < entete || p + taille > fin) throw new Error("MP4 illisible (boîte hors du fichier)");
    const type = String.fromCharCode(o[p + 4], o[p + 5], o[p + 6], o[p + 7]);
    boites.push({ type, debut: p, taille, entete });
    p += taille;
  }
  return boites;
}

/** Reconstruit une boîte en retirant récursivement les boîtes indésirables ; rend les octets et ce qui a été retiré. */
function reconstruire(o: Uint8Array, b: Boite, retires: string[], chemin: string): Uint8Array {
  if (!CONTENEURS.has(b.type)) return o.subarray(b.debut, b.debut + b.taille);
  const enfants = lireBoites(o, b.debut + b.entete, b.debut + b.taille);
  const parties: Uint8Array[] = [];
  for (const e of enfants) {
    if (A_RETIRER.has(e.type)) {
      retires.push(`${chemin}/${e.type}`);
      continue;
    }
    parties.push(reconstruire(o, e, retires, `${chemin}/${e.type}`));
  }
  const corps = parties.reduce((s, x) => s + x.length, 0);
  // Une boîte reconstruite tient toujours en 32 bits (le moov est petit).
  const sortie = new Uint8Array(8 + corps);
  new DataView(sortie.buffer).setUint32(0, 8 + corps);
  sortie.set(o.subarray(b.debut + 4, b.debut + 8), 4);
  let p = 8;
  for (const x of parties) {
    sortie.set(x, p);
    p += x.length;
  }
  return sortie;
}

/** Décale de `delta` octets tous les décalages de morceaux (`stco` / `co64`) d'un `moov` reconstruit. */
function decalerMorceaux(moov: Uint8Array, delta: number): void {
  if (delta === 0) return;
  const v = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
  const parcourir = (debut: number, fin: number) => {
    for (const b of lireBoites(moov, debut, fin)) {
      if (CONTENEURS.has(b.type)) parcourir(b.debut + b.entete, b.debut + b.taille);
      if (b.type === "stco" || b.type === "co64") {
        const n = v.getUint32(b.debut + b.entete + 4);
        let p = b.debut + b.entete + 8;
        for (let i = 0; i < n; i++) {
          if (b.type === "stco") {
            v.setUint32(p, v.getUint32(p) - delta);
            p += 4;
          } else {
            v.setBigUint64(p, v.getBigUint64(p) - BigInt(delta));
            p += 8;
          }
        }
      }
    }
  };
  parcourir(8, moov.length);
}

const TRACES = ["c2pa", "jumb", "jumd", "contentcredentials", "<x:xmpmeta", "xmp:"];

/** Ce qui, dans le conteneur (hors données image et son), trahit encore C2PA, JUMBF ou XMP. */
export function tracesRestantes(o: Uint8Array): string[] {
  const boites = lireBoites(o, 0, o.length).filter((b) => b.type !== "mdat");
  const texte = boites.map((b) => new TextDecoder("latin1").decode(o.subarray(b.debut, b.debut + b.taille)).toLowerCase()).join(" ");
  return TRACES.filter((t) => texte.includes(t));
}

export interface RapportNettoyage {
  /** Les boîtes retirées, par chemin (« moov/udta », « uuid »…). */
  retires: string[];
  /** Plus aucune trace de C2PA / JUMBF / XMP dans le conteneur. */
  verifie: boolean;
  taille: number;
}

export function nettoyerMp4(o: Uint8Array): { bytes: Uint8Array; rapport: RapportNettoyage } {
  const haut = lireBoites(o, 0, o.length);
  if (!haut.some((b) => b.type === "moov") || !haut.some((b) => b.type === "mdat")) throw new Error("Ce n'est pas un MP4 (pas de moov / mdat)");
  const retires: string[] = [];
  const parties: Uint8Array[] = [];
  const premierMdat = haut.findIndex((b) => b.type === "mdat" || b.type === "moof");
  const dernierMdat = haut.length - 1 - [...haut].reverse().findIndex((b) => b.type === "mdat" || b.type === "moof");
  // Octets retirés devant les données : les décalages des morceaux reculent d'autant.
  let retiresAvantMdat = 0;
  let moovIndex = -1;
  for (const [i, b] of haut.entries()) {
    const avant = i < premierMdat;
    // Une boîte coincée entre deux blocs de données reste (la retirer décalerait une partie seulement).
    if (A_RETIRER.has(b.type) && (avant || i > dernierMdat)) {
      retires.push(b.type);
      if (avant) retiresAvantMdat += b.taille;
      continue;
    }
    if (b.type === "moov") {
      const nouveau = reconstruire(o, b, retires, "moov");
      if (avant) retiresAvantMdat += b.taille - nouveau.length;
      moovIndex = parties.length;
      parties.push(nouveau);
      continue;
    }
    parties.push(o.subarray(b.debut, b.debut + b.taille));
  }
  if (moovIndex >= 0 && retiresAvantMdat > 0) {
    const moov = new Uint8Array(parties[moovIndex]);
    decalerMorceaux(moov, retiresAvantMdat);
    parties[moovIndex] = moov;
  }
  const total = parties.reduce((s, x) => s + x.length, 0);
  const sortie = new Uint8Array(total);
  let p = 0;
  for (const x of parties) {
    sortie.set(x, p);
    p += x.length;
  }
  const restantes = tracesRestantes(sortie);
  if (restantes.length > 0) throw new Error(`Nettoyage incomplet : ${restantes.join(", ")} encore présents`);
  return { bytes: sortie, rapport: { retires, verifie: true, taille: total } };
}
