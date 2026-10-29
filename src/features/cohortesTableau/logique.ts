import type { PosteurCohorte, VuesCohorte } from "./api";

/**
 * Recruitment Automation → Cohorts : tout le calcul des tableaux de bord, sans
 * base ni réseau (les données viennent de `cohortes_postes` et `cohortes_vues`).
 */

/** L'entonnoir de la prochaine cohorte, dans l'ordre. */
export const ETAPES = ["offre", "bienvenue", "connexion", "slack", "tiktok", "warmup", "pret"] as const;
export type Etape = (typeof ETAPES)[number];

/** L'étape est-elle faite ? */
export function atteint(p: PosteurCohorte, e: Etape): boolean {
  switch (e) {
    case "offre":
      return Boolean(p.offre_at);
    case "bienvenue":
      return Boolean(p.bienvenue_at);
    case "connexion":
      return Boolean(p.connexion_at);
    case "slack":
      return p.sur_slack;
    case "tiktok":
      return Boolean(p.tiktok_at);
    case "warmup":
      return Boolean(p.warmup_at);
    case "pret":
      return p.pret === true;
  }
}

/** Quand l'étape a été faite (null : pas datée, ou pas faite). */
export function dateEtape(p: PosteurCohorte, e: Etape): string | null {
  switch (e) {
    case "offre":
      return p.offre_at;
    case "bienvenue":
      return p.bienvenue_at;
    case "connexion":
      return p.connexion_at;
    case "slack":
      return p.slack_at;
    case "tiktok":
      return p.tiktok_at;
    case "warmup":
      return p.warmup_at;
    case "pret":
      return null;
  }
}

export const pourcent = (n: number, total: number): number => (total > 0 ? Math.round((100 * n) / total) : 0);

export interface MarcheEntonnoir {
  etape: Etape;
  n: number;
  pct: number;
}

/** Combien ont fait chaque étape, et la part de la cohorte. */
export function entonnoir(postes: readonly PosteurCohorte[]): MarcheEntonnoir[] {
  return ETAPES.map((etape) => {
    const n = postes.filter((p) => atteint(p, etape)).length;
    return { etape, n, pct: pourcent(n, postes.length) };
  });
}

export interface LigneGroupe {
  cle: string;
  libelle: string;
  total: number;
  /** Par étape, dans l'ordre de `ETAPES`. */
  n: number[];
}

/** Le même entonnoir par HM ou par pays, le plus grand groupe d'abord. */
export function entonnoirPar(postes: readonly PosteurCohorte[], par: "hm" | "pays"): LigneGroupe[] {
  const groupes = new Map<string, LigneGroupe>();
  for (const p of postes) {
    const cle = (par === "hm" ? p.hm_id : p.pays) ?? "—";
    const libelle = (par === "hm" ? p.hm_nom : p.pays) ?? "—";
    const g = groupes.get(cle) ?? { cle, libelle, total: 0, n: ETAPES.map(() => 0) };
    g.total++;
    ETAPES.forEach((e, i) => {
      if (atteint(p, e)) g.n[i]!++;
    });
    groupes.set(cle, g);
  }
  return [...groupes.values()].sort((a, b) => b.total - a.total || a.libelle.localeCompare(b.libelle));
}

/** La 1re étape pas faite (null : tout est fait). */
export function etapeBloquante(p: PosteurCohorte): Etape | null {
  return ETAPES.find((e) => !atteint(p, e)) ?? null;
}

export interface Bloque {
  p: PosteurCohorte;
  /** Depuis quand : la dernière étape faite avant celle-ci. */
  depuis: string | null;
}

/** Les recrues bloquées à chaque étape (leur 1re étape pas faite), les plus anciennes d'abord. */
export function bloquesParEtape(postes: readonly PosteurCohorte[]): Map<Etape, Bloque[]> {
  const parEtape = new Map<Etape, Bloque[]>(ETAPES.map((e) => [e, []]));
  for (const p of postes) {
    const e = etapeBloquante(p);
    if (!e) continue;
    const avant = ETAPES.slice(0, ETAPES.indexOf(e)).map((x) => dateEtape(p, x)).filter((d): d is string => Boolean(d));
    const depuis = avant.length ? avant.reduce((a, b) => (a > b ? a : b)) : null;
    parEtape.get(e)!.push({ p, depuis });
  }
  for (const liste of parEtape.values()) liste.sort((a, b) => (a.depuis ?? "9").localeCompare(b.depuis ?? "9"));
  return parEtape;
}

export interface BilanMessages {
  bienvenues: number;
  slack: number;
  upwork: number;
  main: number;
  enFile: number;
}

