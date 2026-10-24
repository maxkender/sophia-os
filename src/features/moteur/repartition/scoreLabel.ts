/**
 * Miroir front du choix de label à la création.
 *
 * Source de vérité : `supabase/functions/_shared/choix_label_equilibre.ts`.
 * Ce fichier en est la copie navigateur, à garder synchro — `scoreLabel.test.ts`
 * compare le bloc de réglages par défaut des deux fichiers et échoue s'ils
 * divergent. Sans ce miroir, la page Répartition afficherait un classement qui
 * n'est pas celui du moteur, ce qui est pire que de ne rien afficher.
 *
 * Le module est PUR : aucune lecture réseau, aucun état. Les chiffres viennent
 * de la fonction `simulation_repartition` (migration 0305), qui rend exactement
 * les entrées que `stats_choix_label` donne au moteur.
 *
 * Deux classements vivent ici, et c'est volontaire :
 *   - `classerLabels` : CE QUE FAIT LE MOTEUR aujourd'hui (port à l'identique) ;
 *   - `classerPropose` : CE QUE FERAIT la règle proposée (un seul score).
 * La page montre les deux côte à côte. Tant que la proposition n'est pas
 * tranchée, elle ne doit rien changer : ce fichier ne décide rien, il décrit.
 */

/** Une ligne de `simulation_repartition` : un label sur un marché. */
export interface StatLabel {
  label_id: string;
  label_nom: string;
  /** Liens actifs compte ↔ label dans la langue du compte. */
  comptes_langue: number;
  /** Liens actifs compte ↔ label dans le pays du compte (0 si pays inconnu). */
  comptes_pays: number;
  /** Liens actifs compte ↔ label dans toute la flotte. */
  comptes_total: number;
  /** Passages encore à poster pour l'application. */
  passages_restants: number;
  /** Passages consommés par jour par les comptes du label. */
  demande_jour: number;
  /** Posts publiés sur 28 j avec des vues. */
  passages: number;
  /** Médiane des vues, rapportée à la médiane de sa langue. */
  perf_label: number | null;
  /** La même médiane sur tous les labels candidats (≈ 1). */
  perf_flotte: number | null;
  recents_langue: number;
  recence_langue: number;
  recents_pays: number;
  recence_pays: number;
  /**
   * Label 100 % pod (0352) : tous ses contenus validés sont livrés par un pod.
   * Son stock suit les comptes (le pod produit pour eux) : la réserve ne le
   * juge pas, il se remplit langue par langue.
   */
  pod_seul?: boolean;
  /** Le pod sert la langue du compte (vrai sans langue). */
  livre_langue?: boolean;
  /**
   * Comptes du label dans sa langue la moins remplie, parmi les AUTRES langues
   * servies où l'application recrute ; `null` s'il n'y en a aucune.
   */
  niveau_pod?: number | null;
  /**
   * Comptes du label qui servent l'application affichée (page seulement : le
   * moteur compte toutes les applications, `comptes_total`).
   */
  comptes_app?: number;
}

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
  /** Label 100 % pod en test : comptes au plus, toutes langues confondues (0353). */
  testPodComptes: number;
  /** Posts mesurés qu'il lui faut pour sortir du test (à `fermeturePerf` au moins). */
  testPodPosts: number;
  /** Labels jamais fermés (réouverture manuelle), toutes applications. */
  ouverts: string[];
  /** Labels toujours fermés (fermeture manuelle), toutes applications. */
  fermes: string[];
  /**
   * Fermeture et réouverture manuelles POUR UNE APPLICATION, clés
   * `application:label`. `fermes` et `ouverts` sont globaux : fermer
   * `white_bg` le fermait partout, y compris là où il marche. Ces deux
   * listes-ci permettent de le fermer sur Unswipe en le gardant sur Sophia.
   * Elles gagnent sur les listes globales : le plus précis l'emporte.
   */
  fermesApp: string[];
  ouvertsApp: string[];
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
  testPodComptes: 3,
  testPodPosts: 30,
  ouverts: [],
  fermes: [],
  fermesApp: [],
  ouvertsApp: [],
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

/** `reglages.choix_labels` → valeurs propres. Mêmes clés snake_case que le moteur. */
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
    testPodComptes: Math.max(1, Math.round(positif(v.test_pod_comptes, d.testPodComptes))),
    testPodPosts: Math.max(1, Math.round(positif(v.test_pod_posts, d.testPodPosts))),
    ouverts: listeIds(v.labels_ouverts),
    fermes: listeIds(v.labels_fermes),
    fermesApp: listeIds(v.labels_fermes_app),
    ouvertsApp: listeIds(v.labels_ouverts_app),
    fermesAuto,
  };
}

