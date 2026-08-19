/** Un créateur (poster) peut posséder au plus 2 comptes TikTok distincts. */
export const MAX_COMPTES_PAR_POSTER = 2;

export function peutAjouterCompteTikTok(nbComptes: number): boolean {
  return Number.isFinite(nbComptes) && nbComptes >= 0 && nbComptes < MAX_COMPTES_PAR_POSTER;
}
