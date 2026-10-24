/**
 * Check, Kill or Double, suivi par cohorte (0356) : ce qui se calcule sans la
 * base. Tout est en jours de Paris (le jour métier de l'OS), au format
 * AAAA-MM-JJ, qui se compare comme du texte.
 *
 * Une paire de cohortes à la fois : celle qui fait sa première semaine de posts
 * (le lundi de cette semaine) et celle qui fait son warm-up pour démarrer le
 * lundi qui vient. Le lundi, la seconde prend la place de la première.
 */
import { semaineIso } from "@/features/moteur/cohortes";
import { lundiDe } from "@/features/moteur/semaines";
import { ajouterJours, partiesParis } from "@/features/onboarding/datesRuul";

import type { CompteCohorte, PostCohorte, ReleveWarmup } from "./api";

/** La cohorte qui poste et celle en warm-up, le jour donné. */
export function paireDuJour(aujourdhui: string): { poste: string; warmup: string } {
  const poste = lundiDe(aujourdhui);
  return { poste, warmup: ajouterJours(poste, 7) };
}

/** « S44 » : le numéro de semaine ISO du lundi de la cohorte. */
export function libelleCohorte(lundi: string): string {
  return `S${semaineIso(lundi)}`;
}

/** La date de Paris d'un instant. */
export function jourParis(iso: string): string {
  return partiesParis(new Date(iso)).date;
}

/** Nombre de jours de `de` à `a` (deux dates AAAA-MM-JJ). */
export function ecartJours(de: string, a: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

/** L'instant de minuit (heure de Paris) au début du jour donné, été comme hiver. */
export function minuitParis(jour: string): Date {
  for (const decalage of [2, 1]) {
    const d = new Date(Date.parse(`${jour}T00:00:00Z`) - decalage * 3_600_000);
    const p = partiesParis(d);
    if (p.date === jour && p.heure === "00:00") return d;
  }
  return new Date(`${jour}T00:00:00Z`);
}

/** Ce qui reste avant un instant, en jours, heures et minutes (rien si c'est passé). */
export function resteAvant(cible: Date, maintenant: Date = new Date()): { jours: number; heures: number; minutes: number } | null {
  const ms = cible.getTime() - maintenant.getTime();
  if (ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  return { jours: Math.floor(minutes / 1440), heures: Math.floor((minutes % 1440) / 60), minutes: minutes % 60 };
}

/** Les jours de la semaine de posts, du lundi au samedi (le jour du kill / keep). */
export function joursDePosts(lundi: string): string[] {
  return Array.from({ length: 6 }, (_, i) => ajouterJours(lundi, i));
}

/** Les sept jours du warm-up : du lundi au dimanche qui précèdent les premiers posts. */
export function joursDeWarmup(lundi: string): string[] {
  return Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i - 7));
}

/** Le jour mis en avant par défaut : aujourd'hui, ramené entre le lundi et le samedi. */
export function jourParDefaut(lundi: string, aujourdhui: string): number {
  return Math.min(5, Math.max(0, ecartJours(lundi, aujourdhui)));
}

/** Un axe en paliers ronds et entiers (1, 2, 5, 10, 20, 25, 50…), quatre au plus au-dessus de zéro. */
export function echelle(max: number): { haut: number; ticks: number[] } {
  const pas = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => Math.ceil(Math.max(1, max) / s) <= 4) ?? 1000;
  const haut = Math.ceil(Math.max(1, max) / pas) * pas;
  return { haut, ticks: Array.from({ length: haut / pas + 1 }, (_, i) => i * pas) };
}

// ---------------------------------------------------------------------------
// Warm-up
// ---------------------------------------------------------------------------

/** Créé il y a au moins 2 jours sans compte TikTok : à relancer. */
export const JOURS_AVANT_RELANCE = 2;

export type EtatTiktok = "cree" | "introuvable" | "inconnu";
export type StatutWarmup = "pret" | "en_cours" | "nouveau" | "a_relancer";
export const STATUTS_WARMUP: readonly StatutWarmup[] = ["pret", "en_cours", "nouveau", "a_relancer"];

export interface EtatWarmup {
  tiktok: EtatTiktok;
  /** Création du compte TikTok, d'après TikTok. */
  creeTiktokLe: string | null;
  /** Au moins 1 abonnement ou 1 like au dernier relevé. */
  warmup: boolean;
  abonnements: number | null;
  likes: number | null;
  /** « Start warmup » cliqué dans l'OS. */
  start: boolean;
  /** Jours depuis la création du compte dans l'OS. */
  ageJours: number;
  statut: StatutWarmup;
  /** Le dernier relevé qui a pu lire la page. */
  dernierReleve: string | null;
  /** Les abonnements à chaque relevé où le compte existait (pour la mini-courbe). */
  serieAbonnements: number[];
}

function lisibles(releves: ReleveWarmup[]): ReleveWarmup[] {
  return releves.filter((r) => r.existe !== null);
}

function actif(r: ReleveWarmup): boolean {
  return r.existe === true && (r.abonnements ?? 0) + (r.likes ?? 0) > 0;
}

