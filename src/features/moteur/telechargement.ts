/**
 * Récupération des visuels côté poster, pensée pour l'iPhone.
 *
 * Sur iOS, un ZIP atterrit dans Fichiers : il faut le décompresser, puis
 * déplacer chaque image vers Photos avant de pouvoir la poster. La feuille de
 * partage native, elle, propose « Enregistrer les images », qui les dépose
 * directement dans la pellicule. C'est la seule voie confortable sur mobile,
 * donc on la privilégie et le ZIP ne sert plus que de repli sur ordinateur.
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

export function peutPartager(fichiers: File[]): boolean {
  if (fichiers.length === 0) return false;
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

/** Repli ordinateur : téléchargement classique dans le dossier de l'utilisateur. */
export function telechargerFichier(fichier: File | Blob, nom: string): void {
  const href = URL.createObjectURL(fichier);
  const lien = document.createElement("a");
  lien.href = href;
  lien.download = nom;
  document.body.append(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(href);
}

export async function telechargerUrl(url: string, nom: string): Promise<void> {
  try {
    const fichier = await recupererFichier(url, nom);
    telechargerFichier(fichier, nom);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
