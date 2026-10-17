/**
 * Choix du label d'un compte, quand la File des créateurs n'impose rien : à la
 * création (manage-users) et quand l'assignation de nuit retire un label fermé
 * à un compte (minuit-vnext, `fermeture_labels.ts`).
 *
 * Historique : « le moins présent dans la langue » (souvent le plus maigre),
 * puis 0275 : √(contenus validés) × performance lissée. Analyse du 15/10 : le
 * stock écrasait la performance (RH, meilleur label à 1,45, recevait 8,9 % des
 * nouveaux comptes, alpha_male à 0,90 en recevait 19,5 %), le stock comptait ce
 * qui avait été validé et pas ce qui reste à poster, rien ne pouvait fermer un
 * label, et la diversité ne regardait que la langue.
 *
 * Maintenant, sans aucun hasard :
 *   1. FERMETURE. Un label dont la médiane des vues (rapportées à leur langue,
 *      28 jours) reste sous `fermeturePerf` (0,75) de celle de la flotte, sur
 *      au moins `fermetureMinPosts` (150) posts, est fermé : plus aucun compte
 *      ne le reçoit, et l'assignation de nuit le retire aux comptes qui le
 *      portent. Une fermeture est mémorisée (`fermesAuto`) : un label fermé ne
 *      poste plus, ses chiffres s'éteignent, il ne doit pas se rouvrir tout
 *      seul. Réouverture = décision humaine (`labels_ouverts` dans le réglage).
 *   2. POIDS = facteur de performance ^ `perfExposant` (2) × capacité.
 *      Facteur : la performance du label face à la flotte, lissée vers 1 par
 *      `perfLissage` (30) posts fictifs, bornée à [×0,25 ; ×4]. Capacité : les
 *      jours de réserve qui resteraient au label avec un compte de plus
 *      (passages restants ÷ (demande + `postsParJourNouveau`)), rapportés à
 *      `reserveCibleJours` (14) et plafonnés à 1 : au-delà de deux semaines de
 *      stock, le stock ne compte plus, seule la performance départage.
 *   3. RÉSERVE. Un label à moins de `reserveMinJours` (7) jours avec ce compte
 *      en plus passe après les autres (il recevrait un compte qu'il nourrirait
 *      mal), rafales mises à part (voir 6) ; à moins d'un jour (`JOURS_A_SEC`),
 *      il passe après TOUS les autres : un compte sans contenu à poster perd
 *      ses créneaux.
 *   4. PARTS = poids ÷ somme, aucune au-dessus de `partMax` (1/2).
 *   5. DIVERSITÉ, dans la LANGUE et dans le PAYS du compte : retard = part ×
 *      (comptes + 1) − comptes de ce label, dans chacune des deux dimensions.
 *      Un label en retard dans les deux passe d'abord, puis en retard dans une
 *      seule : un pays déjà rempli d'un label (5 fois le même en Suisse) ne le
 *      reçoit plus tant que les autres n'ont pas rattrapé.
 *   6. PAS DE RAFALE : un label présent sur `rafaleRecents` (2) des 3 derniers
 *      comptes de la langue attend ; de même dans le pays, mais APRÈS la
 *      langue. Même label + même langue = le même contenu traduit à
 *      l'identique sur plusieurs comptes : c'est la répétition la plus chère.
 *      Ordre des écarts : à sec > rafale langue > rafale pays > réserve basse
 *      (une réserve sous 7 jours reste un signal souple : le label a encore de
 *      quoi poster, le sourcing est prévenu ; une rafale dans un pays se voit).
 *      Chaque règle ne joue que si elle ne frappe pas tous les candidats.
 *   7. Parmi les labels en retard, celui qui a servi le moins récemment (langue
 *      ou pays) passe d'abord ; puis le plus en retard (le plus petit des deux
 *      retards), puis la flotte, puis le poids, puis l'identifiant (stable).
 *
 * Module pur : les chiffres viennent de `stats_choix_label` (migration 0287),
 * les réglages de `reglages.choix_labels` (`lireReglagesChoixLabel`).
 */

import { ID_SOPHIA } from "./multi_app.ts";