export function etatWarmup(c: CompteCohorte, aujourdhui: string): EtatWarmup {
  const vus = lisibles(c.releves);
  const dernier = vus[vus.length - 1] ?? null;
  const tiktok: EtatTiktok = !dernier ? "inconnu" : dernier.existe ? "cree" : "introuvable";
  const existe = dernier?.existe === true;
  const ageJours = Math.max(0, ecartJours(jourParis(c.cree_le), aujourdhui));
  const start = Boolean(c.warmup_lance_le);
  const warmup = existe && actif(dernier!);
  const statut: StatutWarmup =
    tiktok === "cree" && warmup && start
      ? "pret"
      : tiktok === "introuvable" && ageJours >= JOURS_AVANT_RELANCE
        ? "a_relancer"
        : tiktok !== "cree" && !start && ageJours < JOURS_AVANT_RELANCE
          ? "nouveau"
          : "en_cours";
  return {
    tiktok,
    creeTiktokLe: [...c.releves].reverse().find((r) => r.cree_tiktok_at)?.cree_tiktok_at ?? null,
    warmup,
    abonnements: existe ? (dernier!.abonnements ?? 0) : null,
    likes: existe ? (dernier!.likes ?? 0) : null,
    start,
    ageJours,
    statut,
    dernierReleve: dernier?.at ?? null,
    serieAbonnements: vus.filter((r) => r.existe === true).map((r) => r.abonnements ?? 0),
  };
}

export const FILTRES_WARMUP = ["tous", "prets", "a_relancer", "sans_tiktok", "sans_warmup", "sans_start", "glisses"] as const;
export type FiltreWarmup = (typeof FILTRES_WARMUP)[number];

export function garderWarmup(f: FiltreWarmup, c: CompteCohorte, e: EtatWarmup): boolean {
  switch (f) {
    case "prets":
      return e.statut === "pret";
    case "a_relancer":
      return e.statut === "a_relancer";
    case "sans_tiktok":
      return e.tiktok !== "cree";
    case "sans_warmup":
      return !e.warmup;
    case "sans_start":
      return !e.start;
    case "glisses":
      return Boolean(c.glisse_de);
    default:
      return true;
  }
}

export interface PointWarmup {
  jour: string;
  /** null : jour à venir, ou pas encore de relevé ce jour-là. */
  crees: number | null;
  tiktok: number | null;
  warmup: number | null;
  start: number | null;
}

/** Le premier jour où un relevé a vu la condition. */
function premierJour(releves: ReleveWarmup[], condition: (r: ReleveWarmup) => boolean): string | null {
  const r = releves.find(condition);
  return r ? jourParis(r.at) : null;
}

/**
 * Le cumul de la semaine de warm-up, jour par jour : créés dans l'OS, compte
 * TikTok créé (d'après la date de création que donne TikTok, sinon le premier
 * relevé qui l'a vu), warm-up actif (premier relevé avec un abonnement ou un
 * like) et « Start warmup » cliqué. Le warm-up actif ne se sait qu'à partir du
 * premier relevé de la cohorte : avant, c'est un trou, pas un zéro.
 */
export function serieWarmup(comptes: CompteCohorte[], lundi: string, aujourdhui: string): PointWarmup[] {
  const dates = comptes.flatMap((c) => c.releves.map((r) => jourParis(r.at))).sort();
  const premierReleve = dates[0] ?? null;
  const parCompte = comptes.map((c) => {
    const creeTiktok = c.releves.find((r) => r.cree_tiktok_at)?.cree_tiktok_at ?? null;
    return {
      cree: jourParis(c.cree_le),
      tiktok: creeTiktok ? jourParis(creeTiktok) : premierJour(c.releves, (r) => r.existe === true),
      warmup: premierJour(c.releves, actif),
      start: c.warmup_lance_le ? jourParis(c.warmup_lance_le) : null,
    };
  });
  const compter = (jour: string, cle: "cree" | "tiktok" | "warmup" | "start") =>
    parCompte.filter((x) => x[cle] !== null && x[cle]! <= jour).length;
  return joursDeWarmup(lundi).map((jour) =>
    jour > aujourdhui
      ? { jour, crees: null, tiktok: null, warmup: null, start: null }
      : {
          jour,
          crees: compter(jour, "cree"),
          tiktok: compter(jour, "tiktok"),
          warmup: premierReleve && jour >= premierReleve ? compter(jour, "warmup") : null,
          start: compter(jour, "start"),
        },
  );
}

// ---------------------------------------------------------------------------
// Première semaine de posts
// ---------------------------------------------------------------------------

export type EtatPost = "bon" | "normal" | "mort" | "attente" | "manque" | "pas_encore" | "a_venir";
/** L'ordre de la répartition : du meilleur au pire, puis ce qui n'est pas encore jugé. */
export const ETATS_POST: readonly EtatPost[] = ["bon", "normal", "mort", "attente", "manque", "pas_encore"];

