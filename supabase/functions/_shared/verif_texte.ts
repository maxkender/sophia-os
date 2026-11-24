/**
 * 24/11 : le contrôle « reste-t-il du texte ? » après le retrait du texte, réactivé pour l'IMPORT seulement.
 *
 * Il était en pause depuis le 23/11 (`verifyClean`, coût : un appel vision après chaque nettoyage, plus un audit de
 * la bibliothèque en boucle sur le cron maintenance). Sans lui, une slide où Replicate laisse le titre ou les
 * paragraphes passait pour propre : sur @jawpotential (slides en mise en page, titres dorés, paragraphes sur fond
 * blanc), 14 slides gardées sur 40 avaient encore du texte.
 *
 * Ici : un seul appel, le modèle le moins cher d'abord (Flash-Lite), AVANT l'agrandissement (on ne paie pas SeedVR
 * sur une image sale). Pas d'audit en cron. Une réponse illisible ou une panne Gemini ne bloque rien : l'image est
 * acceptée, comme avant.
 */

/** Les modèles du contrôle, du moins cher au plus sûr. */
export const MODELES_VERIF_TEXTE = ["gemini-3.1-flash-lite", "gemini-3.5-flash"];

export const CONSIGNE_VERIF_TEXTE =
  `Cette image sort d'un nettoyage qui devait retirer tout le texte AJOUTÉ par-dessus la photo : titres, sous-titres, paragraphes, légendes, numéros, flèches de texte, stickers, pseudos, watermarks.
Reste-t-il du texte ajouté, lisible, même partiel (un mot, une ligne, un titre stylisé) ?
Ne compte PAS le texte qui fait partie de l'image elle-même : enseigne, étiquette ou logo sur un produit, écran, vêtement, livre, panneau, document, manuscrit, carte, tableau, inscription, règle graduée, pièce de monnaie.
Réponds UNIQUEMENT par un JSON, rien avant ni après :
{"texte": true, "extrait": "les mots qui restent"}
ou
{"texte": false, "extrait": ""}`;

/**
 * Avec l'image d'ORIGINE (import) : on ne demande plus « y a-t-il du texte ? » mais « la légende ajoutée est-elle
 * encore là ? ». Sans l'original, le contrôle comptait le texte de la scène : sur History (@lhistorien2852, 24/11),
 * le relevé imprimé du signal « Wow! », une règle graduée ou l'écriture d'un manuscrit faisaient écarter le slideshow.
 */
export const CONSIGNE_VERIF_TEXTE_COMPAREE =
  `Image 1 : une slide TikTok d'origine, avec du texte AJOUTÉ par-dessus l'image (légendes, titres, paragraphes, numéros, stickers, pseudos, watermarks).
Image 2 : la même slide après un nettoyage qui devait retirer ce texte ajouté, et lui seul.
Dans l'image 2, reste-t-il, même en partie (un mot, une ligne, un titre), du texte qui était AJOUTÉ par-dessus dans l'image 1 ? Compte aussi un texte nouveau qui n'existait pas dans l'image 1 et que le nettoyage aurait inventé.
Ne compte PAS le texte qui fait partie de l'image elle-même dans l'image 1 (document, manuscrit, carte, tableau, inscription, règle graduée, pièce, enseigne, étiquette, écran, vêtement, livre) : il doit rester.
Réponds UNIQUEMENT par un JSON, rien avant ni après :
{"texte": true, "extrait": "les mots ajoutés qui restent"}
ou
{"texte": false, "extrait": ""}`;

export interface VerdictTexte {
  /** Du texte ajouté reste sur l'image. */
  reste: boolean;
  /** Les mots lus, pour le journal. */
  extrait: string;
}

/** Lit la réponse du modèle. `null` : illisible (l'appelant accepte l'image). */
export function lireVerdictTexte(reponse: string): VerdictTexte | null {
  const bloc = reponse.match(/\{[\s\S]*\}/);
  if (!bloc) return null;
  try {
    const v = JSON.parse(bloc[0]) as { texte?: unknown; extrait?: unknown };
    if (typeof v.texte !== "boolean") return null;
    return { reste: v.texte, extrait: typeof v.extrait === "string" ? v.extrait.slice(0, 120) : "" };
  } catch {
    return null;
  }
}
