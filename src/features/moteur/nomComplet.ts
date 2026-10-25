/**
 * Un seul champ « Full name » pour un poster, rangé dans les deux colonnes
 * historiques de `profiles` : le premier mot dans `prenom`, le reste dans
 * `nom`. Même découpage que le serveur (`_shared/nom_complet.ts`).
 */
export function separerNomComplet(texte: string): { prenom: string; nom: string } {
  const mots = texte.trim().split(/\s+/).filter(Boolean);
  return { prenom: mots[0] ?? "", nom: mots.slice(1).join(" ") };
}

/** Le nom complet d'un profil, tel qu'on l'affiche et qu'on le modifie. */
export function nomCompletDe(p: { prenom: string | null; nom: string | null }): string {
  return [p.prenom, p.nom].filter(Boolean).join(" ");
}
