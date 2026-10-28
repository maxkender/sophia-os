/**
 * Cohortes (prompt 17, partie B) : une cohorte = les offres acceptées du
 * vendredi au jeudi (heure de Paris), qui commencent à poster le lundi qui
 * suit. Rien ici ne touche la base : la règle de date, l'état de chaque case
 * du tableau, l'entonnoir et le tableau par HM.
 */
import { ajouterJours, partiesParis } from "@/features/onboarding/datesRuul";
import { minuitParis } from "@/features/ckd/cohorte/logique";
import { lundiDe } from "@/features/moteur/semaines";

import type { RecrueCohorte } from "./api";

/** Le jour limite par défaut (`cohorte_jour_limite`) : jeudi = 4. */
export const JOUR_LIMITE_DEFAUT = 4;
export const FOLLOWS_MIN = 5;

/**
 * Le premier lundi strictement après (acceptation + 3 jours) ; avec un jour
 * limite J (jeudi = 4), + (7 − J) jours. Même calcul que `cohorte_lundi_de`
 * (0391). `jour` : la date d'acceptation à Paris (AAAA-MM-JJ).
 */
export function cohorteLundiDe(jour: string, jourLimite = JOUR_LIMITE_DEFAUT): string {
  const d = ajouterJours(jour, 7 - jourLimite);
  return ajouterJours(lundiDe(d), 7);
}

/** La cohorte d'une offre acceptée à cet instant (heure de Paris). */
export function cohorteDeLOffre(instant: Date, jourLimite = JOUR_LIMITE_DEFAUT): string {
  return cohorteLundiDe(partiesParis(instant).date, jourLimite);
}

/** Où en est la cohorte : en préparation (avant son lundi) ou sa semaine N. */
export function phaseCohorte(lundi: string, aujourdhui: string): { prepa: true } | { prepa: false; semaine: number } {
  if (aujourdhui < lundi) return { prepa: true };
  const ecart = Date.parse(`${lundiDe(aujourdhui)}T12:00:00Z`) - Date.parse(`${lundi}T12:00:00Z`);
  return { prepa: false, semaine: Math.round(ecart / (7 * 86_400_000)) + 1 };
}

/**
 * La cohorte affichée par défaut (page Cohorts, 28 oct.) : celle « getting
 * ready » (le prochain lundi), sinon la plus récente.
 */
export function cohorteParDefaut(lundis: readonly string[], aujourdhui: string): string | null {
  const avenir = lundis.filter((l) => l > aujourdhui).sort();
  return avenir[0] ?? [...lundis].sort().reverse()[0] ?? null;
}

/** L'accueil HM : la cohorte en préparation et celle en semaine 1. */
export function cohortesParDefaut(lundis: readonly string[], aujourdhui: string): string[] {
  const avenir = lundis.filter((l) => l > aujourdhui).sort();
  const semaine1 = lundis.find((l) => l === lundiDe(aujourdhui));
  return [avenir[0], semaine1].filter((l): l is string => Boolean(l));
}

// ---------------------------------------------------------------------------
// Les étapes
// ---------------------------------------------------------------------------

export type EtapeCohorte = "acces" | "tiktok" | "warmup" | "mercredi";
export const ETAPES_COHORTE: readonly EtapeCohorte[] = ["acces", "tiktok", "warmup", "mercredi"];
/** Les étapes d'avant le lundi, dans l'ordre. */
export const ETAPES_PREPA = ["acces", "tiktok", "warmup"] as const;
export type EtapePrepa = (typeof ETAPES_PREPA)[number];

/** La cohorte a commencé et la recrue a publié : ce qui n'était pas encore relevé à l'époque est fait. */
function aPublie(r: RecrueCohorte): boolean {
  return r.semaine1.some((c) => c.publies > 0);
}

/** Accès = 1re connexion à l'OS, rien d'autre : Slack ne bloque plus (28 oct.). */
export function accesFait(r: RecrueCohorte): boolean {
  return Boolean(r.premiere_connexion_at);
}

export function tiktokFait(r: RecrueCohorte): boolean {
  return r.tiktok_existe === true || aPublie(r);
}

/** Start warmup + 5 follows ; les reposts ne comptent plus (28 oct.). */
export function warmupFait(r: RecrueCohorte): boolean {
  const releve = Boolean(r.warmup_started_at) && (r.abonnements ?? 0) >= FOLLOWS_MIN;
  return releve || aPublie(r);
}

/** Prêt, à cet instant : les étapes 1 à 3 faites. */
export function pretLundi(r: RecrueCohorte): boolean {
  return accesFait(r) && tiktokFait(r) && warmupFait(r);
}

