/**
 * Les langues d'un podz en images finies (0781).
 *
 * Deux listes :
 *   - `pods.langues` : les langues OUVERTES (la décision : Adrien, Max, la
 *     soupape). Elle ne change que par `podz_langue()`.
 *   - `pods.langues_pretes` : ce que l'atelier SAIT produire (sa liste
 *     `LANGUES`, envoyée à chaque `npm run boite`).
 *
 * Avant 0781, l'atelier réécrivait `pods.langues` : une langue ouverte la nuit
 * par la soupape disparaissait le matin. Désormais sa déclaration ne fait
 * qu'AJOUTER : une langue qu'il sait faire depuis aujourd'hui s'ouvre (comme
 * avant, quand Adrien demande une langue au podz), aucune n'est jamais fermée.
 */

const bas = (l: string) => l.trim().toLowerCase();

/** Ce que la déclaration d'un atelier change. */
export interface EffetDeclaration {
  /** La nouvelle liste `langues_pretes`, ou `null` si elle ne change pas. */
  pretes: string[] | null;
  /** Les langues à ouvrir (`podz_langue`) : nouvelles dans l'atelier, pas encore ouvertes. */
  aOuvrir: string[];
  /** Première déclaration d'un podz sans liste : elle devient sa liste ouverte. */
  premiere: boolean;
}

/**
 * @param ouvertes `pods.langues`
 * @param pretes `pods.langues_pretes` (nul avant la première déclaration depuis 0781)
 * @param declarees la liste `LANGUES` de l'atelier
 */
export function effetDeclaration(
  ouvertes: readonly string[] | null,
  pretes: readonly string[] | null,
  declarees: readonly string[],
): EffetDeclaration {
  // Un podz sans liste qui se déclare : sa première liste (comme avant 0781).
  if (!ouvertes?.length) return { pretes: [...declarees], aOuvrir: [], premiere: true };
  // Sans `langues_pretes`, l'atelier savait faire ce qui est ouvert : rien de neuf à ouvrir pour ces langues-là.
  const connues = new Set((pretes ?? ouvertes).map(bas));
  const dejaOuvertes = new Set(ouvertes.map(bas));
  const aOuvrir = declarees.filter((l) => !connues.has(bas(l)) && !dejaOuvertes.has(bas(l)));
  const inchangee = pretes !== null && pretes.join(",") === declarees.join(",");
  return { pretes: inchangee ? null : [...declarees], aOuvrir, premiere: false };
}
