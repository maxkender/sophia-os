/** Copie Deno de `src/features/moteur/langues.ts` — garder synchro.
 *  `es-419` / `pt-BR` sont des variantes régionales : une langue à part
 *  entière pour le moteur, c'est `LANGUES` (gemini.ts) qui porte la région
 *  jusqu'au modèle. */
export const LANGUES_CIBLES = [
  "fr",
  "en",
  "de",
  "it",
  "es",
  "es-419",
  "pt",
  "pt-BR",
  "cs",
  "nl",
  "el",
  "hu",
  "pl",
  "ro",
  "sv",
  "tr",
  "da",
  "no",
  "ru",
  "hr",
  "sl",
  "sk",
  "sr",
  "ar",
  "he",
  "fi",
  "et",
  "bg",
] as const;

/**
 * Code canonique de `LANGUES_CIBLES` pour une saisie de casse quelconque :
 * `pt-br` → `pt-BR`. Les colonnes et les clés de File stockent le code
 * canonique (le trigger 0316 le garantit pour `comptes.langue`) ; un
 * `.toLowerCase()` produisait `pt-br`, absent de la liste et de toutes les
 * tables clées par langue. Code inconnu : minuscules, comme avant.
 * Copie de `canoniserLangue` (src/features/moteur/langues.ts).
 */
export function canoniserLangue(code: string | null | undefined): string {
  const bas = String(code ?? "").trim().toLowerCase();
  return LANGUES_CIBLES.find((c) => c.toLowerCase() === bas) ?? bas;
}
