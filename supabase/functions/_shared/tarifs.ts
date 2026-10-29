/**
 * Prompt 21, partie S (0415) : chaque posteur est payé au tarif et au rythme
 * de SON contrat Upwork. Le tarif se déduit des milestones du contrat (lues
 * chaque dimanche soir et lundi avant la paie). Rien ici ne touche la base ni
 * le réseau.
 *
 * - « Week NN » (hebdomadaire) : le montant de la dernière, divisé par le
 *   nombre de comptes du nom (« (2 acc) ») ; une seule milestone, la 1re du
 *   contrat : c'est la 1re semaine, à +1 $ ;
 * - mensuel (« Month », « mois », « Monthly ») ou une période ≥ 3 semaines
 *   entre deux échéances : contrat Legacy, payé à la fin de sa période ;
 * - sinon (montants incohérents, rien en cours, tarif hors de 5 à 20 $ par
 *   compte) : à vérifier, exclu de la paie automatique.
 */
import { type JalonUpwork, semaineDuNom } from "./paiement.ts";
import { ETATS_FINANCES } from "./upwork.ts";

export type RythmeContrat = "hebdo" | "legacy" | "a_verifier";

export interface TarifContrat {
  rythme: RythmeContrat;
  /** Le montant d'une milestone (toutes les semaines, ou toute la période Legacy). */
  montant: number | null;
  /** Comptes payés par cette milestone (« (2 acc) » = 2). */
  comptes: number;
  /** Hebdo : le tarif d'UN compte par semaine. */
  tarif_compte: number | null;
  /** Legacy : la durée d'une période, en jours. */
  periode_jours: number | null;
  /** La milestone en cours (financée et pas payée), sinon la dernière. */
  courant: { id: string; nom: string; montant: number | null; etat: string; echeance: string | null } | null;
  raison: string;
}

export const TARIF_COMPTE_MIN = 5;
export const TARIF_COMPTE_MAX = 20;

const MENSUEL = /\b(month|months|monthly|mois|monat|mes|mese)\b|30[- ]?days?/i;
const PREMIERE = /\b(trial|first|1st|premi[eè]re|warm ?-?up)\b/i;

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** « Week 44 (2 acc) » → 2 ; « (4 acc) » → 4 ; sinon 1. */
export function comptesDuNom(nom: string): number {
  const m = nom.match(/\((\d+)\s*acc/i);
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= 9 ? n : 1;
}

function courantDe(jalons: JalonUpwork[]): JalonUpwork | null {
  const finances = jalons.filter((j) => ETATS_FINANCES.includes(j.etat));
  return finances[0] ?? jalons[jalons.length - 1] ?? null;
}

const vue = (j: JalonUpwork | null): TarifContrat["courant"] =>
  j ? { id: j.id, nom: j.nom, montant: j.depot, etat: j.etat, echeance: j.echeance ?? null } : null;

const aVerifier = (raison: string, courant: JalonUpwork | null): TarifContrat => ({
  rythme: "a_verifier", montant: null, comptes: 1, tarif_compte: null, periode_jours: null, courant: vue(courant), raison,
});

/** Le nombre de jours entre deux échéances successives (médiane), ou null. */
function periodeEcheances(jalons: JalonUpwork[]): number | null {
  const dates = jalons.map((j) => (j.echeance ? Date.parse(j.echeance) : NaN)).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  const ecarts: number[] = [];
  for (let i = 1; i < dates.length; i++) ecarts.push(Math.round((dates[i] - dates[i - 1]) / 86_400_000));
  const utiles = ecarts.filter((e) => e > 0).sort((a, b) => a - b);
  return utiles.length ? utiles[Math.floor(utiles.length / 2)] : null;
}

export function deduireTarif(jalonsBruts: JalonUpwork[]): TarifContrat {
  const jalons = [...jalonsBruts].sort((a, b) => a.sequence - b.sequence);
  if (jalons.length === 0) return aVerifier("aucune milestone lue", null);

  const semaines = jalons.filter((j) => semaineDuNom(j.nom) !== null);
  if (semaines.length > 0) {
    // La milestone hebdo en cours (financée), sinon la dernière.
    const enCours = semaines.filter((j) => ETATS_FINANCES.includes(j.etat));
    const j = enCours[enCours.length - 1] ?? semaines[semaines.length - 1];
    if (j.depot === null) return aVerifier(`${j.nom} : montant illisible`, j);
    const comptes = comptesDuNom(j.nom);
    let tarif = arrondi(j.depot / comptes);
    let raison = comptes > 1 ? `${j.nom} : ${j.depot} $ pour ${comptes} comptes` : `${j.nom} : ${j.depot} $`;
    // Une seule semaine, 1re milestone du contrat : la 1re semaine est à +1 $.
    if (semaines.length === 1 && jalons[0].id === j.id && (PREMIERE.test(j.nom) || jalons.length === 1)) {
      tarif = arrondi(tarif - 1);
      raison += " (1re semaine, +1 $ retiré)";
    } else if (semaines.length >= 2) {
      // La 1re semaine (+1 $) ne compte pas : comparée à la semaine d'après.
      const autres = semaines.filter((x) => x.id !== j.id && x.depot !== null).map((x) => arrondi(x.depot! / comptesDuNom(x.nom)));
      if (autres.length && !autres.some((t) => t === tarif || t === tarif + 1)) {
        raison += ` (les autres semaines valent ${[...new Set(autres)].join(", ")} $)`;
      }
    }
    if (tarif < TARIF_COMPTE_MIN || tarif > TARIF_COMPTE_MAX) {
      return aVerifier(`${raison} : ${tarif} $ par compte, hors de ${TARIF_COMPTE_MIN} à ${TARIF_COMPTE_MAX} $`, j);
    }
    return { rythme: "hebdo", montant: j.depot, comptes, tarif_compte: tarif, periode_jours: 7, courant: vue(j), raison };
  }

  // Pas de « Week NN ».
  if (jalons.length === 1) {
    const j = jalons[0];
    if (j.depot === null) return aVerifier(`${j.nom || "milestone"} : montant illisible`, j);
    if (j.depot <= TARIF_COMPTE_MAX + 1 && !MENSUEL.test(j.nom)) {
      const tarif = arrondi(j.depot - 1);
      if (tarif >= TARIF_COMPTE_MIN) {
        return {
          rythme: "hebdo", montant: tarif, comptes: 1, tarif_compte: tarif, periode_jours: 7, courant: vue(j),
          raison: `${j.nom || "milestone"} : ${j.depot} $, 1re semaine (+1 $ retiré)`,
        };
      }
    }
  }
  const courant = courantDe(jalons);
  if (!courant || !ETATS_FINANCES.includes(courant.etat)) return aVerifier("aucune milestone en cours, rythme inconnu", courant);
  if (courant.depot === null) return aVerifier(`${courant.nom} : montant illisible`, courant);
  const periode = periodeEcheances(jalons);
  if (MENSUEL.test(courant.nom) || (periode !== null && periode >= 20)) {
    // Mensuel : 30 jours ; sinon l'écart des échéances (3 semaines…).
    const jours = MENSUEL.test(courant.nom) ? 30 : periode!;
    return {
      rythme: "legacy", montant: courant.depot, comptes: 1, tarif_compte: null, periode_jours: jours, courant: vue(courant),
      raison: `${courant.nom} : ${courant.depot} $ tous les ${jours} jours (Legacy)`,
    };
  }
  return aVerifier(`${courant.nom} : ${courant.depot} $, rythme impossible à déduire`, courant);
}