export function bilanMessages(postes: readonly PosteurCohorte[]): BilanMessages {
  return postes.reduce<BilanMessages>(
    (b, p) => ({
      bienvenues: b.bienvenues + (p.bienvenue_at ? 1 : 0),
      slack: b.slack + p.relances_slack,
      upwork: b.upwork + p.relances_upwork,
      main: b.main + p.main_hm,
      enFile: b.enFile + p.en_file,
    }),
    { bienvenues: 0, slack: 0, upwork: 0, main: 0, enFile: 0 },
  );
}

// ---------------------------------------------------------------------------
// Les cohortes
// ---------------------------------------------------------------------------

export interface CohorteListe {
  lundi: string;
  taille: number;
  statut: "prochaine" | "passee";
}

/**
 * Le sélecteur : la prochaine cohorte (le plus proche lundi pas encore
 * commencé), puis chaque cohorte commencée, la plus récente d'abord. Les
 * cohortes plus lointaines n'y sont pas.
 */
export function listeCohortes(postes: readonly PosteurCohorte[], aujourdhui: string): CohorteListe[] {
  const tailles = new Map<string, number>();
  for (const p of postes) tailles.set(p.cohorte_lundi, (tailles.get(p.cohorte_lundi) ?? 0) + 1);
  const lundis = [...tailles.keys()].sort();
  const prochaine = lundis.find((l) => l > aujourdhui);
  const passees = lundis.filter((l) => l <= aujourdhui).reverse();
  return [
    ...(prochaine ? [{ lundi: prochaine, taille: tailles.get(prochaine)!, statut: "prochaine" as const }] : []),
    ...passees.map((lundi) => ({ lundi, taille: tailles.get(lundi)!, statut: "passee" as const })),
  ];
}

