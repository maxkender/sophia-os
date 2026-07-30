/**
 * Exécute `items` avec au plus `largeur` promesses en vol.
 * Préserve l'ordre des résultats.
 */
export async function mapPool<T, R>(
  items: T[],
  largeur: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const lim = Math.max(1, Math.min(largeur, items.length));
  const out = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: lim }, () => worker()));
  return out;
}
