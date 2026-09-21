/**
 * Lecture par lots pour les filtres `in(...)`.
 *
 * Les ids partent dans l'URL PostgREST. Mesuré sur ce projet le 20/08 :
 * 640 uuid passent, 660 renvoient 400. Un label qui grossit finit donc
 * mécaniquement par casser la requête qui le lit — et comme les erreurs
 * n'étaient pas relues, un pool plein passait pour un pool vide et minuit
 * baissait le quota des créateurs. Plus il y avait de contenu, moins il y
 * avait de posts.
 */

/** Ids par requête. Large marge sous le seuil constaté (~650). */
export const LOT_IDS = 100;

/**
 * Au-delà, une seule requête `in(...)` risque le 400. Le garde-fou de
 * `serviceClient` lève à partir de cette taille — sous le seuil réel, pour
 * attraper le problème avant PostgREST, et bien au-dessus des listes
 * légitimement bornées (slides d'un post, comptes d'une langue…).
 */
export const IN_MAX_VALEURS = 400;

export interface ReponseLot<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export function decouperEnLots<T>(items: T[], taille: number): T[][] {
  const max = Math.max(1, Math.floor(taille));
  const lots: T[][] = [];
  for (let i = 0; i < items.length; i += max) lots.push(items.slice(i, i + max));
  return lots;
}

/**
 * `in(...)` découpé, avec l'erreur remontée.
 *
 * Remonter compte autant que découper : une lecture qui échoue ne doit jamais
 * être confondue avec un résultat vide, sinon on prend des décisions (baisser
 * un quota, déclarer un pool épuisé) sur la foi d'une requête ratée.
 */
export async function lireParLots<T>(
  ids: string[],
  quoi: string,
  requete: (lot: string[]) => PromiseLike<ReponseLot<T>>,
): Promise<T[]> {
  const out: T[] = [];
  for (const lot of decouperEnLots(ids, LOT_IDS)) {
    const { data, error } = await requete(lot);
    if (error) throw new Error(`${quoi} (${lot.length} id) : ${error.message}`);
    if (data) out.push(...data);
  }
  return out;
}

/* -------------------------------------------------------------------------
 * Lecture COMPLÈTE d'un résultat (et non plus découpage du filtre).
 *
 * `lireParLots` ci-dessus borne l'URL, jamais la RÉPONSE. C'est la moitié
 * manquante : un lot de 100 `label_id` se déplie en plusieurs milliers de
 * lignes `contenu_labels` (alpha_male seul : 965 liens, smart_girl : 951), et
 * PostgREST coupe alors à `max-rows` en répondant 200. Il n'y a rien à relire,
 * donc rien à remonter : le découpage protège de l'erreur 400 du 20/08, pas de
 * la troncature silencieuse.
 * ---------------------------------------------------------------------- */

/**
 * Plafond de lignes d'une réponse PostgREST (`max-rows`, 1000 sur Supabase).
 *
 * Mesuré en prod : `contenu_tier_etat` filtré `passages_prevus > 0` matche 2521
 * lignes, la réponse en rend 1000. ~1500 contenus n'étaient JAMAIS examinés par
 * la requalification ; sur 143 contenus requalifiables, 14 seulement tombaient
 * dans la fenêtre lue. La vue s'exécute en 17 ms : ce n'est pas un coût, c'est
 * un plafond.
 *
 * Pire que la perte : sa forme. Une troncature ne ressemble pas à une panne,
 * elle ressemble à un inventaire complet — l'appelant affiche « 1000 examinés »
 * et referme l'enquête. Et sous MVCC une ligne qu'on vient d'UPDATE part en fin
 * de tas : les contenus actifs migrent hors de la fenêtre lue, donc la famine
 * s'auto-entretient (9 des 31 contenus requalifiés hier en étaient déjà sortis).
 *
 * Constante partagée, et non déduite d'un en-tête : le garde-fou de
 * `serviceClient` ne voit que la réponse déjà traitée par postgrest-js, jamais
 * le `Content-Range` brut.
 */
export const PLAFOND_LIGNES = 1000;

/**
 * Taille d'une page de `lireTout`. Volontairement UN sous le plafond, et
 * dérivée de lui plutôt que recopiée : une page pleine ne touche donc jamais
 * `max-rows`, ce qui vaut deux garanties. PostgREST ne peut pas rogner
 * par-dessus notre propre borne, et le garde-fou de complétude de `supabase.ts`
 * reste muet sur nos pages — une lecture paginée déclare son intention par un
 * `.limit()` STRICTEMENT inférieur au plafond.
 *
 * Les deux paginateurs historiques du dépôt demandent 1000 lignes pile : si
 * `max-rows` était un jour abaissé, leur condition de sortie `lot.length < PAGE`
 * se déclencherait dès la première page et ils s'arrêteraient en silence. On ne
 * reproduit pas ce réglage.
 */
export const TAILLE_PAGE = PLAFOND_LIGNES - 1;

/**
 * Plafond de pages. Une lecture qui ne converge pas doit exploser, pas rendre
 * un résultat partiel : c'est la même règle que l'erreur remontée par
 * `lireParLots`. 500 pages ≈ 500 000 lignes, très au-dessus de tout ce que ce
 * dépôt lit légitimement.
 */
