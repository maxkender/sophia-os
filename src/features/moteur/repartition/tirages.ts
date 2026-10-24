/**
 * « Si j'embauche vingt personnes en polonais, qu'est-ce qu'elles vont poster ? »
 *
 * Les deux classements (application puis label) répondent chacun pour UN
 * compte. Mis bout à bout ils ne disent pas la composition : un label peut
 * gagner le premier tirage et ne plus jamais revenir, un autre peut sortir
 * quatre fois. Ce module déroule donc la suite réelle, compte après compte, en
 * mettant à jour les comptes de chaque label à chaque fois — exactement ce que
 * fera le moteur, dont elle déroule le classement, `classerLabels` — et rend la
 * composition obtenue, en pourcentage.
 *
 * C'est une PROJECTION, pas une prédiction : elle suppose que le stock, la
 * performance et la cible ne bougent pas pendant les vingt embauches. En
 * pratique le stock se recharge et la performance dérive. Elle répond à « vers
 * quoi penche le système aujourd'hui », ce qui est la question qu'on se pose
 * en regardant une langue.
 */
import { estTirageSite, prochaineAppSite } from "./provenance";
import {
  applicationsEligibles,
  classerApplications,
  type ApplicationCandidate,
  type CibleApplications,
  type MarcheApplications,
} from "./scoreApplication";
import {
  classerLabels,
  classerPropose,
  REGLAGES_CHOIX_LABEL_DEFAUT,
  type ReglagesChoixLabel,
  type StatLabel,
} from "./scoreLabel";

/** Une ligne de composition : une paire application × label, et sa part. */
export interface Tirage {
  application_id: string;
  app: string;
  label_id: string;
  label_nom: string;
  /** Comptes obtenus sur les `n` tirages. */
  comptes: number;
  /** Parmi eux, ceux d'une recrue venue du site, que le moteur n'a pas placée. */
  comptesSite: number;
  /** Part des tirages, en pourcentage. */
  part: number;
}

/** Nombre de tirages projetés par défaut : deux semaines d'embauches. */
export const TIRAGES_DEFAUT = 20;

export interface OptionsTirages {
  /**
   * Part des prochaines recrues qui viennent du site, entre 0 et 1. Leur
   * application est déjà décidée quand le moteur les voit.
   */
  partSite?: number;
  /**
   * Où le site envoie ces recrues, tel que MESURÉ, pas tel que supposé :
   * `{ sophia: 1 }` aujourd'hui, autre chose le jour où il change d'avis.
   * Vide, il n'y a pas de tirage du site, quelle que soit la part.
   */
  siteParApp?: Readonly<Record<string, number>>;
  /**
   * Quel classement de label dérouler.
   *
   * `moteur` est le défaut, et c'est le seul qui dit la vérité : la carte
   * promet « exactement comme le fera le moteur », et le moteur appelle
   * `classerLabels` (`choisirLabel`, `_shared/choix_label_equilibre.ts`).
   * La projection a longtemps déroulé `classerPropose`, la règle d'une page
   * Notion du 18/10 que personne n'a branchée côté serveur : elle annonçait
   * donc une composition que la prod ne produit pas.
   *
   * `propose` reste joignable pour comparer les deux règles sur vingt
   * embauches, comme la carte « Les prochaines recrues » les compare sur une.
   */
  regle?: "moteur" | "propose";
}

function cle(applicationId: string, labelId: string): string {
  return `${applicationId}:${labelId}`;
}

/** Un candidat retenu pour un tirage, quelle que soit la façon dont il l'a été. */
interface Candidat {
  application_id: string;
  slug: string;
}

/**
 * La composition des `n` prochains comptes d'un marché, de la plus grosse part
 * à la plus petite.
 *
 * `statsParApp` donne, pour chaque application, les candidats du marché avec
 * leurs chiffres. Une application sans entrée (ou sans label ouvert) ne peut
 * rien recevoir : elle est sautée, et le tirage va à la suivante, sinon un
 * trou de données ferait disparaître des comptes de la projection.
 *
 * LES RECRUES DU SITE. Avec `options.partSite`, une partie des tirages
 * revient à des recrues dont le site a DÉJÀ choisi l'application. Deux
 * conséquences, et aucune n'est cosmétique :
 *
 *  - ces tirages-là ne passent pas par `classerApplications`, qui écarte une
 *    application à cible nulle. Le site envoie où il veut, y compris là où
 *    l'admin vise 0 % : c'est un fait, pas une préférence ;
 *  - leur compte est ajouté à l'application reçue comme n'importe quel autre.
 *    C'est ce qui fait que Sainte-Laguë se corrige seul, en envoyant d'autant
 *    moins de recrues placées par le moteur vers cette application. Ne pas
 *    l'ajouter rendrait la projection sourde au site, et lui passer en plus
 *    une cible déjà corrigée la corrigerait deux fois.
 */
