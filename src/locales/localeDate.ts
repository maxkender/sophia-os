import i18next from "i18next";

/**
 * Locale des dates affichées : le jour avant le mois partout (demande d'Aram,
 * 22/10). En anglais, le format britannique (22/10/2026, « 22 Oct ») plutôt que
 * l'américain (10/22/2026, « Oct 22 ») ; le français l'est déjà.
 *
 * Seulement pour l'affichage : les clés de jour (« en-CA » → AAAA-MM-JJ) et les
 * nombres gardent leur locale. Sans argument, la langue de l'interface plutôt
 * que celle du téléphone.
 */
export function localeDate(langue: string | undefined = i18next.language): string {
  if (!langue) return "fr-FR";
  return langue.startsWith("en") ? "en-GB" : langue;
}