/**
 * « Ready Monday », figé à dimanche minuit (Paris) : une photo des faits
 * datés d'avant le lundi de la cohorte, plus recalculée ensuite. null avant
 * dimanche minuit. Les relevés TikTok rendus par la base sont déjà ceux
 * d'avant le lundi ; une cohorte d'avant les relevés (aucun) compte comme
 * prête si elle a publié en semaine 1.
 */
export function pretLundiFige(r: RecrueCohorte, maintenant: Date = new Date()): boolean | null {
  const coupure = minuitParis(r.cohorte_lundi).getTime();
  if (maintenant.getTime() < coupure) return null;
  const avant = (iso: string | null) => Boolean(iso) && Date.parse(iso!) < coupure;
  const sansReleve = r.tiktok_existe === null;
  const tiktok = r.tiktok_existe === true || (sansReleve && aPublie(r));
  const follows = (r.abonnements ?? 0) >= FOLLOWS_MIN || (r.abonnements === null && aPublie(r));
  return avant(r.premiere_connexion_at) && tiktok && avant(r.warmup_started_at) && follows;
}

/** A posté (étape du mercredi) : au moins un post publié lundi ou mardi. */
export function aPosteMercredi(r: RecrueCohorte): boolean {
  return r.semaine1.some((c) => c.publies_lun_mar > 0);
}

export type Samedi = "attente" | "a_decider" | "garde" | "kill" | "recree" | "double" | "arrete";

/** Le samedi de la semaine 1 : la décision de Check, Kill or Double. */
export function samediRecrue(r: RecrueCohorte, aujourdhui: string): Samedi {
  if (!r.is_active) return "arrete";
  const decisions = r.samedi.map((p) => p.decision);
  if (decisions.includes("ne_pas_renouveler")) return "kill";
  if (decisions.includes("recreer")) return "recree";
  if (decisions.includes("doubler")) return "double";
  if (r.samedi.some((p) => p.decision === null)) return "a_decider";
  if (r.samedi.length > 0) return "garde";
  return aujourdhui >= ajouterJours(r.cohorte_lundi, 5) ? "garde" : "attente";
}

/** Gardé samedi : le samedi est passé, ni Kill ni arrêt. */
export function gardeSamedi(r: RecrueCohorte, aujourdhui: string): boolean {
  const s = samediRecrue(r, aujourdhui);
  return s === "garde" || s === "recree" || s === "double";
}

/** Un rouge pas encore décidé : la ligne est rouge, elle ne reçoit pas de posts. */
export function rougeOuvert(r: RecrueCohorte, etape?: EtapeCohorte) {
  return r.rouges.find((x) => x.decision === null && (!etape || x.etape === etape)) ?? null;
}

export function estRouge(r: RecrueCohorte): boolean {
  return rougeOuvert(r) !== null;
}

/** Contrat non relié : une relance par Upwork ne peut pas l'atteindre. */
export function sansContrat(r: RecrueCohorte): boolean {
  return !r.contrat_id;
}

function faite(r: RecrueCohorte, e: EtapeCohorte): boolean {
  return e === "acces" ? accesFait(r) : e === "tiktok" ? tiktokFait(r) : e === "warmup" ? warmupFait(r) : aPosteMercredi(r);
}

/** L'étape d'avant le lundi où la recrue en est (la 1re pas faite), null si les 3 sont faites. */
export function etapeEnCours(r: RecrueCohorte): EtapePrepa | null {
  return ETAPES_PREPA.find((e) => !faite(r, e)) ?? null;
}

// ---------------------------------------------------------------------------
// Les cases : une seule information chacune
// ---------------------------------------------------------------------------

/** La relance de l'étape : partie (quand, par où), prévue en simulation, ou bloquée. */
export type Envoi =
  | { type: "envoye"; le: string; canal: string }
  | { type: "prevu"; canal: string | null }
  | { type: "bloque"; raison: string | null };

/** Ce qui manque à l'étape en cours. */
export type Detail =
  | { cle: "connexion" }
  | { cle: "tiktok"; handle: string | null }
  | { cle: "warmup"; start: boolean; follows: number }
  | { cle: "mercredi" };

export type Case =
  | { etat: "fait"; le: string | null }
  | { etat: "encours"; detail: Detail; envoi: Envoi | null }
  | { etat: "rouge"; detail: Detail; envoi: Envoi | null; le: string }
  | { etat: "apres" };

/**
 * Les types de relance de chaque colonne : les 4 étapes du système du 2 nov.
 * (0402) et leurs anciens noms (prompt 17).
 */
