// Le contrat affiché par Join (25/11) : le texte signé tel quel, et le résumé traduit pour l'affichage.

/** Le texte complet signé (version join-v4) : le résumé anglais puis le texte (texteContratComplet de _shared/join.ts). */
export function texteSigne(c: { resume: string[]; texte: string }): string {
  return `${c.resume.map((l) => `- ${l}`).join("\n")}\n\n${c.texte}`;
}

/** Les 6 lignes du résumé affiché, dans la langue du site (ctr.short.1 à 6 : traduction d'affichage du résumé signé). */
export const LIGNES_RESUME = [1, 2, 3, 4, 5, 6] as const;
