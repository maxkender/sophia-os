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
 * C'est aussi ce qui rend légitime la sortie de `lireTout` sur une page COURTE :
 * les deux paginateurs historiques du dépôt demandaient 1000 lignes pile, si
 * bien qu'un `max-rows` abaissé aurait rogné leur page et fait passer cette
 * page rognée pour la dernière — leur sortie `lot.length < PAGE` se serait
 * déclenchée dès la première page, en silence. En demandant strictement moins
 * que le plafond, on s'interdit ce cas : le serveur n'a rien à rogner, donc une
 * page courte ne peut venir que d'une table épuisée.
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
   *
   * L'ancre doit être CROISSANTE dans l'ordre de la page, donc la requête doit
   * porter le `.order(...)` correspondant. `lireTout` le vérifie ligne à ligne
   * plutôt que de le supposer : voir le garde-fou d'ordre dans la boucle.
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
 * DEUX OBLIGATIONS pour le callback, toutes deux vérifiées ici plutôt que
 * supposées, parce que les oublier reproduit exactement la panne qu'on répare :
 *
 * 1. il applique la taille reçue (`.limit(taille)`) — c'est ce qui donne son
 *    sens à la sortie sur page courte ci-dessous ;
 * 2. il trie sur l'ancre (`.order(...)`) — sans quoi la pagination keyset rend
 *    un sous-ensemble arbitraire, en silence.
 *
 * Sortie de boucle sur une page COURTE (`data.length < taille`), la page vide
 * n'étant plus que le cas dégénéré. C'est correct ICI et seulement ici : la
 * taille demandée est bornée à `TAILLE_PAGE`, strictement sous `max-rows`, donc
 * PostgREST n'a rien à rogner par-dessus notre propre limite et ne peut pas
 * rendre une page courte alors qu'il lui reste des lignes. La supposition
 * dangereuse — « le serveur rend tout ce qu'on lui demande » — est ainsi
 * remplacée par une garantie construite. Le coût évité n'est pas théorique :
 * sortir uniquement sur page vide DOUBLE le nombre d'allers-retours de tout
 * appel qui tient en une page (un label de 965 liens payait une seconde requête
 * pour confirmer la fin), et le mode de panne documenté du drain d'assignation
 * est le timeout à 280 s.
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

    // Garde-fou de TAILLE — l'obligation n°1 du contrat, tenue et pas supposée.
    //
    // Toute la légitimité de la sortie sur page courte tient à `.limit(taille)`
    // avec une taille strictement sous `max-rows` : c'est ce qui rend une page
    // courte concluante. Un callback qui ignore la taille reçue (limite codée en
    // dur, `.limit()` oublié) fait retomber la décision entre les mains du
    // plafond serveur, donc dans l'ambiguïté même qu'on est en train de retirer
    // du dépôt. Mieux vaut le dire au moment où c'est écrit qu'au moment où il
    // manquera des lignes.
    if (data.length > taille) {
      throw new Error(
        `${quoi} (page ${n}) : ${data.length} lignes rendues pour une page de ${taille}. ` +
          `Le callback n'applique pas la taille reçue — ajoute .limit(taille) — sinon la ` +
          `sortie sur page courte n'est plus concluante et la lecture peut s'arrêter en ` +
          `silence avant la fin.`,
      );
    }

    // Garde-fou d'ORDRE, avant toute autre décision.
    //
    // Le garde-fou d'avancement ci-dessous ne compare que la fin de la page n à
    // la fin de la page n-1 : il ne voit donc RIEN si l'appelant oublie son
    // `.order(ancre)`. La pagination rend alors un sous-ensemble arbitraire,
    // sans erreur et sans trou visible — c'est la panne du 20/08 déplacée d'un
    // cran, de la troncature muette vers la pagination muette. On vérifie donc
    // que la page reçue est bien croissante sur l'ancre : une comparaison de
    // chaînes par ligne, contre un oubli qui ne se voit autrement qu'en comptant
    // les lignes manquantes des semaines plus tard.
    //
    // On refuse la DÉCROISSANCE, pas l'égalité, et la nuance est volontaire :
    // deux ancres égales dans une page ne disent rien du tri, elles disent que
    // l'ancre n'est pas UNIQUE (le piège `contenu_id` sur `contenu_labels`).
    // Cette faute-là a déjà son garde-fou — l'avancement du curseur ci-dessous —
    // et surtout son message, qui nomme le bon coupable. Les confondre ferait
    // accuser un `.order(...)` manquant là où le tri est parfaitement correct.
    //
    // LIMITE connue, à garder en tête avant d'ancrer sur une colonne TEXTE : on
    // compare ici en JS (unités de code UTF-16) un ordre décidé par Postgres
    // (collation de la colonne). Pour un `uuid` — ce que sont TOUTES les ancres
    // du dépôt aujourd'hui — les deux coïncident : forme canonique hexadécimale
    // minuscule, même longueur, pur ASCII. Sur du texte en collation
    // linguistique, la ponctuation peut être pondérée autrement et les deux
    // ordres diverger sur une page pourtant correctement triée ; ce garde-fou
    // lèverait alors à tort, ce qui affamerait l'appelant au lieu de le
    // protéger. Ancrer sur du texte demande donc de vérifier ce point d'abord.
    const ancres = data.map((ligne) => opts.ancre(ligne));
    for (let i = 0; i < ancres.length; i += 1) {
      const valeur = ancres[i];
      if (typeof valeur !== "string" || valeur === "") {
        throw new Error(
          `${quoi} (page ${n}, ligne ${i + 1}) : ancre vide. Une pagination keyset sans ` +
            `ancre lisible ne peut pas garantir qu'elle avance — on refuse de continuer ` +
            `à l'aveugle.`,
        );
      }
      if (i > 0 && valeur < ancres[i - 1]) {
        throw new Error(
          `${quoi} (page ${n}) : la page n'est pas triée sur l'ancre — « ${ancres[i - 1]} » ` +
            `est suivie de « ${valeur} ». Il manque très probablement le .order(...) qui ` +
            `correspond à l'ancre (et son ascending: true). Sans ce tri, le curseur keyset ` +
            `repart d'une ligne quelconque : la lecture rend un sous-ensemble arbitraire ` +
            `sans lever la moindre erreur, ce qui est précisément la panne qu'on répare.`,
        );
      }
    }

    out.push(...data);

    const ancre = ancres[ancres.length - 1];
    if (ancre === ancrePrecedente) {
      throw new Error(
        `${quoi} (page ${n}) : le curseur n'avance pas, l'ancre « ${ancre} » revient deux ` +
          `fois de suite. L'ancre n'est probablement pas UNIQUE (sur contenu_labels, ` +
          `contenu_id ne l'est pas : l'ancre est le couple label_id+contenu_id), ou le ` +
          `filtre de page ne repart pas strictement APRÈS le curseur reçu.`,
      );
    }

    // Page courte = fin de la lecture. Voir l'en-tête : la taille demandée est
    // strictement sous `max-rows`, donc le serveur ne peut pas avoir rogné cette
    // page ; si elle est courte, c'est qu'il n'avait plus rien à donner.
    if (data.length < taille) return out;

    ancrePrecedente = ancre;
    curseur = data[data.length - 1];
  }
}
