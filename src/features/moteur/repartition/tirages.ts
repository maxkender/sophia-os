/**
 * « Si j'embauche vingt personnes en polonais, qu'est-ce qu'elles vont poster ? »
 *
 * Les deux classements (application puis label) répondent chacun pour UN
 * compte. Mis bout à bout ils ne disent pas la composition : un label peut
 * gagner le premier tirage et ne plus jamais revenir, un autre peut sortir
 * quatre fois. Ce module déroule donc la suite réelle, compte après compte, en
 * mettant à jour la présence à chaque fois — exactement ce que fera le moteur
 * — et rend la composition obtenue, en pourcentage.
 *
 * C'est une PROJECTION, pas une prédiction : elle suppose que le stock, la
 * performance et la cible ne bougent pas pendant les vingt embauches. En
 * pratique le stock se recharge et la performance dérive. Elle répond à « vers
 * quoi penche le système aujourd'hui », ce qui est la question qu'on se pose
 * en regardant une langue.
 */
import { APPLICATION_COHORTE_RUUL, estTirageCohorte } from "./provenance";
import {
  applicationsEligibles,
  classerApplications,
  type ApplicationCandidate,
  type CibleApplications,
  type MarcheApplications,
} from "./scoreApplication";
import {
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
  /** Parmi eux, ceux d'une recrue de la cohorte Ruul, qui n'avait pas le choix. */
  comptesCohorte: number;
  /** Part des tirages, en pourcentage. */
  part: number;
}

/** Nombre de tirages projetés par défaut : deux semaines d'embauches. */
export const TIRAGES_DEFAUT = 20;

export interface OptionsTirages {
  /**
   * Part des prochaines recrues qui viennent de la cohorte Ruul, entre 0 et 1.
   * Ces recrues-là partent sur Sophia quoi qu'en dise la cible.
   */
  partCohorte?: number;
  /** L'application de la cohorte. Ne change que si la règle change. */
  applicationCohorte?: string;
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
 * LA COHORTE RUUL. Avec `options.partCohorte`, une partie des tirages est
 * réservée à des recrues venues du site, qui partent TOUJOURS sur Sophia.
 * Deux conséquences, et aucune n'est cosmétique :
 *
 *  - ces tirages-là ne passent pas par `classerApplications`, qui écarte une
 *    application à cible nulle. Une recrue Ruul va sur Sophia même si l'admin
 *    y vise 0 % : c'est une contrainte, pas une préférence ;
 *  - leur compte est ajouté à Sophia comme n'importe quel autre. C'est ce qui
 *    fait que Sainte-Laguë se corrige seul, en envoyant d'autant moins de
 *    recrues placées par le moteur vers Sophia. Ne pas l'ajouter rendrait la
 *    projection sourde à la cohorte, et lui passer en plus une cible déjà
 *    corrigée la corrigerait deux fois.
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
  // Bornée ici et pas seulement chez l'appelant : un NaN qui passerait ferait
  // sortir de la boucle au premier tour et rendrait une projection vide.
  const part = Math.min(1, Math.max(0, Number(options.partCohorte) || 0));
  const slugCohorte = options.applicationCohorte ?? APPLICATION_COHORTE_RUUL;
  // Un genre de recrue qui n'a rien pu placer ne pourra plus rien placer :
  // ses tours suivants donneraient le même résultat. L'AUTRE genre, lui, peut
  // très bien continuer — d'où deux drapeaux et non un `break` global.
  const epuise = { cohorte: false, recrutement: false };
  // Sans cohorte, il n'y aura jamais de tirage de cohorte à épuiser : sans
  // ces deux drapeaux, le cas le plus courant tournerait à vide jusqu'à `n`
  // au lieu de s'arrêter comme avant.
  const peutCohorte = part > 0;
  const peutRecrutement = part < 1;

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
    if ((!peutCohorte || epuise.cohorte) && (!peutRecrutement || epuise.recrutement)) break;

    const deLaCohorte = estTirageCohorte(i, part);
    const genre = deLaCohorte ? "cohorte" : "recrutement";
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

    // Une recrue de la cohorte n'a qu'un candidat, et il ne dépend pas de la
    // cible. Une recrue placée par le moteur descend le classement habituel.
    const candidats: Candidat[] = deLaCohorte
      ? applicationsEligibles(marche.langue, applications)
          .filter((a) => a.slug === slugCohorte)
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
      const labels = classerPropose(avecAjouts(app.application_id, stats), reglages, {
        applicationId: app.application_id,
      });
      if (labels.length === 0) continue;

      const gagnant = labels[0];
      const k = cle(app.application_id, gagnant.label_id);
      ajoutLabel.set(k, (ajoutLabel.get(k) ?? 0) + 1);
      comptesApp.set(app.slug, (comptesApp.get(app.slug) ?? 0) + 1);

      const deja = obtenus.get(k);
      if (deja) {
        deja.comptes += 1;
        if (deLaCohorte) deja.comptesCohorte += 1;
      } else {
        obtenus.set(k, {
          application_id: app.application_id,
          app: app.slug,
          label_id: gagnant.label_id,
          label_nom: gagnant.label_nom,
          comptes: 1,
          comptesCohorte: deLaCohorte ? 1 : 0,
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
