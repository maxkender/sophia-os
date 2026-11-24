/**
 * 24/11 : le suivi détaillé de l'onglet « En import ». Pour chaque source neuve : où en est le relevé de son profil,
 * où en est CHACUN de ses slideshows (à récupérer, lecture, pertinence, note, nettoyage, description, gardé, écarté,
 * en échec), ce qui coince, et le journal horodaté de ce qui s'est passé.
 *
 * L'avancement se lit dans `import_file` (un post à récupérer) et `contenus` (le pipeline), comme `sources_file`
 * compte ce qui reste « en traitement ». Le journal vient de `import_journal` (0852, écrit par des triggers) ; tant
 * que la migration n'est pas appliquée, il manque seulement le journal et le rythme : l'avancement reste juste.
 */
import { supabase } from "@/lib/supabase/client";

import type { SourceBible } from "./sources";

/** Où en est un slideshow, dans l'ordre du pipeline. */
export type Phase =
  | "a_recuperer" | "recuperation" | "lecture" | "pertinence" | "note" | "nettoyage" | "description"
  | "garde" | "ecarte" | "abandon";

export const PHASES: { cle: Phase; libelle: string; fini: boolean }[] = [
  { cle: "a_recuperer", libelle: "À récupérer", fini: false },
  { cle: "recuperation", libelle: "Récupération", fini: false },
  { cle: "lecture", libelle: "Lecture", fini: false },
  { cle: "pertinence", libelle: "Pertinence", fini: false },
  { cle: "note", libelle: "Note", fini: false },
  { cle: "nettoyage", libelle: "Nettoyage", fini: false },
  { cle: "description", libelle: "Description", fini: false },
  { cle: "garde", libelle: "Gardés", fini: true },
  { cle: "ecarte", libelle: "Écartés", fini: true },
  { cle: "abandon", libelle: "Abandonnés", fini: true },
];
const FINIES = new Set<Phase>(PHASES.filter((p) => p.fini).map((p) => p.cle));
export const estFinie = (p: Phase) => FINIES.has(p);

/** Les plafonds de la fonction d'import (`MAX_TENTATIVES_IMPORT`, `MAX_ECHECS_CONTENU`, `LEASE_MS`). */
export const MAX_RECUPERATION = 5;
export const MAX_PIPELINE = 8;
const BAIL_MS = 8 * 60_000;
/** Une source dont rien n'a bougé depuis tant de minutes, alors qu'il lui reste du travail, est signalée. */
export const IMMOBILE_MIN = 15;

export interface LigneFile {
  id: string;
  compte_reference_id: string;
  post_url: string;
  statut: "pending" | "running" | "done" | "failed" | "skipped";
  erreur: string | null;
  tentatives: number;
  created_at: string;
  updated_at: string | null;
  lease_until: string | null;
  contenu_id: string | null;
}

export interface LigneContenu {
  id: string;
  compte_reference_id: string;
  source_url: string | null;
  statut: "brouillon" | "valide" | "rejete";
  import_statut: "pending" | "running" | "done" | "failed";
  import_etape: string | null;
  import_erreur: string | null;
  import_tentatives: number | null;
  import_lease_until: string | null;
  pertinence_score: number | null;
  created_at: string;
}

export type NiveauJournal = "info" | "ok" | "warn" | "erreur";

export interface LigneJournal {
  id: number;
  at: string;
  compte_reference_id: string;
  contenu_id: string | null;
  post_url: string | null;
  niveau: NiveauJournal;
  etape: string;
  message: string;
}

export interface SlideshowSuivi {
  cle: string;
  postUrl: string | null;
  phase: Phase;
  /** L'erreur en cours (le slideshow sera repris), ou la raison d'un abandon ou d'un écart. */
  erreur: string | null;
  /** Passages ratés (récupération sur 5, ou pipeline sur 8). */
  tentatives: number;
  plafond: number;
  /** Pris par un worker dont le bail a expiré : il sera repris, mais ça coince. */
  bloque: boolean;
  /** Récupération reportée : le fournisseur (Apify) est saturé. */
  reporte: boolean;
}

export type EtatReleve = "a_relever" | "en_cours" | "rate" | "fait" | "inconnu";

