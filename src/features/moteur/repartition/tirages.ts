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
import type { ReglagesFileLabels } from "../types";
import { avecTirage, fenetreVide, rafale } from "./fenetreRafale";
import { fileAUneEntree, tirerDeLaFile } from "./fileApplication";
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
  estFerme,
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

/**
 * Fenêtre anti-rafale. Le moteur passe `RECENTS_CHOIX_LABEL` = 3 à
 * `stats_choix_label` à la création, et `simulation_repartition` (0305) passe
 * la même chose : les chiffres d'entrée sont donc comparables tels quels.
 */
export const FENETRE_RECENTS = 3;

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
  /**
   * La File des créateurs (`reglages.file_labels_comptes`), telle qu'elle est
   * en base.
   *
   * ELLE PASSE AVANT TOUT, des deux côtés. À la création, `popLabelFile`
   * (manage-users) tire le label de la File de l'application avant de classer,
   * et `choisirApplicationPourCompte` descend son classement pour prendre le
   * premier candidat qui a une entrée utilisable : la File détourne donc
   * l'APPLICATION autant que le label. Sans elle, la projection annonçait la
   * mauvaise paire sur tout un marché.
   *
   * Absente, la projection se comporte comme si la File était vide.
   */
  file?: ReglagesFileLabels;
  /**
   * Taille de la fenêtre anti-rafale, celle passée à `stats_choix_label`.
   * `simulation_repartition` (0305) passe 3, comme le moteur à la création.
   */
  fenetreRecents?: number;
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
  // Indexé sur le LABEL SEUL, pas sur application:label. Le CTE `liens` de
  // `stats_choix_label` (0287) compte les liens compte ↔ label sans regarder
  // l'application : un label servi par deux applications voit sa présence
  // monter quelle que soit celle qui vient de le prendre. L'ancienne clé
  // laissait `beau_smart_girl` repartir à zéro en changeant d'application.
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

  // La File se VIDE au fil des tirages : une entrée sert un compte et
  // disparaît. La garder entière la ferait resservir vingt fois.
  let file: ReglagesFileLabels | null = options.file ?? null;
  let fenetre = fenetreVide(options.fenetreRecents ?? FENETRE_RECENTS);

  /** Les labels que la File a le droit de poser pour cette application. */
  const eligiblesFile = (applicationId: string): string[] =>
    (statsParApp[applicationId] ?? [])
      .map((s) => s.label_id)
      .filter((id) => !estFerme(id, applicationId, reglages));

  const avecAjouts = (stats: StatLabel[]): StatLabel[] =>
    stats.map((s) => {
      const plus = ajoutLabel.get(s.label_id) ?? 0;
      const r = rafale(fenetre, s.label_id, s.recents_langue, s.recence_langue);
      const rp = marche.pays
        ? rafale(fenetre, s.label_id, s.recents_pays, s.recence_pays)
        : { recents: 0, recence: 0 };
      return {
        ...s,
        comptes_pays: s.comptes_pays + plus,
        comptes_langue: s.comptes_langue + plus,
        comptes_total: s.comptes_total + plus,
        recents_langue: r.recents,
        recence_langue: r.recence,
        recents_pays: rp.recents,
        recence_pays: rp.recence,
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

    // L'APPLICATION. Une recrue du site va là où le site l'envoie, et ça ne
    // dépend pas de la cible. Une recrue placée par le moteur prend la tête du
    // classement — SAUF si une application plus bas a une entrée utilisable
    // dans sa File : le moteur descend son classement pour la trouver
    // (`choisirApplicationPourCompte`, manage-users). C'est ce qui permet
    // d'amorcer un label neuf sur une application qui n'aurait rien reçu.
    const voulu = duSite ? prochaineAppSite(attribuesSite, parApp) : null;
    let app: Candidat | null = null;
    if (duSite) {
      const servies = applicationsEligibles(marche.langue, applications).filter(
        (a) => (parApp[a.slug] ?? 0) > 0,
      );
      const choisie = servies.find((a) => a.slug === voulu) ?? servies[0];
      app = choisie ? { application_id: choisie.id, slug: choisie.slug } : null;
    } else {
      const classement = classerApplications(marcheCourant, cible, applications);
      const gagnant =
        (file
          ? classement.find((c) =>
              fileAUneEntree(file!, c.slug, marche.langue, eligiblesFile(c.application_id)),
            )
          : undefined) ?? classement[0];
      app = gagnant ? { application_id: gagnant.application_id, slug: gagnant.slug } : null;
    }

    // UNE SEULE APPLICATION, PAS DE REPLI. Le moteur fige son gagnant : si
    // elle n'a aucun label à donner, il répond NO_LABELS et la création
    // échoue. La projection descendait le classement, ce qui lui faisait
    // afficher des comptes sur une application qui n'en recevra jamais.
    if (!app) {
      epuise[genre] = true;
      continue;
    }

    // LE LABEL. La File de l'application d'abord — langue puis file générale —
    // et seulement ensuite le classement. L'entrée tirée est consommée, elle
    // ne servira pas deux fois. Vaut aussi pour une recrue du site : le site
    // choisit l'application, pas le label.
    let labelId: string | null = null;
    let labelNom: string | null = null;
    if (file) {
      const tire = tirerDeLaFile(file, app.slug, marche.langue, eligiblesFile(app.application_id));
      file = tire.file;
      labelId = tire.item?.label_id ?? null;
    }

    const stats = statsParApp[app.application_id];
    if (!labelId) {
      if (!stats || stats.length === 0) {
        epuise[genre] = true;
        continue;
      }
      const prets = avecAjouts(stats);
      const opts = { applicationId: app.application_id };
      // `jamaisSansLabel` : quand tous les labels de l'application sont
      // fermés, le moteur en redonne un quand même plutôt que de refuser le
      // compte. Sauter l'application, comme avant, faisait disparaître de la
      // projection une part qui sera bel et bien attribuée.
      const labels = classer(prets, reglages, opts);
      const gagnant = labels[0] ?? classer(prets, reglages, { ...opts, ignorerFermeture: true })[0];
      if (!gagnant) {
        epuise[genre] = true;
        continue;
      }
      labelId = gagnant.label_id;
      labelNom = gagnant.label_nom;
    }
    if (labelNom === null) {
      labelNom = (stats ?? []).find((x) => x.label_id === labelId)?.label_nom ?? labelId;
    }

    ajoutLabel.set(labelId, (ajoutLabel.get(labelId) ?? 0) + 1);
    fenetre = avecTirage(fenetre, labelId);
    comptesApp.set(app.slug, (comptesApp.get(app.slug) ?? 0) + 1);
    if (duSite) attribuesSite[app.slug] = (attribuesSite[app.slug] ?? 0) + 1;

    const k = cle(app.application_id, labelId);
    const deja = obtenus.get(k);
    if (deja) {
      deja.comptes += 1;
      if (duSite) deja.comptesSite += 1;
    } else {
      obtenus.set(k, {
        application_id: app.application_id,
        app: app.slug,
        label_id: labelId,
        label_nom: labelNom,
        comptes: 1,
        comptesSite: duSite ? 1 : 0,
        part: 0,
      });
    }
  }

  const total = [...obtenus.values()].reduce((a, t) => a + t.comptes, 0);
  return [...obtenus.values()]
    .map((t) => ({ ...t, part: total > 0 ? (100 * t.comptes) / total : 0 }))
    .sort(
      (a, b) =>
        b.comptes - a.comptes || a.app.localeCompare(b.app) || a.label_nom.localeCompare(b.label_nom),
    );
}
