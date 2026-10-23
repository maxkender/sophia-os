/**
 * Récupération des visuels côté poster, pensée pour l'iPhone.
 *
 * Sur iOS, un ZIP atterrit dans Fichiers : il faut le décompresser, puis
 * déplacer chaque image vers Photos avant de pouvoir la poster. La feuille de
 * partage native, elle, propose « Enregistrer les images », qui les dépose
 * directement dans la pellicule. C'est la seule voie confortable sur iPhone,
 * donc on l'y privilégie.
 *
 * Ailleurs, cette feuille n'a pas de cible « galerie » : sur Android le poster
 * finit sur « Importer dans Photos » (sauvegarde cloud, en échec dès que la
 * synchro est coupée) ou sur Drive ; sur ordinateur, Chrome et Edge ouvrent le
 * partage Windows au lieu de télécharger. Android reçoit donc un fichier par
 * image dans Téléchargements, que la galerie et TikTok voient directement, et
 * l'ordinateur un ZIP.
 */

export const MESSAGE_VISUEL_INCOMPLET =
  "This photo didn't fully download. Check your connection and try again.";

/** iOS exige que `share()` parte du geste de l'utilisateur : les fichiers
 * doivent donc déjà être en mémoire au moment du tap, jamais téléchargés
 * pendant. D'où le préchargement dès l'ouverture du post.
 *
 * Un transfert coupé (réseau faible) donnait un fichier tronqué, enregistré
 * tel quel : moitié grise dans la galerie (Ana Tavares, 21/10). On vérifie
 * donc qu'il est complet, on le reprend une fois sans le cache du navigateur,
 * et on refuse plutôt que d'enregistrer une image coupée. */
export async function recupererFichier(url: string, nom: string): Promise<File> {
  let blob = await telechargerBlob(url, "default");
  if (await estIncomplet(blob.donnees, blob.attendu)) {
    blob = await telechargerBlob(url, "reload");
    if (await estIncomplet(blob.donnees, blob.attendu)) throw new Error(MESSAGE_VISUEL_INCOMPLET);
  }
  return new File([blob.donnees], nom, { type: blob.donnees.type || "image/jpeg" });
}

async function telechargerBlob(
  url: string,
  cache: RequestCache,
): Promise<{ donnees: Blob; attendu: number | null }> {
  const reponse = await fetch(url, { cache });
  if (!reponse.ok) throw new Error(`Visuel indisponible (${reponse.status})`);
  const longueur = Number(reponse.headers.get("content-length"));
  return {
    donnees: await reponse.blob(),
    attendu: Number.isFinite(longueur) && longueur > 0 ? longueur : null,
  };
}

/**
 * Plus court que annoncé, ou image sans sa marque de fin (JPEG : FF D9 ;
 * PNG : bloc IEND). Seul le « plus court » compte : un corps décompressé peut
 * dépasser la longueur annoncée sans être abîmé. On cherche la marque dans
 * les derniers octets pour tolérer un peu de remplissage après elle.
 */
export async function estIncomplet(blob: Blob, attendu: number | null): Promise<boolean> {
  if (attendu != null && blob.size < attendu) return true;
  const fin = await lireOctets(blob.slice(Math.max(0, blob.size - 64)));
  const tete = await lireOctets(blob.slice(0, 8));
  if (tete[0] === 0xff && tete[1] === 0xd8) {
    for (let i = fin.length - 2; i >= 0; i--) if (fin[i] === 0xff && fin[i + 1] === 0xd9) return false;
    return true;
  }
  if (tete[0] === 0x89 && tete[1] === 0x50 && tete[2] === 0x4e && tete[3] === 0x47) {
    const texte = String.fromCharCode(...fin);
    return !texte.includes("IEND");
  }
  return false;
}

/** `FileReader` plutôt que `Blob.arrayBuffer()`, absent des vieux Safari. */
function lireOctets(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(new Uint8Array(lecteur.result as ArrayBuffer));
    lecteur.onerror = () => reject(lecteur.error);
    lecteur.readAsArrayBuffer(blob);
  });
}

export function estIos(
  ua: string = navigator.userAgent,
  pointsTactiles: number = navigator.maxTouchPoints ?? 0,
): boolean {
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ se déclare « Macintosh » : seul l'écran tactile le trahit.
  return /Macintosh/i.test(ua) && pointsTactiles > 1;
}

export function estAndroid(ua: string = navigator.userAgent): boolean {
  return /Android/i.test(ua);
}

export function peutPartager(fichiers: File[]): boolean {
  if (fichiers.length === 0 || !estIos()) return false;
  if (typeof navigator.canShare !== "function" || typeof navigator.share !== "function") {
    return false;
  }
  return navigator.canShare({ files: fichiers });
}

/**
 * Ouvre la feuille de partage. Renvoie `false` si l'utilisateur l'a fermée,
 * pour distinguer un abandon d'une vraie panne.
 */
export async function partagerFichiers(fichiers: File[], titre: string): Promise<boolean> {
  try {
    await navigator.share({ files: fichiers, title: titre });
    return true;
  } catch (erreur) {
    if (erreur instanceof DOMException && erreur.name === "AbortError") return false;
    throw erreur;
  }
}

/** Téléchargement classique dans le dossier de l'utilisateur. */
export function telechargerFichier(fichier: File | Blob, nom: string): void {
  const href = URL.createObjectURL(fichier);
  const lien = document.createElement("a");
  lien.href = href;
  lien.download = nom;
  document.body.append(lien);
  lien.click();
  lien.remove();
  // Révoquer dans la foulée du clic peut annuler le téléchargement avant que
  // le navigateur ait lu le blob : on laisse le temps de le récupérer.
  window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
}

/** Mobile hors iOS : un fichier par image, rien à décompresser. */
export async function telechargerChacun(fichiers: File[]): Promise<void> {
  for (const [index, fichier] of fichiers.entries()) {
    // Chrome écarte des téléchargements lancés à la chaîne : on les espace.
    if (index > 0) await new Promise((r) => window.setTimeout(r, 400));
    telechargerFichier(fichier, fichier.name);
  }
}

export async function telechargerUrl(url: string, nom: string): Promise<void> {
  try {
    const fichier = await recupererFichier(url, nom);
    telechargerFichier(fichier, nom);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