export function cleFermeture(applicationId: string, labelId: string): string {
  return `${applicationId}:${labelId}`;
}

/** Performance brute face à la flotte (1 = comme la flotte), `null` sans mesure. */
export function perfRelative(s: StatLabel): number | null {
  const flotte = s.perf_flotte ?? 0;
  if (flotte <= 0 || s.perf_label === null || s.passages <= 0) return null;
  return s.perf_label / flotte;
}

/** Les chiffres d'aujourd'hui suffisent-ils à fermer ce label ? */
export function doitFermer(s: StatLabel, r: ReglagesChoixLabel): boolean {
  const rel = perfRelative(s);
  return rel !== null && s.passages >= r.fermetureMinPosts && rel < r.fermeturePerf;
}

/** Pourquoi un label est fermé, ou `null` s'il est ouvert. */
export type MotifFermeture = "manuelle" | "manuelle_app" | "auto" | "chiffres";

export function motifFermeture(
  labelId: string,
  applicationId: string,
  r: ReglagesChoixLabel,
  s?: StatLabel | null,
): MotifFermeture | null {
  // MÊME ÉCHELLE que `estFerme` côté moteur, du plus précis au moins précis.
  // Un test compare les deux fonctions sur tous les cas : elles ne peuvent
  // pas diverger sans le dire.
  const k = cleFermeture(applicationId, labelId);
  if (r.ouvertsApp.includes(k)) return null;
  if (r.fermesApp.includes(k)) return "manuelle_app";
  if (r.ouverts.includes(labelId)) return null;
  if (r.fermes.includes(labelId)) return "manuelle";
  if (r.fermesAuto[k]) return "auto";
  return s && doitFermer(s, r) ? "chiffres" : null;
}

export function estFerme(
  labelId: string,
  applicationId: string,
  r: ReglagesChoixLabel,
  s?: StatLabel | null,
): boolean {
  const k = cleFermeture(applicationId, labelId);
  // Du plus précis au moins précis : une décision prise POUR une application
  // l'emporte sur la même décision prise pour toutes.
  if (r.ouvertsApp.includes(k)) return false;
  if (r.fermesApp.includes(k)) return true;
  if (r.ouverts.includes(labelId)) return false;
  if (r.fermes.includes(labelId)) return true;
  if (r.fermesAuto[k]) return true;
  return s ? doitFermer(s, r) : false;
}

/** Facteur de performance d'un label (1 = comme la flotte), lissé et borné. */
export function facteurPerformance(
  s: StatLabel,
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
  s: StatLabel,
  r: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
): number {
  return s.passages_restants / (s.demande_jour + r.postsParJourNouveau);
}

/** Label 100 % pod (0352) : la réserve ne le juge pas, il se remplit langue par langue. */
export function estPodSeul(s: StatLabel): boolean {
  return s.pod_seul === true;
}

/**
 * Label 100 % pod déjà plus présent dans cette langue que dans sa langue la
 * moins remplie : il attend que les autres rattrapent (1 compte par langue,
 * puis 2…). Un post livré sert toutes les langues : la charge du pod suit les
 * comptes PAR LANGUE, remplir en largeur la garde égale.
 */
export function enAvanceRemplissage(s: StatLabel): boolean {
  return estPodSeul(s) && s.niveau_pod !== null && s.niveau_pod !== undefined && s.comptes_langue > s.niveau_pod;
}

/**
 * Label 100 % pod encore EN TEST (0353) : il n'a pas `testPodPosts` posts
 * mesurés, ou sa performance reste sous `fermeturePerf`. Un label tenu
 * « Ouvert » à la main (pour l'application ou partout) sort du test.
 *
 * Au-delà de `testPodComptes` comptes (toutes applications), le test est
 * passé une fois pour toutes : il n'a pu en avoir plus qu'en sortant du test
 * (ou par la File, une décision humaine). Le nombre de comptes sert de
 * mémoire : sans lui, un label validé replongerait « en test », donc bloqué,
 * dès que ses posts sur 28 jours faiblissent ; et un label servi par deux
 * applications, validé sur l'une, resterait bloqué sur l'autre où il n'a
 * aucun post à mesurer.
 */