export function etatPost(p: PostCohorte, aujourdhui: string, seuilMort: number, seuilBon: number): EtatPost {
  if (p.jour > aujourdhui) return "a_venir";
  if (!p.url) return p.jour === aujourdhui ? "pas_encore" : "manque";
  if (!p.mesure || p.vues === null) return "attente";
  if (p.vues >= seuilBon) return "bon";
  if (p.vues < seuilMort) return "mort";
  return "normal";
}

export function mediane(valeurs: number[]): number | null {
  if (valeurs.length === 0) return null;
  const v = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : Math.round((v[m - 1]! + v[m]!) / 2);
}

export interface BilanCompte {
  /** Posts prévus jusqu'à aujourd'hui compris. */
  prevus: number;
  publies: number;
  manques: number;
  morts: number;
  bons: number;
  mediane: number | null;
}

export function bilanCompte(c: CompteCohorte, aujourdhui: string): BilanCompte {
  const passes = c.posts.filter((p) => p.jour <= aujourdhui);
  const etats = passes.map((p) => etatPost(p, aujourdhui, c.seuil_mort, c.seuil_bon));
  return {
    prevus: passes.length,
    publies: passes.filter((p) => p.url).length,
    manques: etats.filter((e) => e === "manque").length,
    morts: etats.filter((e) => e === "mort").length,
    bons: etats.filter((e) => e === "bon").length,
    mediane: mediane(c.posts.filter((p) => p.mesure && p.vues !== null).map((p) => p.vues!)),
  };
}

export interface JourPosts {
  jour: string;
  prevus: number;
  publies: number;
  aVenir: boolean;
}

export interface BilanSemaine {
  /** Du lundi au vendredi. */
  parJour: JourPosts[];
  repartition: Record<EtatPost, number>;
  prevus: number;
  publies: number;
  /** Comptes sans aucun post manqué (aujourd'hui ne compte qu'une fois passé). */
  aJour: number;
  avecManque: number;
  mediane: number | null;
}

export function bilanSemaine(comptes: CompteCohorte[], lundi: string, aujourdhui: string): BilanSemaine {
  const repartition = Object.fromEntries([...ETATS_POST, "a_venir"].map((e) => [e, 0])) as Record<EtatPost, number>;
  const parJour: JourPosts[] = joursDePosts(lundi)
    .slice(0, 5)
    .map((jour) => ({ jour, prevus: 0, publies: 0, aVenir: jour > aujourdhui }));
  const vues: number[] = [];
  let aJour = 0;
  let avecManque = 0;
  for (const c of comptes) {
    let manques = 0;
    for (const p of c.posts) {
      const e = etatPost(p, aujourdhui, c.seuil_mort, c.seuil_bon);
      repartition[e] += 1;
      if (e === "manque") manques += 1;
      const j = parJour.find((x) => x.jour === p.jour);
      if (j) {
        j.prevus += 1;
        if (p.url) j.publies += 1;
      }
      if (p.mesure && p.vues !== null) vues.push(p.vues);
    }
    if (c.posts.some((p) => p.jour <= aujourdhui)) {
      if (manques === 0) aJour += 1;
      else avecManque += 1;
    }
  }
  const passes = parJour.filter((j) => !j.aVenir);
  return {
    parJour,
    repartition,
    prevus: passes.reduce((a, j) => a + j.prevus, 0),
    publies: passes.reduce((a, j) => a + j.publies, 0),
    aJour,
    avecManque,
    mediane: mediane(vues),
  };
}

/** Les comptes qui n'ont pas publié tous leurs posts du jour donné, les plus en retard d'abord. */
export function retardsDuJour(
  comptes: CompteCohorte[],
  jour: string,
): { compte: CompteCohorte; prevus: number; publies: number }[] {
  return comptes
    .map((compte) => {
      const posts = compte.posts.filter((p) => p.jour === jour);
      return { compte, prevus: posts.length, publies: posts.filter((p) => p.url).length };
    })
    .filter((x) => x.prevus > 0 && x.publies < x.prevus)
    .sort((a, b) => a.publies - b.publies || (a.compte.handle ?? "").localeCompare(b.compte.handle ?? ""));
}

export const FILTRES_POSTE = ["tous", "manques", "morts", "propositions"] as const;
export type FiltrePoste = (typeof FILTRES_POSTE)[number];

/** Les comptes regroupés par HM, les HMs les plus chargés d'abord, sans HM en dernier. */
export function grouperParHmCohorte<T extends { compte: CompteCohorte }>(lignes: T[]): { hmId: string | null; lignes: T[] }[] {
  const groupes = new Map<string | null, T[]>();
  for (const l of lignes) {
    const liste = groupes.get(l.compte.hm_id) ?? [];
    liste.push(l);
    groupes.set(l.compte.hm_id, liste);
  }
  return [...groupes.entries()]
    .map(([hmId, l]) => ({ hmId, lignes: l }))
    .sort((a, b) => {
      if (a.hmId === null) return 1;
      if (b.hmId === null) return -1;
      return b.lignes.length - a.lignes.length;
    });
}