export interface StatLabelCreation {
  label_id: string;
  /** Liens actifs compte ↔ label dans la langue du compte. */
  comptes_langue: number;
  /** Liens actifs compte ↔ label dans le pays du compte (0 si pays inconnu). */
  comptes_pays: number;
  /** Liens actifs compte ↔ label dans toute la flotte. */
  comptes_total: number;
  /** Passages encore à poster pour l'application (vue `label_application_reserve`). */
  passages_restants: number;
  /** Passages consommés par jour par les comptes du label, pour l'application. */
  demande_jour: number;
  /** Posts publiés sur 28 j (application du compte) avec des vues. */
  passages: number;
  /** Médiane des vues de ses posts, chacune rapportée à la médiane de sa langue. */
  perf_label: number | null;
  /** La même médiane sur tous les labels candidats (≈ 1). */
  perf_flotte: number | null;
  /** Combien des derniers comptes créés dans la langue portent ce label. */
  recents_langue: number;
  /** Récence dans la langue : 0 = absent ; plus c'est grand, plus il vient de servir. */
  recence_langue: number;
  /** Combien des derniers comptes créés dans le pays portent ce label. */
  recents_pays: number;
  /** Récence dans le pays, même échelle. */
  recence_pays: number;
}

/** Une fermeture mémorisée : clé `cleFermeture(application, label)`. */
export interface FermetureAuto {
  depuis: string;
  perf: number | null;
  posts: number;
  nom?: string | null;
}

export interface ReglagesChoixLabel {
  perfExposant: number;
  perfLissage: number;
  perfMin: number;
  perfMax: number;
  fermeturePerf: number;
  fermetureMinPosts: number;
  reserveMinJours: number;
  reserveCibleJours: number;
  postsParJourNouveau: number;
  partMax: number;
  rafaleRecents: number;
  /** Comptes réaffectés au plus par nuit (garde-fou d'un réglage mal posé). */
  relabelsMaxParNuit: number;
  /** Labels jamais fermés (réouverture manuelle), toutes applications. */
  ouverts: string[];
  /** Labels toujours fermés (fermeture manuelle), toutes applications. */
  fermes: string[];
  /** Fermetures décidées par la nuit, mémorisées. */
  fermesAuto: Record<string, FermetureAuto>;
}

export const REGLAGES_CHOIX_LABEL_DEFAUT: Readonly<ReglagesChoixLabel> = Object.freeze({
  perfExposant: 2,
  perfLissage: 30,
  perfMin: 0.25,
  perfMax: 4,
  fermeturePerf: 0.75,
  fermetureMinPosts: 150,
  reserveMinJours: 7,
  reserveCibleJours: 14,
  postsParJourNouveau: 2,
  partMax: 0.5,
  rafaleRecents: 2,
  relabelsMaxParNuit: 20,
  ouverts: [],
  fermes: [],
  fermesAuto: {},
});

/** Plancher de capacité : un label sans réserve garde un poids infime, jamais nul. */
export const CAPACITE_MIN = 0.05;
/** Sous un jour de réserve (avec le compte en plus), le label est à sec. */
export const JOURS_A_SEC = 1;
const EPS = 1e-9;

/** Clé de tri tolérante ET transitive : deux valeurs à moins de EPS près se valent. */
function cle(x: number): number {
  return Math.round(x / EPS);
}

