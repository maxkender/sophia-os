/**
 * Réserve d'un label : combien de jours de passages il reste avant la panne
 * sèche, à demande constante.
 *
 * Le calcul vit dans la vue SQL `label_reserve` (migration 0254) : il croise
 * `contenu_labels` (3 369 lignes), `contenu_tier_etat` (3 375) et
 * `compte_labels`, ce qui dépasserait le plafond `max-rows` de PostgREST si le
 * front le faisait lui-même — et le front n'a pas le garde-fou de complétude de
 * `serviceClient`. Ici on ne fait que LIRE une ligne par label et la qualifier.
 *
 * `reserve_jours` est un PLANCHER, pas une prédiction : le stock se recharge à
 * chaque requalification et à chaque import. La question à laquelle il répond
 * est « faut-il sourcer maintenant ? ».
 */

export type NiveauReserve = "critique" | "tendu" | "confortable" | "inconnu";

/**
 * Sous 7 jours, il n'y a plus de marge : un lot d'import met plusieurs jours à
 * être scrapé, nettoyé, traduit et validé, donc décider de sourcer le jour où
 * la réserve tombe à 3 jours, c'est déjà trop tard. 14 jours laissent le temps
 * de voir venir sans courir.
 */
export const RESERVE_CRITIQUE_JOURS = 7;
export const RESERVE_TENDUE_JOURS = 14;

export function niveauReserve(jours: number | null | undefined): NiveauReserve {
  // `null` = aucun compte ne porte ce label. Ce n'est pas une réserve infinie,
  // c'est une absence de mesure : un label sans compte ne consomme rien, et
  // afficher « ∞ jours » ferait passer un label dormant pour un label sain.
  if (jours === null || jours === undefined || !Number.isFinite(jours)) return "inconnu";
  if (jours < RESERVE_CRITIQUE_JOURS) return "critique";
  if (jours < RESERVE_TENDUE_JOURS) return "tendu";
  return "confortable";
}

/** Classes Tailwind du badge, par niveau. */
export function classeReserve(niveau: NiveauReserve): string {
  switch (niveau) {
    case "critique":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "tendu":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400";
    case "confortable":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400";
    case "inconnu":
      return "bg-muted text-muted-foreground border-border";
  }
}

/**
 * Un jour et demi s'écrit « 1,5 j », pas « 1.5 j » ni « 2 j » : à ces
 * niveaux-là, la décimale est l'information (2 jours de réserve et 2,9 jours ne
 * déclenchent pas le même réflexe). Au-delà d'une semaine elle ne sert plus.
 */
export function formaterReserve(jours: number | null | undefined, locale: string): string | null {
  if (jours === null || jours === undefined || !Number.isFinite(jours)) return null;
  const decimales = jours < RESERVE_CRITIQUE_JOURS ? 1 : 0;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(jours);
}