export function enTestPod(s: StatLabel, r: ReglagesChoixLabel, applicationId: string): boolean {
  if (!estPodSeul(s)) return false;
  if (s.comptes_total > r.testPodComptes) return false;
  if (r.ouvertsApp.includes(cleFermeture(applicationId, s.label_id)) || r.ouverts.includes(s.label_id)) return false;
  const rel = perfRelative(s);
  return !(s.passages >= r.testPodPosts && rel !== null && rel >= r.fermeturePerf);
}

/**
 * Label en test qui a déjà ses `testPodComptes` comptes : il n'en reçoit pas
 * d'autre tant que le test n'est pas fini. Ce n'est PAS une fermeture : la nuit
 * ne le retire à personne, il attend ses chiffres.
 */
export function testPodPlein(s: StatLabel, r: ReglagesChoixLabel, applicationId: string): boolean {
  return enTestPod(s, r, applicationId) && s.comptes_total >= r.testPodComptes;
}

/** Stock compté dans le poids ; un label 100 % pod n'est pas jugé sur son stock. */
export function capacite(
  s: StatLabel,
  r: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
): number {
  if (estPodSeul(s)) return 1;
  return Math.min(1, Math.max(CAPACITE_MIN, joursApresCompte(s, r) / r.reserveCibleJours));
}

/** Passe après les autres : réserve basse, ou, pour un label 100 % pod, en avance de remplissage. */
export function estSuspendu(
  s: StatLabel,
  r: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
): boolean {
  if (estPodSeul(s)) return enAvanceRemplissage(s);
  return joursApresCompte(s, r) < r.reserveMinJours;
}

/** Passe après TOUS : à sec, ou, pour un label 100 % pod, langue que son pod ne sert pas (compte muet). */
export function estASec(
  s: StatLabel,
  r: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
): boolean {
  if (estPodSeul(s)) return s.livre_langue === false;
  return joursApresCompte(s, r) < JOURS_A_SEC;
}

export function poidsLabel(
  s: StatLabel,
  r: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
): number {
  return facteurPerformance(s, r) ** r.perfExposant * capacite(s, r);
}

/** Parts proportionnelles aux poids, aucune au-dessus de `partMax`. */
export function partsPlafonnees(
  poids: readonly number[],
  partMax = REGLAGES_CHOIX_LABEL_DEFAUT.partMax,
): number[] {
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
    for (const i of libres) {
      parts[i] = somme > 0 ? (reste * poids[i]) / somme : reste / libres.length;
    }
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
  label_nom: string;
  poids: number;
  part: number;
  retardLangue: number;
  retardPays: number;
  retardFlotte: number;
  recence: number;
  rafaleLangue: boolean;
  rafalePays: boolean;
  suspendu: boolean;
  aSec: boolean;
  /** Jours de contenu restants avec ce compte en plus. */
  jours: number;
  /** Performance face à la flotte, `null` sans mesure. */
  perf: number | null;
}

export interface OptionsClassement {
  applicationId: string;
  ignorerFermeture?: boolean;
}

function prepare(
  stats: readonly StatLabel[],
  r: ReglagesChoixLabel,
  opts: OptionsClassement,
): LabelClasse[] {
  const uniques = new Map<string, StatLabel>();
  for (const s of stats) if (s.label_id && !uniques.has(s.label_id)) uniques.set(s.label_id, s);
  const liste = [...uniques.values()].filter(
    (s) =>
      opts.ignorerFermeture ||
      (!estFerme(s.label_id, opts.applicationId, r, s) && !testPodPlein(s, r, opts.applicationId)),
  );
  if (liste.length === 0) return [];

  const poids = liste.map((s) => poidsLabel(s, r));
  const parts = partsPlafonnees(poids, r.partMax);
  const nLangue = liste.reduce((a, s) => a + s.comptes_langue, 0);
  const nPays = liste.reduce((a, s) => a + s.comptes_pays, 0);
  const nFlotte = liste.reduce((a, s) => a + s.comptes_total, 0);

  return liste.map((s, i): LabelClasse => ({
    label_id: s.label_id,
    label_nom: s.label_nom,
    poids: poids[i],
    part: parts[i],
    retardLangue: parts[i] * (nLangue + 1) - s.comptes_langue,
    retardPays: parts[i] * (nPays + 1) - s.comptes_pays,
    retardFlotte: parts[i] * (nFlotte + 1) - s.comptes_total,
    recence: Math.max(s.recence_langue, s.recence_pays),
    rafaleLangue: s.recents_langue >= r.rafaleRecents,
    rafalePays: s.recents_pays >= r.rafaleRecents,
    suspendu: estSuspendu(s, r),
    aSec: estASec(s, r),
    jours: joursApresCompte(s, r),
    perf: perfRelative(s),
  }));
}

