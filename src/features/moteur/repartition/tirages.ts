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
import {
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
  /** Part des tirages, en pourcentage. */
  part: number;
}

/** Nombre de tirages projetés par défaut : deux semaines d'embauches. */
export const TIRAGES_DEFAUT = 20;

function cle(applicationId: string, labelId: string): string {
  return `${applicationId}:${labelId}`;
}

/**
 * La composition des `n` prochains comptes d'un marché, de la plus grosse part
 * à la plus petite.
 *
 * `statsParApp` donne, pour chaque application, les candidats du marché avec
 * leurs chiffres. Une application sans entrée (ou sans label ouvert) ne peut
 * rien recevoir : elle est sautée, et le tirage va à la suivante, sinon un
 * trou de données ferait disparaître des comptes de la projection.
 */
export function simulerTirages(
  marche: MarcheApplications,
  statsParApp: Readonly<Record<string, StatLabel[]>>,
  cible: CibleApplications,
  applications: readonly ApplicationCandidate[],
  reglages: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
  n: number = TIRAGES_DEFAUT,
): Tirage[] {
  const comptesApp = new Map(marche.parts.map((p) => [p.slug, p.comptes]));
  const ajoutLabel = new Map<string, number>();
  const obtenus = new Map<string, Tirage>();

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
    const marcheCourant: MarcheApplications = {
      langue: marche.langue,
      pays: marche.pays,
      parts: [...comptesApp.entries()].map(([slug, comptes]) => ({
        application_id: applications.find((a) => a.slug === slug)?.id ?? "",
        slug,
        comptes,
      })),
    };

    // On descend le classement des applications jusqu'à en trouver une qui a
    // vraiment un label à donner.
    let place = false;
    for (const app of classerApplications(marcheCourant, cible, applications)) {
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
      } else {
        obtenus.set(k, {
          application_id: app.application_id,
          app: app.slug,
          label_id: gagnant.label_id,
          label_nom: gagnant.label_nom,
          comptes: 1,
          part: 0,
        });
      }
      place = true;
      break;
    }
    // Aucune application ne peut rien donner : inutile d'insister, les tours
    // suivants donneraient le même résultat.
    if (!place) break;
  }

  const total = [...obtenus.values()].reduce((a, t) => a + t.comptes, 0);
  return [...obtenus.values()]
    .map((t) => ({ ...t, part: total > 0 ? (100 * t.comptes) / total : 0 }))
    .sort(
      (a, b) =>
        b.comptes - a.comptes || a.app.localeCompare(b.app) || a.label_nom.localeCompare(b.label_nom),
    );
}
