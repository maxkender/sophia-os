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

/** iOS exige que `share()` parte du geste de l'utilisateur : les fichiers
 * doivent donc déjà être en mémoire au moment du tap, jamais téléchargés
 * pendant. D'où le préchargement dès l'ouverture du post. */
export async function recupererFichier(url: string, nom: string): Promise<File> {
  const reponse = await fetch(url);
  if (!reponse.ok) throw new Error(`Visuel indisponible (${reponse.status})`);
  const blob = await reponse.blob();
  return new File([blob], nom, { type: blob.type || "image/jpeg" });
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