export const TYPES_COLONNE: Record<EtapeCohorte, readonly string[]> = {
  acces: ["connexion", "acces"],
  tiktok: ["tiktok"],
  warmup: ["warmup_bien_fait", "warmup_lance", "warmup"],
  mercredi: ["mercredi"],
};

function envoiEtape(r: RecrueCohorte, etape: EtapeCohorte): Envoi | null {
  // Étapes 1 à 3 : la relance vaut quelle que soit la période (« Postpone »).
  const memePeriode = (periode: string | null) => etape !== "mercredi" || periode === r.cohorte_lundi;
  const types = TYPES_COLONNE[etape];
  const envois = r.nudges.filter((n) => types.includes(n.type) && memePeriode(n.periode));
  const envoi = envois[envois.length - 1];
  if (envoi) return { type: "envoye", le: envoi.envoye_at, canal: envoi.canal };
  // La plus avancée des étapes de la colonne (warm-up bien fait avant warm-up lancé).
  const prevue = types.map((ty) => r.prevues.find((p) => p.type === ty && memePeriode(p.periode))).find(Boolean);
  if (prevue?.statut === "prevu") return { type: "prevu", canal: prevue.canal };
  if (prevue?.statut === "bloque") return { type: "bloque", raison: prevue.raison };
  return null;
}

function detailEtape(r: RecrueCohorte, etape: EtapeCohorte): Detail {
  if (etape === "acces") return { cle: "connexion" };
  if (etape === "tiktok") return { cle: "tiktok", handle: r.handle };
  if (etape === "warmup") return { cle: "warmup", start: Boolean(r.warmup_started_at), follows: r.abonnements ?? 0 };
  return { cle: "mercredi" };
}

/**
 * La case d'une étape. Faite : « ✓ 28 Oct ». En cours : ce qui manque et la
 * relance. Rouge : pourquoi. Après l'étape en cours : « — » (pas de détail du
 * warm-up tant que l'accès n'est pas fait). Mercredi : seulement une fois la
 * cohorte commencée.
 */
export function caseEtape(r: RecrueCohorte, etape: EtapeCohorte, aujourdhui?: string): Case {
  if (faite(r, etape)) {
    const le =
      etape === "acces" ? r.premiere_connexion_at
      : etape === "tiktok" ? r.tiktok_vu_at
      : etape === "warmup" ? r.warmup_started_at
      : null;
    return { etat: "fait", le };
  }
  if (etape === "mercredi") {
    if (aujourdhui !== undefined && aujourdhui < r.cohorte_lundi) return { etat: "apres" };
  } else if (etapeEnCours(r) !== etape) {
    return { etat: "apres" };
  }
  const detail = detailEtape(r, etape);
  const envoi = envoiEtape(r, etape);
  const memePeriode = (periode: string) => etape !== "mercredi" || periode === r.cohorte_lundi;
  const rouge = r.rouges.find((x) => x.etape === etape && x.decision === null && memePeriode(x.periode));
  if (rouge) return { etat: "rouge", detail, envoi, le: rouge.rouge_at };
  return { etat: "encours", detail, envoi };
}

/** Où en est la recrue : 0 rien, 1 accès, 2 TikTok, 3 warm-up, 4 a posté, 5 gardée. */
export function avancement(r: RecrueCohorte, aujourdhui: string): number {
  const prepa = ETAPES_PREPA.findIndex((e) => !faite(r, e));
  if (prepa >= 0) return prepa;
  if (!aPosteMercredi(r)) return 3;
  return gardeSamedi(r, aujourdhui) ? 5 : 4;
}

/** Le tri : les rouges d'abord, puis du moins avancé au plus avancé. */
export function trierRecrues(recrues: readonly RecrueCohorte[], aujourdhui: string): RecrueCohorte[] {
  return [...recrues].sort(
    (a, b) =>
      Number(estRouge(b)) - Number(estRouge(a)) ||
      avancement(a, aujourdhui) - avancement(b, aujourdhui) ||
      (a.nom ?? "").localeCompare(b.nom ?? ""),
  );
}

// ---------------------------------------------------------------------------
// « Where they are now » : chaque recrue une seule fois, là où elle bloque
// ---------------------------------------------------------------------------

export const MORCEAUX_BARRE = ["connexion", "tiktok", "warmup", "prets", "rouges"] as const;
export type MorceauBarre = (typeof MORCEAUX_BARRE)[number];

export function morceauBarre(r: RecrueCohorte): MorceauBarre {
  if (estRouge(r)) return "rouges";
  const e = etapeEnCours(r);
  return e === "acces" ? "connexion" : e === "tiktok" ? "tiktok" : e === "warmup" ? "warmup" : "prets";
}