export interface SuiviSource {
  id: string;
  handle: string;
  releve: { etat: EtatReleve; essais: number; echec: string | null; enfilees: number | null };
  /** Slideshows attendus : ce que le relevé a mis dans la file, ou ce qu'on voit passer. */
  total: number;
  compte: Record<Phase, number>;
  finis: number;
  enCours: number;
  /** Repris après une erreur (pas encore abandonnés). */
  enErreur: number;
  bloques: number;
  reportes: number;
  slideshows: SlideshowSuivi[];
  derniereActivite: string | null;
  /** Slideshows terminés par heure, sur la dernière demi-heure (journal). */
  rythme: number | null;
  resteMinutes: number | null;
  /** Rien n'a bougé depuis `IMMOBILE_MIN` minutes alors qu'il reste du travail. */
  immobileDepuis: number | null;
  /** Nul : journal indisponible (migration 0852 pas appliquée). */
  journal: LigneJournal[] | null;
}

const vide = (): Record<Phase, number> =>
  Object.fromEntries(PHASES.map((p) => [p.cle, 0])) as Record<Phase, number>;

/** L'étape du pipeline d'un contenu, en phase lisible. */
export function phaseDuContenu(c: LigneContenu): { phase: Phase; erreur: string | null } {
  const etape = c.import_etape;
  if (etape === "elo_insuffisant" || etape === "trop_court" || etape === "sticker" || etape === "rejete") {
    const raison = etape === "elo_insuffisant" ? "note trop basse" : etape === "trop_court" ? "trop peu de slides" : etape === "sticker" ? "sticker pub" : "pas pertinent";
    return { phase: "ecarte", erreur: c.import_erreur ? `${raison} : ${c.import_erreur}` : raison };
  }
  if (c.import_statut === "done") {
    return c.statut === "valide" ? { phase: "garde", erreur: null } : { phase: "ecarte", erreur: c.import_erreur ?? "rejeté" };
  }
  if (c.import_statut === "failed" && (c.import_tentatives ?? 0) >= MAX_PIPELINE) {
    return { phase: "abandon", erreur: c.import_erreur ?? "échecs répétés" };
  }
  const erreur = c.import_statut === "failed" ? c.import_erreur ?? "erreur inconnue" : null;
  switch (etape) {
    case "pertinence": return { phase: "pertinence", erreur };
    case "elo": return { phase: "note", erreur };
    case "nettoyage": return { phase: "nettoyage", erreur };
    case "caption": case "traduction": case "sophia": return { phase: "description", erreur };
    default: return { phase: "lecture", erreur };
  }
}

/** Un post de la file, tant qu'il n'a pas de contenu. */
export function phaseDuPost(f: LigneFile, maintenant: number): Omit<SlideshowSuivi, "cle" | "postUrl"> {
  const base = { tentatives: f.tentatives ?? 0, plafond: MAX_RECUPERATION, bloque: false, reporte: false };
  switch (f.statut) {
    case "running":
      return { ...base, phase: "recuperation", erreur: null, bloque: Boolean(f.lease_until && Date.parse(f.lease_until) < maintenant) };
    case "failed":
      return (f.tentatives ?? 0) >= MAX_RECUPERATION
        ? { ...base, phase: "abandon", erreur: f.erreur ?? "récupération impossible" }
        : { ...base, phase: "a_recuperer", erreur: f.erreur ?? "erreur inconnue" };
    case "skipped":
      return { ...base, phase: "ecarte", erreur: f.erreur ?? "ignoré" };
    case "pending": {
      const reporte = Boolean(f.erreur?.startsWith("Report"));
      return { ...base, phase: "a_recuperer", erreur: null, reporte };
    }
    default:
      // « done » sans contenu (contenu effacé depuis) : rien à suivre.
      return { ...base, phase: "lecture", erreur: null };
  }
}

