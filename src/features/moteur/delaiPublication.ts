/**
 * Délai minimum entre deux publications d'un même compte TikTok.
 *
 * Mesuré sur 5 212 posts mûrs, indice de vues normalisé par langue : deux
 * slideshows publiés à moins de 15 min d'écart tombent à 0,86 quand un
 * espacement de 4 à 12 h atteint 1,17, soit environ 27 % de vues perdues.
 *
 * La règle est appliquée par le trigger `posts_exiger_delai_entre_publications`
 * en base, PAS ici : `majPost` est un update PostgREST émis par le navigateur,
 * donc tout garde-fou React se contourne depuis la console. Ce module ne sert
 * qu'au confort — montrer le compte à rebours plutôt que laisser le créateur
 * se prendre un refus sans explication.
 */

/** Doit rester aligné sur `reglages.frequence.delai_min_entre_posts`. */
export const DELAI_PUBLICATION_MIN_DEFAUT = 25;

/**
 * Minutes restantes avant la prochaine publication autorisée sur ce compte.
 * 0 signifie « publication possible maintenant ».
 *
 * Arrondi au SUPÉRIEUR, comme le trigger : afficher « 0 min » alors que le
 * serveur refuse encore ferait passer le refus pour un bug.
 */
export function minutesAvantPublication(
  dernierePublication: string | Date | null | undefined,
  delaiMin: number = DELAI_PUBLICATION_MIN_DEFAUT,
  maintenant: Date = new Date(),
): number {
  if (!dernierePublication) return 0;
  if (!Number.isFinite(delaiMin) || delaiMin <= 0) return 0;

  const derniere = dernierePublication instanceof Date
    ? dernierePublication
    : new Date(dernierePublication);
  const ms = derniere.getTime();
  // Date invalide : on n'invente pas un blocage, le serveur tranchera.
  if (Number.isNaN(ms)) return 0;

  const restantMs = ms + delaiMin * 60_000 - maintenant.getTime();
  if (restantMs <= 0) return 0;
  return Math.ceil(restantMs / 60_000);
}

/**
 * Minutes restantes lues dans le refus du serveur.
 *
 * Le trigger préfixe son message par `DELAI_ENTRE_PUBLICATIONS:<minutes>`
 * précisément pour que l'interface puisse afficher un texte traduit plutôt que
 * l'erreur Postgres brute. Renvoie null si l'erreur vient d'ailleurs.
 *
 * Attention au type : Supabase rejette avec un `PostgrestError`, un objet nu
 * qui n'est PAS une instance d'Error. Un `erreur instanceof Error` laisserait
 * donc passer le cas le plus fréquent.
 */
export function minutesDepuisErreurPublication(erreur: unknown): number | null {
  const texte = messageDErreur(erreur);
  if (!texte) return null;
  const m = /DELAI_ENTRE_PUBLICATIONS:(\d+)/.exec(texte);
  if (!m) return null;
  const minutes = Number(m[1]);
  return Number.isFinite(minutes) ? minutes : null;
}

function messageDErreur(erreur: unknown): string {
  if (typeof erreur === "string") return erreur;
  if (erreur instanceof Error) return erreur.message;
  if (erreur && typeof erreur === "object") {
    const e = erreur as { message?: unknown };
    if (typeof e.message === "string") return e.message;
  }
  return "";
}
