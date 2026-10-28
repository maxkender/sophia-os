/**
 * Cohortes (prompt 17, partie B) : une cohorte = les offres acceptées du
 * vendredi au jeudi (heure de Paris), qui commencent à poster le lundi qui
 * suit. Rien ici ne touche la base : la règle de date, l'état de chaque case
 * du tableau, l'entonnoir et le tableau par HM.
 */
import { ajouterJours, partiesParis } from "@/features/onboarding/datesRuul";
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

/** Les cohortes cochées par défaut : celle en préparation (la plus proche) et celle en semaine 1. */
export function cohortesParDefaut(lundis: readonly string[], aujourdhui: string): string[] {
  const avenir = lundis.filter((l) => l > aujourdhui).sort();
  const semaine1 = lundis.find((l) => l === lundiDe(aujourdhui));
  return [avenir[0], semaine1].filter((l): l is string => Boolean(l));
}

// ---------------------------------------------------------------------------
// Les cases
// ---------------------------------------------------------------------------

export type EtapeCohorte = "acces" | "tiktok" | "warmup" | "mercredi";
export const ETAPES_COHORTE: readonly EtapeCohorte[] = ["acces", "tiktok", "warmup", "mercredi"];

/**
 * Une case dit une seule chose : ✓ fait (le…), rouge, ✉ relancé le… (canal),
 * ✉ prévu (simulation), bloqué (contrat non relié), ou — (pas encore).
 */
export type Case =
  | { etat: "fait"; le: string | null }
  | { etat: "rouge"; le: string }
  | { etat: "relance"; le: string; canal: string }
  | { etat: "prevu"; canal: string | null }
  | { etat: "bloque"; raison: string | null }
  | { etat: "attente" };

function plusTard(...dates: (string | null | undefined)[]): string | null {
  const d = dates.filter((x): x is string => Boolean(x)).sort();
  return d.length ? d[d.length - 1]! : null;
}

/** La cohorte a commencé et la recrue a publié : ce qui n'était pas encore relevé à l'époque est fait. */
function aPublie(r: RecrueCohorte): boolean {
  return r.semaine1.some((c) => c.publies > 0);
}

export function accesFait(r: RecrueCohorte): boolean {
  return Boolean(r.premiere_connexion_at) && r.slack_lie;
}

export function tiktokFait(r: RecrueCohorte): boolean {
  return r.tiktok_existe === true || aPublie(r);
}

export function warmupFait(r: RecrueCohorte): boolean {
  const releve = Boolean(r.warmup_started_at) && (r.abonnements ?? 0) >= FOLLOWS_MIN && Boolean(r.warmup_reposts_at);
  return releve || aPublie(r);
}

/** Prêt lundi : les étapes 1 à 3 faites. */
export function pretLundi(r: RecrueCohorte): boolean {
  return accesFait(r) && tiktokFait(r) && warmupFait(r);
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

/** La case d'une étape. Les relances des étapes 1 à 3 valent quelle que soit la période (« Reporter »). */
export function caseEtape(r: RecrueCohorte, etape: EtapeCohorte): Case {
  const fait =
    etape === "acces" ? accesFait(r)
    : etape === "tiktok" ? tiktokFait(r)
    : etape === "warmup" ? warmupFait(r)
    : aPosteMercredi(r);
  if (fait) {
    const le =
      etape === "acces" ? plusTard(r.premiere_connexion_at, r.slack_lie_at)
      : etape === "tiktok" ? r.tiktok_vu_at
      : etape === "warmup" ? plusTard(r.warmup_started_at, r.warmup_reposts_at)
      : null;
    return { etat: "fait", le };
  }
  const memePeriode = (periode: string | null) => etape !== "mercredi" || periode === r.cohorte_lundi;
  const rouge = r.rouges.find((x) => x.etape === etape && x.decision === null && memePeriode(x.periode));
  if (rouge) return { etat: "rouge", le: rouge.rouge_at };
  const envois = r.nudges.filter((n) => n.type === etape && memePeriode(n.periode));
  const envoi = envois[envois.length - 1];
  if (envoi) return { etat: "relance", le: envoi.envoye_at, canal: envoi.canal };
  const prevue = r.prevues.find((p) => p.type === etape && memePeriode(p.periode));
  if (prevue?.statut === "prevu") return { etat: "prevu", canal: prevue.canal };
  if (prevue?.statut === "bloque") return { etat: "bloque", raison: prevue.raison };
  return { etat: "attente" };
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

export function entonnoir(recrues: readonly RecrueCohorte[], aujourdhui: string): Entonnoir {
  return {
    offre: recrues.length,
    acces: recrues.filter(accesFait).length,
    tiktok: recrues.filter(tiktokFait).length,
    warmup: recrues.filter(warmupFait).length,
    pret: recrues.filter(pretLundi).length,
    aPoste: recrues.filter(aPosteMercredi).length,
    garde: recrues.filter((r) => gardeSamedi(r, aujourdhui)).length,
  };
}

export interface FiltresCohorte {
  rouges: boolean;
  hm: string;
  pays: string;
}

export function filtrer(recrues: readonly RecrueCohorte[], f: FiltresCohorte): RecrueCohorte[] {
  return recrues.filter(
    (r) => (!f.rouges || estRouge(r)) && (!f.hm || r.hm_id === f.hm) && (!f.pays || r.pays === f.pays),
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
export function tableauHm(recrues: readonly RecrueCohorte[], aujourdhui: string): LigneHm[] {
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
        pretes: pct(liste.filter(pretLundi).length, liste.length),
        gardees: pct(samediPasse.filter((r) => gardeSamedi(r, aujourdhui)).length, samediPasse.length),
      };
    })
    .sort((a, b) => b.recrues - a.recrues || (a.hm_prenom ?? "").localeCompare(b.hm_prenom ?? ""));
}

/** Les 4 dernières cohortes démarrées (lundi passé ou aujourd'hui), de la plus récente à la plus ancienne. */
export function quatreDernieres(lundis: readonly string[], aujourdhui: string): string[] {
  return lundis.filter((l) => l <= aujourdhui).sort().reverse().slice(0, 4);
}
