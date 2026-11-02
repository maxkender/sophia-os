/**
 * Un seul champ « Full name » pour un poster (demande de Lucia, 25/10), rangé
 * dans les deux colonnes historiques de `profiles` : le premier mot dans
 * `prenom`, le reste dans `nom`. Tous les écrans affichent déjà « prénom nom »,
 * donc rien à convertir pour les anciens posters. Même découpage côté front
 * (src/features/moteur/nomComplet.ts).
 */
export function separerNomComplet(texte: unknown): { prenom: string; nom: string } {
  const mots = String(texte ?? "").trim().split(/\s+/).filter(Boolean);
  return { prenom: mots[0] ?? "", nom: mots.slice(1).join(" ") };
}