export function simulerTirages(
  marche: MarcheApplications,
  statsParApp: Readonly<Record<string, StatLabel[]>>,
  cible: CibleApplications,
  applications: readonly ApplicationCandidate[],
  reglages: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
  n: number = TIRAGES_DEFAUT,
  options: OptionsTirages = {},
): Tirage[] {
  const comptesApp = new Map(marche.parts.map((p) => [p.slug, p.comptes]));
  const ajoutLabel = new Map<string, number>();
  const obtenus = new Map<string, Tirage>();
  const parApp = options.siteParApp ?? {};
  // Bornée ici et pas seulement chez l'appelant : un NaN qui passerait ferait
  // sortir de la boucle au premier tour et rendrait une projection vide. Sans
  // répartition mesurée, il n'y a rien à réserver au site.
  const part =
    Object.keys(parApp).length > 0
      ? Math.min(1, Math.max(0, Number(options.partSite) || 0))
      : 0;
  // Ce que le site a déjà attribué dans CETTE projection, pour que la suite
  // de ses tirages suive sa répartition réelle au lieu de tout donner au
  // premier slug.
  const attribuesSite: Record<string, number> = {};
  // Un genre de recrue qui n'a rien pu placer ne pourra plus rien placer :
  // ses tours suivants donneraient le même résultat. L'AUTRE genre, lui, peut
  // très bien continuer — d'où deux drapeaux et non un `break` global.
  const epuise = { site: false, recrutement: false };
  // Sans recrue du site, il n'y a jamais de tirage du site à épuiser : sans
  // ces deux drapeaux, le cas le plus courant tournerait à vide jusqu'à `n`
  // au lieu de s'arrêter comme avant.
  const peutSite = part > 0;
  const peutRecrutement = part < 1;

  // Le classement du moteur, sauf demande explicite de dérouler la proposition.
  const classer = options.regle === "propose" ? classerPropose : classerLabels;

  const avecAjouts = (applicationId: string, stats: StatLabel[]): StatLabel[] =>
    stats.map((s) => {
      const plus = ajoutLabel.get(cle(applicationId, s.label_id)) ?? 0;
      if (plus === 0) return s;
      return {
        ...s,
        comptes_pays: s.comptes_pays + plus,
        comptes_langue: s.comptes_langue + plus,
        comptes_total: s.comptes_total + plus,
      };
    });

  for (let i = 0; i < Math.max(0, n); i += 1) {
    if ((!peutSite || epuise.site) && (!peutRecrutement || epuise.recrutement)) break;

    const duSite = estTirageSite(i, part);
    const genre = duSite ? "site" : "recrutement";
    if (epuise[genre]) continue;

    const marcheCourant: MarcheApplications = {
      langue: marche.langue,
      pays: marche.pays,
      parts: [...comptesApp.entries()].map(([slug, comptes]) => ({
        application_id: applications.find((a) => a.slug === slug)?.id ?? "",
        slug,
        comptes,
      })),
    };

    // Une recrue du site va là où le site l'envoie, et ça ne dépend pas de la
    // cible. On garde les autres applications qu'il sert derrière, au cas où
    // la première n'ait aucun label ouvert. Une recrue placée par le moteur,
    // elle, descend le classement habituel.
    const voulu = duSite ? prochaineAppSite(attribuesSite, parApp) : null;
    const candidats: Candidat[] = duSite
      ? applicationsEligibles(marche.langue, applications)
          .filter((a) => (parApp[a.slug] ?? 0) > 0)
          .sort(
            (x, y) =>
              (y.slug === voulu ? 1 : 0) - (x.slug === voulu ? 1 : 0) ||
              (parApp[y.slug] ?? 0) - (parApp[x.slug] ?? 0) ||
              x.slug.localeCompare(y.slug),
          )
          .map((a) => ({ application_id: a.id, slug: a.slug }))
      : classerApplications(marcheCourant, cible, applications).map((a) => ({
          application_id: a.application_id,
          slug: a.slug,
        }));

    // On descend les candidats jusqu'à en trouver un qui a vraiment un label
    // à donner.
    let place = false;
    for (const app of candidats) {
      const stats = statsParApp[app.application_id];
      if (!stats || stats.length === 0) continue;
      const labels = classer(avecAjouts(app.application_id, stats), reglages, {
        applicationId: app.application_id,
      });
      if (labels.length === 0) continue;

      const gagnant = labels[0];
      const k = cle(app.application_id, gagnant.label_id);
      ajoutLabel.set(k, (ajoutLabel.get(k) ?? 0) + 1);
      comptesApp.set(app.slug, (comptesApp.get(app.slug) ?? 0) + 1);

      if (duSite) attribuesSite[app.slug] = (attribuesSite[app.slug] ?? 0) + 1;

      const deja = obtenus.get(k);
      if (deja) {
        deja.comptes += 1;
        if (duSite) deja.comptesSite += 1;
      } else {
        obtenus.set(k, {
          application_id: app.application_id,
          app: app.slug,
          label_id: gagnant.label_id,
          label_nom: gagnant.label_nom,
          comptes: 1,
          comptesSite: duSite ? 1 : 0,
          part: 0,
        });
      }
      place = true;
      break;
    }
    if (!place) epuise[genre] = true;
  }

  const total = [...obtenus.values()].reduce((a, t) => a + t.comptes, 0);
  return [...obtenus.values()]
    .map((t) => ({ ...t, part: total > 0 ? (100 * t.comptes) / total : 0 }))
    .sort(
      (a, b) =>
        b.comptes - a.comptes || a.app.localeCompare(b.app) || a.label_nom.localeCompare(b.label_nom),
    );
}
