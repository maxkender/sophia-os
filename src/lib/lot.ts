/** Nombre d'agents de nettoyage lancés en parallèle par défaut.
 *
 *  Chaque tâche = une invocation Edge Function indépendante (Fal / Replicate).
 *  5 en parallèle : bon débit sans saturer les queues externes. */
export const AGENTS_NETTOYAGE = 5;

/** Pool réimport photos slideshows valides — plus large que le nettoyage unitaire. */
export const AGENTS_REIMPORT_PHOTOS = 12;

/** Pool upscale Real-ESRGAN — modéré (Edge mémoire limitée). */
export const AGENTS_UPSCALE = 4;
/** SeedVR (Fal) : 1 seul worker — même en JPEG, l’Edge reste serrée. */
export const AGENTS_UPSCALE_SEEDVR = 1;

/**
 * Exécute `tache` sur chaque élément avec un pool borné de workers parallèles.
 * Un échec isolé ne stoppe pas le lot (on nettoie le maximum). `onProgres` est
 * appelé après CHAQUE élément terminé, pour une barre de progression fluide.
 */
export async function executerEnLot<T>(
  items: T[],
  tache: (item: T) => Promise<unknown>,
  options: { largeur?: number; onProgres?: (fait: number, total: number) => void } = {},
): Promise<void> {
  const total = items.length;
  if (total === 0) return;
  const largeur = Math.min(options.largeur ?? AGENTS_NETTOYAGE, total);

  let index = 0;
  let fait = 0;
  async function travailleur() {
    while (index < total) {
      const item = items[index++];
      try {
        await tache(item);
      } catch {
        // un échec isolé ne stoppe pas le lot
      }
      fait += 1;
      options.onProgres?.(fait, total);
    }
  }
  await Promise.all(Array.from({ length: largeur }, travailleur));
}