/** Jours entre deux dates AAAA-MM-JJ. */
export function ecart(de: string, a: string): number {
  return Math.round((Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${de.slice(0, 10)}T12:00:00Z`)) / 86_400_000);
}

/** La semaine de cohorte d'une date (S1 = la semaine du lundi de départ ; 0 ou moins : avant). */
export const semaineDe = (lundi: string, jour: string): number => Math.floor(ecart(lundi, jour) / 7) + 1;

/** Les semaines commencées depuis le lundi de départ (S1 en cours = 1). */
export const semainesEcoulees = (lundi: string, aujourdhui: string): number => Math.max(0, semaineDe(lundi, aujourdhui));

const semaine = (p: PosteurCohorte, k: number) => p.semaines.find((s) => s.k === k);

export interface BilanPassee {
  taille: number;
  demarres: number;
  actifs: number;
  kills: number;
  arrets: number;
  doubles: number;
}

export function bilanPassee(postes: readonly PosteurCohorte[]): BilanPassee {
  return {
    taille: postes.length,
    demarres: postes.filter((p) => p.premier_post !== null).length,
    actifs: postes.filter((p) => p.actif).length,
    kills: postes.filter((p) => p.kill_at).length,
    arrets: postes.filter((p) => !p.kill_at && p.arret_raison).length,
    doubles: postes.filter((p) => p.double_at).length,
  };
}

export interface StatSemaine {
  k: number;
  /** Part de la cohorte qui a posté au moins une fois avec lien cette semaine. */
  retention: number;
  /** Posts avec lien par compte (comptes qui avaient des posts prévus). */
  moyenne: number | null;
  /** Part des comptes à 6 posts avec lien ou plus. */
  part6: number | null;
  mediane: number | null;
  /** La semaine en cours (pas finie). */
  enCours: boolean;
}

/** Semaine par semaine : rétention, posts avec lien, médiane des vues. */
export function statsSemaines(
  postes: readonly PosteurCohorte[],
  vues: readonly VuesCohorte[],
  lundi: string,
  aujourdhui: string,
  hmId?: string | null,
): StatSemaine[] {
  const n = semainesEcoulees(lundi, aujourdhui);
  const niveau = hmId === undefined ? "semaine" : "hm_semaine";
  return Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    const lignes = postes.map((p) => semaine(p, k)).filter((s): s is NonNullable<typeof s> => Boolean(s));
    const comptes = lignes.reduce((a, s) => a + s.comptes, 0);
    const liens = lignes.reduce((a, s) => a + s.liens, 0);
    const v = vues.find((x) => x.cohorte_lundi === lundi && x.niveau === niveau && x.k === k && (hmId === undefined || x.hm_id === hmId));
    return {
      k,
      retention: pourcent(lignes.filter((s) => s.liens > 0).length, postes.length),
      moyenne: comptes > 0 ? Math.round((10 * liens) / comptes) / 10 : null,
      part6: comptes > 0 ? pourcent(lignes.reduce((a, s) => a + s.comptes6, 0), comptes) : null,
      mediane: v?.mediane ?? null,
      enCours: k === n,
    };
  });
}

export interface Depart {
  p: PosteurCohorte;
  type: "kill" | "arret";
  /** La semaine de cohorte (0 ou moins : avant le départ ; null : date inconnue). */
  k: number | null;
  raison: string;
}

/** Les Kills et les arrêts, avec leur semaine et leur raison. */
export function departs(postes: readonly PosteurCohorte[], lundi: string): Depart[] {
  const liste: Depart[] = [];
  for (const p of postes) {
    if (p.kill_at) liste.push({ p, type: "kill", k: semaineDe(lundi, p.kill_at.slice(0, 10)), raison: p.kill_raison ?? "—" });
    else if (p.arret_raison) {
      liste.push({ p, type: "arret", k: p.arret_at ? semaineDe(lundi, p.arret_at.slice(0, 10)) : null, raison: p.arret_raison });
    }
  }
  return liste.sort((a, b) => (a.k ?? 999) - (b.k ?? 999));
}

export interface LigneHm {
  cle: string;
  libelle: string;
  bilan: BilanPassee;
  semaines: StatSemaine[];
  mediane: number | null;
}

/** Les mêmes chiffres par HM. */
export function parHm(postes: readonly PosteurCohorte[], vues: readonly VuesCohorte[], lundi: string, aujourdhui: string): LigneHm[] {
  const groupes = new Map<string, PosteurCohorte[]>();
  for (const p of postes) groupes.set(p.hm_id ?? "—", [...(groupes.get(p.hm_id ?? "—") ?? []), p]);
  return [...groupes.entries()]
    .map(([cle, liste]) => {
      const hmId = cle === "—" ? null : cle;
      return {
        cle,
        libelle: liste[0]!.hm_nom ?? "—",
        bilan: bilanPassee(liste),
        semaines: statsSemaines(liste, vues, lundi, aujourdhui, hmId),
        mediane: vues.find((v) => v.cohorte_lundi === lundi && v.niveau === "hm" && v.hm_id === hmId)?.mediane ?? null,
      };
    })
    .sort((a, b) => b.bilan.taille - a.bilan.taille || a.libelle.localeCompare(b.libelle));
}

export interface LigneComparaison {
  lundi: string;
  statut: "prochaine" | "passee";
  taille: number;
  /** Prête : « Ready » avant le départ (prochaine) ; un post avec lien en S1 (passée). */
  pret: number;
  r1: number | null;
  r2: number | null;
  r4: number | null;
  moyenneS1: number | null;
  kills: number;
  doubles: number;
  mediane: number | null;
}

/** Le tableau de toutes les cohortes, la plus récente d'abord. */
export function comparaison(postes: readonly PosteurCohorte[], vues: readonly VuesCohorte[], aujourdhui: string): LigneComparaison[] {
  return listeCohortes(postes, aujourdhui).map(({ lundi, statut, taille }) => {
    const liste = postes.filter((p) => p.cohorte_lundi === lundi);
    const s = statut === "passee" ? statsSemaines(liste, vues, lundi, aujourdhui) : [];
    const r = (k: number) => s.find((x) => x.k === k)?.retention ?? null;
    return {
      lundi,
      statut,
      taille,
      pret: statut === "prochaine"
        ? pourcent(liste.filter((p) => p.pret === true).length, taille)
        : pourcent(liste.filter((p) => (semaine(p, 1)?.liens ?? 0) > 0).length, taille),
      r1: r(1),
      r2: r(2),
      r4: r(4),
      moyenneS1: s.find((x) => x.k === 1)?.moyenne ?? null,
      kills: liste.filter((p) => p.kill_at).length,
      doubles: liste.filter((p) => p.double_at).length,
      mediane: vues.find((v) => v.cohorte_lundi === lundi && v.niveau === "cohorte")?.mediane ?? null,
    };
  });
}

/** Une échelle lisible : 3 à 5 graduations rondes. */
export function graduations(max: number): { haut: number; ticks: number[] } {
  const m = Math.max(1, max);
  const brut = m / 4;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((x) => x * puissance).find((x) => x >= brut) ?? 10 * puissance;
  const haut = Math.ceil(m / pas) * pas;
  return { haut, ticks: Array.from({ length: Math.round(haut / pas) + 1 }, (_, i) => Math.round(i * pas * 100) / 100) };
}