export const MAX_PAGES = 500;

export interface OptionsLireTout<T> {
  /**
   * Clé UNIQUE de la ligne sur L'ENSEMBLE du résultat, pas seulement dans sa
   * page. Sert à deux choses : détecter un curseur qui n'avance pas, et
   * documenter l'ancre au call site.
   *
   * Piège composite — c'est le cœur du bug qu'on répare : sur `contenu_labels`,
   * `contenu_id` n'est PAS unique (un contenu porte plusieurs labels). Une
   * pagination ancrée dessus saute toutes les lignes d'un contenu dès qu'on
   * reprend après lui, ou boucle si on reprend AVEC lui. L'ancre correcte est
   * le couple `(label_id, contenu_id)` — donc un filtre
   * `.or("label_id.gt.X,and(label_id.eq.X,contenu_id.gt.Y)")` —, ou bien une
   * boucle label par label avec `contenu_id` pour ancre à l'intérieur de chaque
   * label. Choisir la seconde forme quand elle est possible : elle est plus
   * lente d'un aller-retour et infiniment plus facile à relire.
   */
  ancre: (ligne: T) => string;
  /** Défaut `TAILLE_PAGE`. Toujours ramenée sous le plafond. */
  taillePage?: number;
  /** Défaut `MAX_PAGES`. */
  maxPages?: number;
}

/**
 * Lit TOUT un résultat, par pagination KEYSET.
 *
 * Keyset et non `offset`/`.range()`, et c'est la décision structurante : un
 * offset suppose un tas immobile. Sous MVCC une ligne mise à jour est réécrite
 * en fin de tas — exactement ce qu'on a mesuré, 9 des 31 contenus requalifiés
 * hier avaient quitté la fenêtre lue juste après leur UPDATE. Paginer par offset
 * sur un tas qui bouge répète et saute des lignes entre deux pages : c'est la
 * même famine, déguisée en correctif. Avec une ancre stable et croissante, la
 * page suivante repart de la dernière ligne VUE, pas d'un rang.
 *
 * La page est fournie par l'appelant — c'est lui qui connaît son ordre et son
 * ancre — sous la forme d'un callback qui reçoit le dernier curseur (`null` au
 * premier tour) et rend le même `ReponseLot<T>` que `lireParLots`. Même
 * contrat, même raison : une erreur est REMONTÉE, jamais confondue avec « plus
 * rien à lire ».
 *
 * Sortie de boucle sur une page VIDE, et non sur une page courte. Une page
 * courte n'est une fin que si l'on suppose que le serveur a rendu tout ce qu'on
 * lui demandait — supposition qui casse précisément quand `max-rows` rogne la
 * page, c'est-à-dire dans le cas qu'on répare. Un aller-retour de plus, et plus
 * aucune hypothèse sur le plafond du serveur.
 */
export async function lireTout<T>(
  quoi: string,
  page: (curseur: T | null, taille: number) => PromiseLike<ReponseLot<T>>,
  opts: OptionsLireTout<T>,
): Promise<T[]> {
  const taille = Math.max(1, Math.min(Math.floor(opts.taillePage ?? TAILLE_PAGE), TAILLE_PAGE));
  const maxPages = Math.max(1, Math.floor(opts.maxPages ?? MAX_PAGES));

  const out: T[] = [];
  let curseur: T | null = null;
  let ancrePrecedente: string | null = null;

  for (let n = 1; ; n += 1) {
    if (n > maxPages) {
      throw new Error(
        `${quoi} : ${maxPages} pages lues (${out.length} lignes) sans atteindre la fin, ` +
          `dernière ancre « ${ancrePrecedente} ». Soit la requête ne converge pas, soit ` +
          `elle n'a rien à faire ici — on lève plutôt que de rendre un résultat partiel.`,
      );
    }

    const { data, error } = await page(curseur, taille);

    if (error) {
      throw new Error(
        `${quoi} (page ${n}, après « ${ancrePrecedente ?? "le début"} », ` +
          `${out.length} lignes déjà lues) : ${error.message}`,
      );
    }

    if (!data || data.length === 0) return out;

    out.push(...data);

    const ancre = opts.ancre(data[data.length - 1]);
    if (typeof ancre !== "string" || ancre === "") {
      throw new Error(
        `${quoi} (page ${n}) : ancre vide. Une pagination keyset sans ancre lisible ` +
          `ne peut pas garantir qu'elle avance — on refuse de continuer à l'aveugle.`,
      );
    }
    if (ancre === ancrePrecedente) {
      throw new Error(
        `${quoi} (page ${n}) : le curseur n'avance pas, l'ancre « ${ancre} » revient deux ` +
          `fois de suite. L'ancre n'est probablement pas UNIQUE (sur contenu_labels, ` +
          `contenu_id ne l'est pas : l'ancre est le couple label_id+contenu_id), ou le ` +
          `filtre de page ne repart pas strictement APRÈS le curseur reçu.`,
      );
    }

    ancrePrecedente = ancre;
    curseur = data[data.length - 1];
  }
}