/**
 * CE QUE FAIT LE MOTEUR AUJOURD'HUI. Port à l'identique de `classerLabels`
 * (`_shared/choix_label_equilibre.ts`) : quatre écarts, deux niveaux de retard,
 * la récence, puis les retards. Le premier de la liste est le label choisi.
 */
export function classerLabels(
  stats: readonly StatLabel[],
  r: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
  opts: OptionsClassement = { applicationId: "" },
): LabelClasse[] {
  const classes = prepare(stats, r, opts);
  if (classes.length === 0) return [];

  const regles: Array<(c: LabelClasse) => boolean> = [
    (c) => c.aSec,
    (c) => c.rafaleLangue,
    (c) => c.rafalePays,
    (c) => c.suspendu,
  ];
  const ecarts = regles.filter((f) => !classes.every(f));
  const niveau = (c: LabelClasse) =>
    (cle(c.retardLangue) > 0 ? 1 : 0) + (cle(c.retardPays) > 0 ? 1 : 0);
  const retardMin = (c: LabelClasse) => Math.min(c.retardLangue, c.retardPays);

  return classes.slice().sort((a, b) => {
    for (const ecarte of ecarts) {
      if (ecarte(a) !== ecarte(b)) return ecarte(a) ? 1 : -1;
    }
    if (niveau(a) !== niveau(b)) return niveau(b) - niveau(a);
    if (niveau(a) === 2 && a.recence !== b.recence) return a.recence - b.recence;
    if (cle(retardMin(a)) !== cle(retardMin(b))) return cle(retardMin(b)) - cle(retardMin(a));
    if (cle(a.retardLangue) !== cle(b.retardLangue)) return cle(b.retardLangue) - cle(a.retardLangue);
    if (cle(a.retardFlotte) !== cle(b.retardFlotte)) return cle(b.retardFlotte) - cle(a.retardFlotte);
    if (cle(a.poids) !== cle(b.poids)) return cle(b.poids) - cle(a.poids);
    return a.label_id < b.label_id ? -1 : a.label_id > b.label_id ? 1 : 0;
  });
}

export interface LabelPropose extends LabelClasse {
  /** Comptes du label là où est le compte : pays + langue. */
  presence: number;
  /** `poids / (1 + 2 × présence)`. Le plus gros gagne. */
  score: number;
}

/**
 * CE QUE FERAIT LA RÈGLE PROPOSÉE (page Notion du 18/10), en un seul score :
 *
 *     score = performance ^ exposant × capacité ÷ (1 + 2 × présence)
 *
 * `présence` = comptes du label dans le pays + comptes dans la langue. Un label
 * déjà installé là où on recrute voit son score chuter, ce qui remplace les
 * quatre écarts et la récence du classement actuel : dès qu'un label prend un
 * compte, sa présence monte et il redescend tout seul au tour suivant.
 *
 * Les deux exclusions restent : label fermé, et label à sec (moins d'un jour de
 * contenu avec ce compte en plus) relégué derrière tous les autres.
 */
export function classerPropose(
  stats: readonly StatLabel[],
  r: ReglagesChoixLabel = REGLAGES_CHOIX_LABEL_DEFAUT,
  opts: OptionsClassement = { applicationId: "" },
): LabelPropose[] {
  const classes = prepare(stats, r, opts);
  if (classes.length === 0) return [];

  const parId = new Map(stats.map((s) => [s.label_id, s]));
  const avecScore = classes.map((c): LabelPropose => {
    const s = parId.get(c.label_id);
    const presence = (s?.comptes_pays ?? 0) + (s?.comptes_langue ?? 0);
    return { ...c, presence, score: c.poids / (1 + 2 * presence) };
  });

  const tousASec = avecScore.every((c) => c.aSec);
  return avecScore.sort((a, b) => {
    if (!tousASec && a.aSec !== b.aSec) return a.aSec ? 1 : -1;
    if (cle(a.score) !== cle(b.score)) return cle(b.score) - cle(a.score);
    return a.label_id < b.label_id ? -1 : a.label_id > b.label_id ? 1 : 0;
  });
}