export function barre(recrues: readonly RecrueCohorte[]): Record<MorceauBarre, number> {
  const n = Object.fromEntries(MORCEAUX_BARRE.map((m) => [m, 0])) as Record<MorceauBarre, number>;
  for (const r of recrues) n[morceauBarre(r)]++;
  return n;
}

// ---------------------------------------------------------------------------
// Entonnoir, filtres, tableau par HM
// ---------------------------------------------------------------------------

export interface Entonnoir {
  offre: number;
  acces: number;
  tiktok: number;
  warmup: number;
  pret: number;
  aPoste: number;
  garde: number;
}

export const ETAPES_ENTONNOIR: readonly (keyof Entonnoir)[] = ["offre", "acces", "tiktok", "warmup", "pret", "aPoste", "garde"];

/**
 * L'entonnoir d'une cohorte passée, séquentiel : chaque colonne ne compte que
 * ceux qui ont fait toutes les étapes d'avant. « Prêt lundi » : la photo de
 * dimanche minuit.
 */
export function entonnoir(recrues: readonly RecrueCohorte[], aujourdhui: string, maintenant: Date = new Date()): Entonnoir {
  const acces = recrues.filter(accesFait);
  const tiktok = acces.filter(tiktokFait);
  const warmup = tiktok.filter(warmupFait);
  const pret = warmup.filter((r) => pretLundiFige(r, maintenant) === true);
  const aPoste = pret.filter(aPosteMercredi);
  const garde = aPoste.filter((r) => gardeSamedi(r, aujourdhui));
  return {
    offre: recrues.length,
    acces: acces.length,
    tiktok: tiktok.length,
    warmup: warmup.length,
    pret: pret.length,
    aPoste: aPoste.length,
    garde: garde.length,
  };
}

export interface FiltresCohorte {
  /** Un morceau de la barre « Where they are now ». */
  morceau: MorceauBarre | null;
  /** Seulement les contrats non reliés. */
  sansContrat: boolean;
  hm: string;
  pays: string;
}

export const FILTRES_VIDES: FiltresCohorte = { morceau: null, sansContrat: false, hm: "", pays: "" };

export function filtrer(recrues: readonly RecrueCohorte[], f: FiltresCohorte): RecrueCohorte[] {
  return recrues.filter(
    (r) =>
      (!f.morceau || morceauBarre(r) === f.morceau) &&
      (!f.sansContrat || sansContrat(r)) &&
      (!f.hm || r.hm_id === f.hm) &&
      (!f.pays || r.pays === f.pays),
  );
}

export interface LigneHm {
  hm_id: string | null;
  hm_prenom: string | null;
  recrues: number;
  /** null : aucune cohorte encore arrivée à ce point. */
  pretes: number | null;
  gardees: number | null;
}

/**
 * Par HM, sur les cohortes données (les 4 dernières démarrées) : recrues, %
 * prêtes lundi, % gardées samedi (seulement les cohortes dont le samedi est
 * passé). Les arrêtées comptent dans les recrues.
 */
export function tableauHm(recrues: readonly RecrueCohorte[], aujourdhui: string, maintenant: Date = new Date()): LigneHm[] {
  const parHm = new Map<string, RecrueCohorte[]>();
  for (const r of recrues) {
    const cle = r.hm_id ?? "";
    parHm.set(cle, [...(parHm.get(cle) ?? []), r]);
  }
  const pct = (n: number, sur: number) => (sur === 0 ? null : Math.round((100 * n) / sur));
  return [...parHm.values()]
    .map((liste) => {
      const samediPasse = liste.filter((r) => aujourdhui >= ajouterJours(r.cohorte_lundi, 5));
      return {
        hm_id: liste[0]!.hm_id,
        hm_prenom: liste[0]!.hm_prenom,
        recrues: liste.length,
        pretes: pct(liste.filter((r) => pretLundiFige(r, maintenant) === true).length, liste.length),
        gardees: pct(samediPasse.filter((r) => gardeSamedi(r, aujourdhui)).length, samediPasse.length),
      };
    })
    .sort((a, b) => b.recrues - a.recrues || (a.hm_prenom ?? "").localeCompare(b.hm_prenom ?? ""));
}

/** Les 4 dernières cohortes démarrées (lundi passé ou aujourd'hui), de la plus récente à la plus ancienne. */
export function quatreDernieres(lundis: readonly string[], aujourdhui: string): string[] {
  return lundis.filter((l) => l <= aujourdhui).sort().reverse().slice(0, 4);
}
