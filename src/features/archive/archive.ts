/**
 * L'Archive (0366) : posteurs désactivés et comptes dormants, hors des listes
 * actives. Elle se lit sur `is_active`, sans état à part :
 *   - un compte est en Archive s'il est inactif (dormant ou arrêté) ;
 *   - un posteur est en Archive s'il est désactivé, ou si tous ses comptes le
 *     sont. Un posteur sans aucun compte reste actif : il n'a pas commencé.
 */

export interface PosteurArchivable {
  id: string;
  is_active: boolean;
}

export interface CompteArchivable {
  id: string;
  poster_id: string;
  is_active?: boolean | null;
}

/** Une ligne de l'Archive : le posteur et ses comptes à réactiver. */
export interface EntreeArchive<P, C> {
  posteur: P;
  /** Posteur entier en Archive (désactivé, ou plus aucun compte actif). */
  posteurArchive: boolean;
  /** Posteur en Archive : tous ses comptes. Sinon : ses comptes dormants. */
  comptes: C[];
}

export function compteActif(c: CompteArchivable): boolean {
  return c.is_active !== false;
}

export function estPosteurArchive(p: PosteurArchivable, comptes: readonly CompteArchivable[]): boolean {
  if (!p.is_active) return true;
  return comptes.length > 0 && !comptes.some(compteActif);
}

/**
 * Sépare les posteurs actifs de l'Archive. `comptes` : TOUS les comptes,
 * dormants compris ; absent (pas encore chargés), seul le profil compte.
 */
export function repartirArchive<P extends PosteurArchivable, C extends CompteArchivable>(
  posteurs: readonly P[],
  comptes: readonly C[] | undefined,
): { actifs: P[]; archive: EntreeArchive<P, C>[] } {
  const parPosteur = new Map<string, C[]>();
  for (const c of comptes ?? []) {
    const liste = parPosteur.get(c.poster_id) ?? [];
    liste.push(c);
    parPosteur.set(c.poster_id, liste);
  }
  const actifs: P[] = [];
  const archive: EntreeArchive<P, C>[] = [];
  for (const p of posteurs) {
    const siens = parPosteur.get(p.id) ?? [];
    if (estPosteurArchive(p, siens)) {
      archive.push({ posteur: p, posteurArchive: true, comptes: siens });
      continue;
    }
    actifs.push(p);
    const dormants = siens.filter((c) => !compteActif(c));
    if (dormants.length > 0) archive.push({ posteur: p, posteurArchive: false, comptes: dormants });
  }
  return { actifs, archive };
}
