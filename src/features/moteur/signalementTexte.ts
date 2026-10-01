/**
 * Photo « propre » encore écrite, côté front. La fonction `signaler-texte`
 * l'exclut des pools et la remplace ; ici, ce qui en décide l'affichage.
 */
import type { PostSlide } from "./types";

/**
 * Publiable : nettoyée (`propre/`) ET pas signalée encore écrite. Un `brut/`
 * porte le texte d'origine, une photo signalée aussi : les deux sont montrés
 * avec un avertissement, jamais proposés à l'enregistrement.
 */
export function slideEstPropre(slide: Pick<PostSlide, "media_library">): boolean {
  const media = slide.media_library;
  return Boolean(media?.storage_path?.startsWith("propre/") && !media.texte_restant);
}

/** Clé i18n du message à montrer quand un signalement est refusé. */
export function cleErreurSignalement(message: string): string {
  if (message.includes("POST_PUBLIE")) return "posts.signalerPublie";
  if (message.includes("SANS_PHOTO")) return "posts.signalerSansPhoto";
  if (message.includes("INTERDIT") || message.includes("forbidden")) {
    return "posts.signalerInterdit";
  }
  return "posts.signalerErreur";
}
