/**
 * Les labels 100 % podz, réunis pour la carte « Labels 100 % podz » de la page
 * Allocation : phase de test, comptes par langue livrée, et les langues qui
 * peuvent prendre le prochain compte (même règle que `enAvanceRemplissage`).
 */
import type { ApplicationCandidate } from "./scoreApplication";
import { enTestPod, type ReglagesChoixLabel, type StatLabel } from "./scoreLabel";

export interface LanguePod {
  langue: string;
  comptes: number;
  prochaine: boolean;
}

export interface LignePod {
  label_id: string;
  nom: string;
  apps: string[];
  comptesTotal: number;
  /** En test dans toutes ses applications. */
  enTest: boolean;
  /** Posts mesurés : le plus avancé de ses applications. */
  posts: number;
  langues: LanguePod[];
  nonLivrees: string[];
}

/** Une ligne par label 100 % podz, toutes applications réunies. */
export function lignesPodz(
  applications: ApplicationCandidate[],
  marchesParApp: Record<string, Array<{ langue: string; pays: string | null; stats: StatLabel[] }>>,
  reglages: ReglagesChoixLabel,
): LignePod[] {
  const parLabel = new Map<
    string,
    { ligne: LignePod; langues: Map<string, LanguePod>; nonLivrees: Set<string>; testParApp: boolean[] }
  >();
  for (const app of applications) {
    for (const m of marchesParApp[app.id] ?? []) {
      for (const s of m.stats) {
        if (!s.pod_seul) continue;
        let e = parLabel.get(s.label_id);
        if (!e) {
          e = {
            ligne: {
              label_id: s.label_id,
              nom: s.label_nom,
              apps: [],
              comptesTotal: s.comptes_total,
              enTest: true,
              posts: 0,
              langues: [],
              nonLivrees: [],
            },
            langues: new Map(),
            nonLivrees: new Set(),
            testParApp: [],
          };
          parLabel.set(s.label_id, e);
        }
        if (!e.ligne.apps.includes(app.slug)) {
          e.ligne.apps.push(app.slug);
          e.testParApp.push(enTestPod(s, reglages, app.id));
        }
        e.ligne.posts = Math.max(e.ligne.posts, s.passages);
        const lg = m.langue;
        if (s.livre_langue === false) {
          if (!e.langues.has(lg)) e.nonLivrees.add(lg);
          continue;
        }
        e.nonLivrees.delete(lg);
        const enAttente = s.niveau_pod !== null && s.niveau_pod !== undefined && s.comptes_langue > s.niveau_pod;
        const avant = e.langues.get(lg);
        e.langues.set(lg, {
          langue: lg,
          comptes: s.comptes_langue,
          // Prête dans au moins une application : le prochain compte peut y aller.
          prochaine: (avant?.prochaine ?? false) || !enAttente,
        });
      }
    }
  }
  return [...parLabel.values()]
    .map(({ ligne, langues, nonLivrees, testParApp }) => ({
      ...ligne,
      enTest: testParApp.every(Boolean),
      langues: [...langues.values()].sort((a, b) => a.comptes - b.comptes || a.langue.localeCompare(b.langue)),
      nonLivrees: [...nonLivrees].sort(),
    }))
    .sort((a, b) => Number(b.enTest) - Number(a.enTest) || a.nom.localeCompare(b.nom));
}
