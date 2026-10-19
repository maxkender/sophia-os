/**
 * L'image d'origine montrée au créateur pour placer le texte (« Original
 * photo »). Certaines pointent vers un stockage Apify qui expire (404) : le
 * créateur voyait un carré vide et ne savait plus où poser le texte (Jasmin,
 * 16/10). Dans un même slideshow, la mise en page du texte est la même d'une
 * slide à l'autre : on montre alors l'original de la slide la plus proche qui
 * s'affiche, en le disant.
 */
export interface ReferenceAffichee {
  url: string;
  /** Position de la slide dont on emprunte l'original ; null = le sien. */
  autrePosition: number | null;
}

export function referenceAffichee(
  slides: ReadonlyArray<{ position: number; reference_url?: string | null }>,
  index: number,
  echouees: ReadonlySet<string>,
): ReferenceAffichee | null {
  const propre = slides[index]?.reference_url;
  // Une slide sans original n'en a jamais montré : rien ne change pour elle.
  if (!propre) return null;
  if (!echouees.has(propre)) return { url: propre, autrePosition: null };
  let meilleur: { url: string; position: number; distance: number } | null = null;
  slides.forEach((s, i) => {
    const url = s.reference_url;
    if (i === index || !url || url === propre || echouees.has(url)) return;
    const distance = Math.abs(i - index);
    if (!meilleur || distance < meilleur.distance) meilleur = { url, position: s.position, distance };
  });
  const choisi = meilleur as { url: string; position: number } | null;
  return choisi ? { url: choisi.url, autrePosition: choisi.position } : null;
}