function nombre(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nombreOuNull(v: unknown): number | null {
  return v === null || v === undefined ? null : nombre(v);
}

function positif(v: unknown, defaut: number): number {
  const n = Number(v);
  return v !== null && v !== undefined && Number.isFinite(n) && n > 0 ? n : defaut;
}

function listeIds(v: unknown): string[] {
  return Array.isArray(v) ? [...new Set(v.map((x) => String(x ?? "").trim()).filter(Boolean))] : [];
}

/** `reglages.choix_labels` (JSON, clés en snake_case) → réglages complets. */
export function lireReglagesChoixLabel(valeur: unknown): ReglagesChoixLabel {
  const v = (valeur && typeof valeur === "object" && !Array.isArray(valeur) ? valeur : {}) as Record<
    string,
    unknown
  >;
  const d = REGLAGES_CHOIX_LABEL_DEFAUT;
  const fermesAuto: Record<string, FermetureAuto> = {};
  const brut = v.fermes_auto;
  if (brut && typeof brut === "object" && !Array.isArray(brut)) {
    for (const [k, f] of Object.entries(brut as Record<string, unknown>)) {
      if (!k.includes(":") || !f || typeof f !== "object") continue;
      const o = f as Record<string, unknown>;
      fermesAuto[k] = {
        depuis: String(o.depuis ?? ""),
        perf: nombreOuNull(o.perf),
        posts: Math.max(0, nombre(o.posts)),
        nom: o.nom === undefined || o.nom === null ? null : String(o.nom),
      };
    }
  }
  return {
    perfExposant: positif(v.perf_exposant, d.perfExposant),
    perfLissage: Math.max(0, nombre(v.perf_lissage ?? d.perfLissage)),
    perfMin: positif(v.perf_min, d.perfMin),
    perfMax: positif(v.perf_max, d.perfMax),
    fermeturePerf: positif(v.fermeture_perf, d.fermeturePerf),
    fermetureMinPosts: positif(v.fermeture_min_posts, d.fermetureMinPosts),
    reserveMinJours: Math.max(0, nombre(v.reserve_min_jours ?? d.reserveMinJours)),
    reserveCibleJours: positif(v.reserve_cible_jours, d.reserveCibleJours),
    postsParJourNouveau: positif(v.posts_par_jour_nouveau, d.postsParJourNouveau),
    partMax: Math.min(1, positif(v.part_max, d.partMax)),
    rafaleRecents: positif(v.rafale_recents, d.rafaleRecents),
    relabelsMaxParNuit: Math.max(0, Math.round(nombre(v.relabels_max_par_nuit ?? d.relabelsMaxParNuit))),
    ouverts: listeIds(v.labels_ouverts),
    fermes: listeIds(v.labels_fermes),
    fermesAuto,
  };
}

/** Statistique brute (ligne RPC, nombres en texte compris) → valeurs propres. */
export function normaliserStatLabel(brut: Record<string, unknown>): StatLabelCreation {
  return {
    label_id: String(brut.label_id ?? ""),
    comptes_langue: Math.max(0, nombre(brut.comptes_langue)),
    comptes_pays: Math.max(0, nombre(brut.comptes_pays)),
    comptes_total: Math.max(0, nombre(brut.comptes_total)),
    passages_restants: Math.max(0, nombre(brut.passages_restants)),
    demande_jour: Math.max(0, nombre(brut.demande_jour)),
    passages: Math.max(0, nombre(brut.passages)),
    perf_label: nombreOuNull(brut.perf_label),
    perf_flotte: nombreOuNull(brut.perf_flotte),
    recents_langue: Math.max(0, nombre(brut.recents_langue)),
    recence_langue: Math.max(0, nombre(brut.recence_langue)),
    recents_pays: Math.max(0, nombre(brut.recents_pays)),
    recence_pays: Math.max(0, nombre(brut.recence_pays)),
  };
}

export function cleFermeture(applicationId: string, labelId: string): string {
  return `${applicationId}:${labelId}`;
}

/** Performance brute face à la flotte (1 = comme la flotte), `null` sans mesure. */
export function perfRelative(s: StatLabelCreation): number | null {
  const flotte = s.perf_flotte ?? 0;
  if (flotte <= 0 || s.perf_label === null || s.passages <= 0) return null;
  return s.perf_label / flotte;
}

/** Les chiffres d'aujourd'hui suffisent-ils à fermer ce label ? */
export function doitFermer(s: StatLabelCreation, r: ReglagesChoixLabel): boolean {
  const rel = perfRelative(s);
  return rel !== null && s.passages >= r.fermetureMinPosts && rel < r.fermeturePerf;
}

/**
 * Label fermé pour une application : ouverture forcée > fermeture forcée >
 * fermeture mémorisée > chiffres du jour (si fournis).
 */
export function estFerme(
  labelId: string,
  applicationId: string,
  r: ReglagesChoixLabel,
  s?: StatLabelCreation | null,
): boolean {
  if (r.ouverts.includes(labelId)) return false;
  if (r.fermes.includes(labelId)) return true;
  if (r.fermesAuto[cleFermeture(applicationId, labelId)]) return true;
  return s ? doitFermer(s, r) : false;
}

/** Labels fermés connus SANS chiffres (forcés + mémorisés) : pour filtrer la File. */
export function labelsFermesConnus(r: ReglagesChoixLabel, applicationId: string): Set<string> {
  const ids = new Set(r.fermes);
  const prefixe = `${applicationId}:`;
  for (const k of Object.keys(r.fermesAuto)) {
    if (k.startsWith(prefixe)) ids.add(k.slice(prefixe.length));
  }
  for (const id of r.ouverts) ids.delete(id);
  return ids;
}

/** Facteur de performance d'un label (1 = comme la flotte), lissé et borné. */
export function facteurPerformance(
  s: StatLabelCreation,
  r: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
): number {
  const flotte = s.perf_flotte ?? 0;
  if (flotte <= 0) return 1;
  const n = s.passages > 0 && s.perf_label !== null ? s.passages : 0;
  const perf = n > 0 ? (s.perf_label as number) : flotte;
  const lissee = (perf * n + flotte * r.perfLissage) / Math.max(n + r.perfLissage, 1);
  return Math.min(r.perfMax, Math.max(r.perfMin, lissee / flotte));
}

/** Jours de réserve qui resteraient au label avec un compte de plus. */
export function joursApresCompte(
  s: StatLabelCreation,
  r: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
): number {
  return s.passages_restants / (s.demande_jour + r.postsParJourNouveau);
}

export function capacite(
  s: StatLabelCreation,
  r: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
): number {
  return Math.min(1, Math.max(CAPACITE_MIN, joursApresCompte(s, r) / r.reserveCibleJours));
}

export function estSuspendu(
  s: StatLabelCreation,
  r: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
): boolean {
  return joursApresCompte(s, r) < r.reserveMinJours;
}

export function poidsLabel(
  s: StatLabelCreation,
  r: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
): number {
  return facteurPerformance(s, r) ** r.perfExposant * capacite(s, r);
}

/**
 * Parts proportionnelles aux poids, aucune au-dessus de `partMax` (ou de 1/n
 * s'il y a trop peu de labels) : l'excédent est redistribué aux autres au
 * prorata de leurs poids, jusqu'à ce que plus aucune ne dépasse.
 */
export function partsPlafonnees(poids: readonly number[], partMax = REGLAGES_CHOIX_LABEL_DEFAUT.partMax): number[] {
  const n = poids.length;
  if (n === 0) return [];
  const total = poids.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return poids.map(() => 1 / n);
  const plafond = Math.max(partMax, 1 / n);
  const parts = poids.map((p) => p / total);
  const plafonnes = new Set<number>();
  for (;;) {
    const libres = parts.map((_, i) => i).filter((i) => !plafonnes.has(i));
    const reste = 1 - plafonnes.size * plafond;
    const somme = libres.reduce((a, i) => a + poids[i], 0);
    for (const i of libres) parts[i] = somme > 0 ? (reste * poids[i]) / somme : reste / libres.length;
    const trop = libres.filter((i) => parts[i] > plafond + EPS);
    if (trop.length === 0) return parts;
    for (const i of trop) {
      plafonnes.add(i);
      parts[i] = plafond;
    }
  }
}

export interface LabelClasse {
  label_id: string;
  poids: number;
  part: number;
  retardLangue: number;
  retardPays: number;
  retardFlotte: number;
  /** Récence la plus forte des deux dimensions (0 = absent des derniers comptes). */
  recence: number;
  /** Déjà sur `rafaleRecents` des derniers comptes de la langue. */
  rafaleLangue: boolean;
  /** Déjà sur `rafaleRecents` des derniers comptes du pays. */
  rafalePays: boolean;
  /** Moins de `reserveMinJours` de réserve avec ce compte en plus. */
  suspendu: boolean;
  /** Moins de `JOURS_A_SEC` de réserve avec ce compte en plus. */
  aSec: boolean;
}

export interface OptionsClassement {
  /** Application des chiffres (fermetures mémorisées) ; Sophia par défaut. */
  applicationId?: string;
  /** Classer aussi les labels fermés (dernier recours : ne jamais bloquer une création). */
  ignorerFermeture?: boolean;
}

/** Les candidats ouverts, du meilleur au moins bon (le premier est le choix). */
export function classerLabels(
  stats: readonly StatLabelCreation[],
  r: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
  opts: OptionsClassement = {},
): LabelClasse[] {
  const app = opts.applicationId ?? ID_SOPHIA;
  const uniques = new Map<string, StatLabelCreation>();
  for (const s of stats) if (s.label_id && !uniques.has(s.label_id)) uniques.set(s.label_id, s);
  const liste = [...uniques.values()].filter(
    (s) => opts.ignorerFermeture || !estFerme(s.label_id, app, r, s),
  );
  if (liste.length === 0) return [];

  const poids = liste.map((s) => poidsLabel(s, r));
  const parts = partsPlafonnees(poids, r.partMax);
  const nLangue = liste.reduce((a, s) => a + s.comptes_langue, 0);
  const nPays = liste.reduce((a, s) => a + s.comptes_pays, 0);
  const nFlotte = liste.reduce((a, s) => a + s.comptes_total, 0);

  const classes = liste.map((s, i): LabelClasse => ({
    label_id: s.label_id,
    poids: poids[i],
    part: parts[i],
    retardLangue: parts[i] * (nLangue + 1) - s.comptes_langue,
    retardPays: parts[i] * (nPays + 1) - s.comptes_pays,
    retardFlotte: parts[i] * (nFlotte + 1) - s.comptes_total,
    recence: Math.max(s.recence_langue, s.recence_pays),
    rafaleLangue: s.recents_langue >= r.rafaleRecents,
    rafalePays: s.recents_pays >= r.rafaleRecents,
    suspendu: estSuspendu(s, r),
    aSec: joursApresCompte(s, r) < JOURS_A_SEC,
  }));
  // Un écart ne joue que s'il ne frappe pas tous les candidats.
  const regles: Array<(c: LabelClasse) => boolean> = [
    (c) => c.aSec,
    (c) => c.rafaleLangue,
    (c) => c.rafalePays,
    (c) => c.suspendu,
  ];
  const ecarts = regles.filter((f) => !classes.every(f));
  const niveau = (c: LabelClasse) => (cle(c.retardLangue) > 0 ? 1 : 0) + (cle(c.retardPays) > 0 ? 1 : 0);
  const retardMin = (c: LabelClasse) => Math.min(c.retardLangue, c.retardPays);

  return classes.sort((a, b) => {
    for (const ecarte of ecarts) {
      if (ecarte(a) !== ecarte(b)) return ecarte(a) ? 1 : -1;
    }
    if (niveau(a) !== niveau(b)) return niveau(b) - niveau(a);
    // La récence ne départage que des labels EN RETARD (dans les deux
    // dimensions) : entre labels déjà servis, le moins en avance d'abord, sinon
    // un petit label trop servi repasserait sans fin devant les gros.
    if (niveau(a) === 2 && a.recence !== b.recence) return a.recence - b.recence;
    if (cle(retardMin(a)) !== cle(retardMin(b))) return cle(retardMin(b)) - cle(retardMin(a));
    if (cle(a.retardLangue) !== cle(b.retardLangue)) return cle(b.retardLangue) - cle(a.retardLangue);
    if (cle(a.retardFlotte) !== cle(b.retardFlotte)) return cle(b.retardFlotte) - cle(a.retardFlotte);
    if (cle(a.poids) !== cle(b.poids)) return cle(b.poids) - cle(a.poids);
    return a.label_id < b.label_id ? -1 : a.label_id > b.label_id ? 1 : 0;
  });
}

/**
 * Le label à donner. Aucun label ouvert : création → on classe quand même les
 * fermés (une recrue ne reste jamais sans label) ; réaffectation de nuit →
 * `ignorerFermeture: false` par l'appelant, qui saute alors le compte.
 */
export function choisirLabel(
  stats: readonly StatLabelCreation[],
  r: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
  opts: OptionsClassement & { jamaisSansLabel?: boolean } = {},
): string | null {
  const ouverts = classerLabels(stats, r, opts);
  if (ouverts.length > 0) return ouverts[0].label_id;
  if (!opts.jamaisSansLabel) return null;
  return classerLabels(stats, r, { ...opts, ignorerFermeture: true })[0]?.label_id ?? null;
}