const normaliserUrl = (u: string | null | undefined) => (u ?? "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

/** Les slideshows d'une source : un par post (le contenu s'il existe, sinon la ligne de la file). */
export function slideshowsDeLaSource(file: LigneFile[], contenus: LigneContenu[], maintenant: number): SlideshowSuivi[] {
  const parCle = new Map<string, SlideshowSuivi>();
  const cleDeUrl = new Map<string, string>();
  for (const c of contenus) {
    const { phase, erreur } = phaseDuContenu(c);
    const bloque = c.import_statut === "running" && Boolean(c.import_lease_until && Date.parse(c.import_lease_until) < maintenant);
    parCle.set(c.id, {
      cle: c.id, postUrl: c.source_url, phase, erreur,
      tentatives: c.import_tentatives ?? 0, plafond: MAX_PIPELINE, bloque, reporte: false,
    });
    if (c.source_url) cleDeUrl.set(normaliserUrl(c.source_url), c.id);
  }
  // Les plus récentes d'abord : un post repris garde sa dernière ligne.
  for (const f of [...file].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const cle = (f.contenu_id && parCle.has(f.contenu_id) ? f.contenu_id : null) ?? cleDeUrl.get(normaliserUrl(f.post_url));
    if (cle) {
      // Le contenu existe : c'est lui qui dit où en est le slideshow.
      const s = parCle.get(cle)!;
      if (!s.postUrl) s.postUrl = f.post_url;
      continue;
    }
    parCle.set(`url:${normaliserUrl(f.post_url)}`, { cle: `url:${normaliserUrl(f.post_url)}`, postUrl: f.post_url, ...phaseDuPost(f, maintenant) });
    cleDeUrl.set(normaliserUrl(f.post_url), `url:${normaliserUrl(f.post_url)}`);
  }
  const rang = new Map(PHASES.map((p, i) => [p.cle, i]));
  // Ce qui coince d'abord, puis ce qui avance (dans l'ordre du pipeline), puis ce qui est fini.
  const poids = (s: SlideshowSuivi) => ((s.erreur && !estFinie(s.phase)) || s.bloque ? 0 : estFinie(s.phase) ? 2 : 1);
  return [...parCle.values()].sort((a, b) => poids(a) - poids(b) || rang.get(a.phase)! - rang.get(b.phase)! || (a.postUrl ?? "").localeCompare(b.postUrl ?? ""));
}

const maxIso = (...v: (string | null | undefined)[]): string | null =>
  v.filter((x): x is string => Boolean(x)).reduce<string | null>((m, x) => (!m || x > m ? x : m), null);

/** Le suivi d'une source, depuis ses lignes (pur : testé sans base). */
export function suivreSource(
  s: Pick<SourceBible, "id" | "handle" | "neuve">,
  lignes: { file: LigneFile[]; contenus: LigneContenu[]; journal: LigneJournal[] | null },
  maintenant: number,
): SuiviSource {
  const slideshows = slideshowsDeLaSource(lignes.file, lignes.contenus, maintenant);
  const compte = vide();
  for (const x of slideshows) compte[x.phase] += 1;
  const finis = slideshows.filter((x) => estFinie(x.phase)).length;
  const n = s.neuve;
  const enfilees = n?.enfilees ?? null;
  const releve: SuiviSource["releve"] = {
    etat: !n ? "inconnu" : n.releve ? "fait" : n.lanceeLe ? "en_cours" : n.echec ? "rate" : "a_relever",
    essais: n?.essais ?? 0,
    echec: n?.echec ?? null,
    enfilees,
  };
  const total = Math.max(slideshows.length, enfilees ?? 0);
  // Ce que le relevé a annoncé mais qu'on ne voit pas encore passer : toujours à récupérer.
  if (total > slideshows.length) compte.a_recuperer += total - slideshows.length;
  const enCours = total - finis;

  // L'activité : le lancement du relevé, le journal, la file, et les prises du pipeline (le bail court 8 minutes depuis la prise).
  const prises = lignes.contenus
    .map((c) => (c.import_lease_until ? new Date(Math.min(Date.parse(c.import_lease_until) - BAIL_MS, maintenant)).toISOString() : null));
  const derniereActivite = maxIso(
    n?.lanceeLe, ...(lignes.journal ?? []).map((l) => l.at), ...lignes.file.map((f) => f.updated_at ?? f.created_at), ...prises,
  );

  let rythme: number | null = null;
  let resteMinutes: number | null = null;
  if (lignes.journal) {
    const depuis = maintenant - 30 * 60_000;
    const finisRecents = lignes.journal.filter((l) => l.etape === "fin" && Date.parse(l.at) >= depuis).length;
    if (finisRecents >= 2) {
      rythme = finisRecents * 2;
      resteMinutes = enCours > 0 ? Math.max(1, Math.round((enCours / rythme) * 60)) : null;
    }
  }

  const releveEnAttente = releve.etat === "a_relever" || releve.etat === "en_cours" || releve.etat === "rate";
  const ilYa = derniereActivite ? Math.floor((maintenant - Date.parse(derniereActivite)) / 60_000) : null;
  const immobileDepuis = (enCours > 0 || releveEnAttente) && ilYa !== null && ilYa >= IMMOBILE_MIN ? ilYa : null;

  return {
    id: s.id,
    handle: s.handle,
    releve,
    total,
    compte,
    finis,
    enCours,
    enErreur: slideshows.filter((x) => x.erreur && !estFinie(x.phase)).length,
    bloques: slideshows.filter((x) => x.bloque).length,
    reportes: slideshows.filter((x) => x.reporte).length,
    slideshows,
    derniereActivite,
    rythme,
    resteMinutes,
    immobileDepuis,
    journal: lignes.journal,
  };
}

/** « il y a 2 min », « il y a 1 h 05 ». */
export function ilYa(iso: string | null | undefined, maintenant: number): string {
  if (!iso) return "jamais";
  const s = Math.max(0, Math.floor((maintenant - Date.parse(iso)) / 1000));
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h ${String(m % 60).padStart(2, "0")}`;
  return `il y a ${Math.floor(h / 24)} j`;
}

/** « 16:42:07 » (heure de Paris). */
export function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Paris" });
}

/** « ≈ 12 min », « ≈ 1 h 20 ». */
export function duree(minutes: number): string {
  if (minutes < 60) return `≈ ${minutes} min`;
  return `≈ ${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

// --- Lectures -------------------------------------------------------------------------------------------------------

const PAGE = 1000;
/** Une source neuve sort de « En import » en moins d'une semaine : 8 jours couvrent tout son premier import. */
const FENETRE_MS = 8 * 24 * 3600_000;

async function toutLire<T>(requete: (de: number, a: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += PAGE) {
    const { data, error } = await requete(de, de + PAGE - 1);
    if (error) throw new Error(error.message);
    const lot = (data ?? []) as T[];
    out.push(...lot);
    if (lot.length < PAGE) break;
  }
  return out;
}

/** Le journal, ou nul si la table n'existe pas encore (0852 pas appliquée). */
async function lireJournal(ids: string[], depuis: string): Promise<LigneJournal[] | null> {
  const { data, error } = await supabase
    .from("import_journal")
    .select("id, at, compte_reference_id, contenu_id, post_url, niveau, etape, message")
    .in("compte_reference_id", ids)
    .gte("at", depuis)
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    .limit(3000);
  if (error) {
    const e = error as { code?: string; message: string };
    if (e.code === "42P01" || e.code === "PGRST205" || /import_journal/.test(e.message)) return null;
    throw new Error(e.message);
  }
  return (data ?? []) as LigneJournal[];
}

/** Le suivi des sources en import, en une lecture. */
export async function lireSuiviImport(sources: Pick<SourceBible, "id" | "handle" | "neuve">[]): Promise<{ suivis: SuiviSource[]; journalDisponible: boolean; lu: number }> {
  const ids = sources.map((s) => s.id);
  if (ids.length === 0) return { suivis: [], journalDisponible: true, lu: Date.now() };
  const depuis = new Date(Date.now() - FENETRE_MS).toISOString();
  const [file, contenus, journal] = await Promise.all([
    toutLire<LigneFile>((de, a) => supabase
      .from("import_file")
      .select("id, compte_reference_id, post_url, statut, erreur, tentatives, created_at, updated_at, lease_until, contenu_id")
      .in("compte_reference_id", ids)
      .gte("created_at", depuis)
      .order("created_at")
      .range(de, a)),
    toutLire<LigneContenu>((de, a) => supabase
      .from("contenus")
      .select("id, compte_reference_id, source_url, statut, import_statut, import_etape, import_erreur, import_tentatives, import_lease_until, pertinence_score, created_at")
      .in("compte_reference_id", ids)
      .gte("created_at", depuis)
      .is("parent_id", null)
      .order("created_at")
      .range(de, a)),
    lireJournal(ids, depuis),
  ]);
  const lu = Date.now();
  const suivis = sources.map((s) => suivreSource(s, {
    file: file.filter((f) => f.compte_reference_id === s.id),
    contenus: contenus.filter((c) => c.compte_reference_id === s.id),
    journal: journal ? journal.filter((l) => l.compte_reference_id === s.id) : null,
  }, lu));
  return { suivis, journalDisponible: journal !== null, lu };
}
