/**
 * Pertinence par contenu × application (import et rattrapage du stock).
 *
 * Un contenu est noté pour chaque application que ses labels servent ET qui a
 * un prompt de pertinence (`pertinence` pour Sophia, `pertinence_<slug>` pour
 * les autres). `contenus.pertinence_score` reste la porte d'import : le MAX des
 * applications notées — identique au score Sophia pour un contenu Sophia seul,
 * qui garde exactement un passage et un appel Gemini.
 *
 * La consigne passée à `scoreRelevance` est le prompt stocké TEL QUEL
 * (`undefined` pour Sophia sans prompt : le défaut de `scoreRelevance`) : plus
 * d'angle de label injecté. Le texte envoyé à Gemini pour un contenu Sophia
 * est octet pour octet celui d'avant le multi-app. La colonne
 * `contenu_pertinences.angles` reste en base, toujours écrite à `null`.
 *
 * Les décisions pures (applications à noter, finalisation,
 * éligibilité, file du rattrapage) sont en tête de fichier et testées dans
 * `pertinence_apps_test.ts`. Le reste lit / écrit la base, TOUJOURS derrière
 * `schemaMultiAppPret` : sans la migration 0256, rien ici n'est appelé.
 *
 * Ce module n'importe pas `import_contenu.ts` (qui l'importe) : la note
 * d'import et les réglages de scoring arrivent par injection.
 */
import { clePromptPertinence } from "./applications.ts";
import {
  chargerApplicationsMoteur,
  chargerLabelsDuContenu,
  chargerLiensLabels,
  schemaMultiAppPret,
} from "./applications_moteur.ts";
import { baseDeTraduction, type LigneLangueBase } from "./deck_langue.ts";
import { scoreRelevance } from "./gemini.ts";
import {
  applicationsServies,
  ID_SOPHIA,
  SLUG_SOPHIA,
  type ApplicationMoteur,
  type LabelRef,
  type LienLabelApplication,
} from "./multi_app.ts";
import { chargerPrompt, messageErreur } from "./supabase.ts";

type Supabase = ReturnType<typeof import("./supabase.ts").serviceClient>;

const SOPHIA_PAR_DEFAUT: ApplicationMoteur = {
  id: ID_SOPHIA,
  slug: SLUG_SOPHIA,
  nom: "Sophia",
  langues: null,
  actif: true,
};

// ---------------------------------------------------------------------------
// Décisions pures
// ---------------------------------------------------------------------------

/** Clé du prompt de pertinence : `pertinence` (Sophia, historique) ou `pertinence_<slug>`. */
export function clePromptPertinenceApp(app: { id: string; slug: string }): string {
  return app.id === ID_SOPHIA ? "pertinence" : clePromptPertinence(app.slug);
}

export interface AppANoter {
  app: ApplicationMoteur;
  /** Clé du prompt utilisé (tracée dans `contenu_pertinences.prompt_cle`). */
  cle: string;
  /** Prompt stocké. Sophia : `undefined` = défaut de `scoreRelevance`, comme avant. */
  prompt: string | undefined;
}

/**
 * Applications à noter pour un contenu, dans l'ordre des passages : Sophia
 * d'abord, puis les autres par slug.
 *
 * - Sophia est notée dès qu'un label la sert, même sans prompt stocké (le
 *   défaut de `scoreRelevance` s'applique, exactement comme aujourd'hui).
 * - Une autre application n'est notée que si SON prompt existe. Un prompt
 *   manquant ne retombe JAMAIS sur le texte Sophia : noter Unswipe avec la
 *   grille « culture générale » donnerait des éligibilités fausses mais
 *   crédibles, bien pire qu'une absence de ligne (que le rattrapage comble).
 * - Une application inactive est notée si son prompt existe : ses labels ont
 *   été cochés exprès, et le stock doit être prêt le jour où on l'active.
 * - Rien à noter (labels qui ne servent qu'une application sans prompt) :
 *   Sophia, comportement historique, pour que la porte d'import ait un score.
 */
export function applicationsANoter(args: {
  servies: readonly string[];
  applications: readonly ApplicationMoteur[];
  /** Prompt stocké par id d'application (`undefined` / vide = absent). */
  prompts: ReadonlyMap<string, string | undefined>;
}): AppANoter[] {
  const sophia = args.applications.find((a) => a.id === ID_SOPHIA) ?? SOPHIA_PAR_DEFAUT;
  const entreeSophia = (): AppANoter => ({
    app: sophia,
    cle: clePromptPertinenceApp(sophia),
    prompt: args.prompts.get(ID_SOPHIA),
  });

  const out: AppANoter[] = [];
  const servies = new Set(args.servies);
  if (servies.has(ID_SOPHIA)) out.push(entreeSophia());

  const autres = args.applications
    .filter((a) => a.id !== ID_SOPHIA && servies.has(a.id))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  for (const app of autres) {
    const prompt = (args.prompts.get(app.id) ?? "").trim();
    if (!prompt) continue;
    out.push({ app, cle: clePromptPertinenceApp(app), prompt });
  }

  return out.length > 0 ? out : [entreeSophia()];
}

/** Ids des applications dont il faut charger le prompt (Sophia toujours). */
export function applicationsAPrompter(
  servies: readonly string[],
  applications: readonly ApplicationMoteur[],
): ApplicationMoteur[] {
  const sophia = applications.find((a) => a.id === ID_SOPHIA) ?? SOPHIA_PAR_DEFAUT;
  const autres = applications.filter((a) => a.id !== ID_SOPHIA && servies.includes(a.id));
  return [sophia, ...autres];
}

/** Score stockable : `contenu_pertinences.score` est un entier 0..100 (check SQL). */
export function scoreStockable(score: number): number {
  const n = Number.isFinite(score) ? score : 0;
  return Math.round(Math.min(100, Math.max(0, n)));
}

export interface PertinenceNotee {
  application_id: string;
  score: number;
  raison: string | null;
}

/**
 * Prochaine application à noter : la première (dans l'ordre de passage) sans
 * ligne. `null` = tout est noté, il ne reste qu'à finaliser.
 */
export function prochaineANoter(
  aNoter: readonly AppANoter[],
  notees: readonly PertinenceNotee[],
): AppANoter | null {
  const faites = new Set(notees.map((n) => n.application_id));
  return aNoter.find((a) => !faites.has(a.app.id)) ?? null;
}

/**
 * Pertinence de la porte d'import, une fois TOUTES les applications notées
 * (`null` sinon).
 *
 * Score = max : un contenu n'est rejeté que s'il n'est pertinent pour aucune
 * application. Raison = celle de Sophia quand elle est notée (la page d'import
 * affiche la même phrase qu'avant), sinon celle de l'application gagnante,
 * préfixée de son nom pour qu'on sache d'où vient le score.
 */
export function finaliserPertinence(
  aNoter: readonly AppANoter[],
  notees: readonly PertinenceNotee[],
): { score: number; raison: string } | null {
  if (aNoter.length === 0) return null;
  const parApp = new Map(notees.map((n) => [n.application_id, n]));
  const lignes: Array<{ a: AppANoter; n: PertinenceNotee }> = [];
  for (const a of aNoter) {
    const n = parApp.get(a.app.id);
    if (!n) return null;
    lignes.push({ a, n });
  }
  let gagnante = lignes[0];
  for (const l of lignes) if (l.n.score > gagnante.n.score) gagnante = l;
  const sophia = lignes.find((l) => l.a.app.id === ID_SOPHIA);
  const raison = sophia
    ? (sophia.n.raison ?? "")
    : `[${gagnante.a.app.nom}] ${gagnante.n.raison ?? ""}`;
  return { score: gagnante.n.score, raison };
}

/**
 * Pertinence minimum (score 0-100 du prompt de pertinence) d'une application
 * AUTRE que Sophia pour entrer dans son pool. Décision du propriétaire
 * (2026-10-09) : la note d'import est dominée par les vues et la piste du
 * compte source (la pertinence n'y pèse qu'environ 16 %), si bien qu'un TikTok
 * très vu passait le seuil même hors sujet pour Unswipe. Sophia n'a pas ce
 * plancher : son pool n'écarte que les lignes explicitement non éligibles, et
 * l'en doter retirerait du stock aux comptes Sophia.
 */
export const PERTINENCE_MIN_HORS_SOPHIA = 50;

/** Le score de pertinence permet-il le pool de l'application ? Sophia : toujours. */
export function pertinenceSuffisante(applicationId: string, score: number): boolean {
  return applicationId === ID_SOPHIA ||
    (Number.isFinite(score) && score >= PERTINENCE_MIN_HORS_SOPHIA);
}

/**
 * Éligible au pool de l'application : note d'import ≥ seuil, ou import forcé.
 *
 * `pertinence` (application + score de pertinence) : hors Sophia, il faut EN
 * PLUS un score ≥ PERTINENCE_MIN_HORS_SOPHIA, import forcé compris — forcer
 * l'import passe outre les vues et la piste, pas le sujet. Sophia, ou appel
 * sans `pertinence` : la règle d'avant, inchangée.
 */
export function eligibiliteDepuisNote(
  note: number,
  seuil: number,
  force: boolean,
  pertinence?: { applicationId: string; score: number },
): boolean {
  if (pertinence && !pertinenceSuffisante(pertinence.applicationId, pertinence.score)) return false;
  return force || (Number.isFinite(note) && note >= seuil);
}

/**
 * Note STOCKÉE d'une application autre que Sophia : sur un import FORCÉ, elle
 * est planchée au seuil, comme la note Sophia d'un import forcé
 * (`forcerImportElo` : `max(note, seuil)`, puis `tierImport`). Le tier
 * d'entrée paresseux de l'application (`tier_initial_note`, 0270) se lit sur
 * cette note : sans plancher, une ligne forcée entrerait en C même quand le
 * seuil (≥ 60) ferait entrer Sophia en B. Sophia, non forcé ou note non finie :
 * note brute, inchangée.
 */
export function noteStockee(
  note: number,
  applicationId: string,
  seuil: number,
  force: boolean,
): number {
  if (!force || applicationId === ID_SOPHIA || !Number.isFinite(note)) return note;
  return Math.max(note, seuil);
}

/**
 * Comment placer le rang SOPHIA (`contenus.tier`) d'un contenu à l'import,
 * maintenant que chaque application a SON tier (0270, « plus de tiers
 * mergés ») :
 *
 * - `historique` : contenu Sophia seul (ou aucune ligne de pertinence) — le
 *   placement d'avant, à l'octet près (porte = score Sophia) ;
 * - `partage` : noté pour Sophia ET pour une autre application — le rang
 *   Sophia vient du score SOPHIA, plus du max (la porte, elle, reste le max) ;
 * - `hors_sophia` : aucune ligne Sophia (labels qui ne servent qu'une autre
 *   application) — pas de rang Sophia, `contenus` reste D / 0.
 */
export type PlacementSophia =
  | { mode: "historique" }
  | { mode: "partage"; scoreSophia: number }
  | { mode: "hors_sophia" };

/**
 * Placement Sophia depuis les lignes `contenu_pertinences` du contenu. Le score
 * Sophia du mode `partage` est le score STOCKÉ (entier), celui dont
 * `majNotesPertinences` tire la note Sophia : rang et éligibilité Sophia
 * viennent ainsi du même chiffre.
 */
export function placementSophiaDepuisLignes(
  lignes: ReadonlyArray<{ application_id: string; score: number | string | null }>,
): PlacementSophia {
  const sophia = lignes.find((l) => l.application_id === ID_SOPHIA);
  const autres = lignes.some((l) => l.application_id !== ID_SOPHIA);
  if (!autres) return { mode: "historique" };
  if (!sophia) return { mode: "hors_sophia" };
  const score = Number(sophia.score);
  return { mode: "partage", scoreSophia: Number.isFinite(score) ? score : 0 };
}

/**
 * Accroche d'un contenu du stock, pour le rattrapage : son OCR source n'est
 * plus dans `structure_slides` (vidé à la validation). On lit la ligne de la
 * langue source, dans sa version SANS pub (`slides_base`) quand elle existe —
 * sinon la pub Sophia posée sur cette ligne pourrait servir d'accroche — et on
 * saute toute slide marquée `position_sophia`.
 */
export function accrocheDepuisLigneSource(
  ligne: LigneLangueBase | null | undefined,
): string {
  const deck = [...baseDeTraduction(ligne)].sort((a, b) => a.position - b.position);
  const premiere = deck.find((s) => !s.position_sophia);
  return (premiere?.texte_overlay ?? "").trim();
}

// ---------------------------------------------------------------------------
// Rattrapage : état dans reglages['backfill_pertinence']
// ---------------------------------------------------------------------------

export const CLE_BACKFILL_PERTINENCE = "backfill_pertinence";

/**
 * Bail du rattrapage d'une application. Le cron réveille ~12 workers/min :
 * sans bail, chaque worker oisif prenait les MÊMES contenus en tête de file et
 * payait autant d'appels Gemini pour une seule ligne. 3 min > mur Edge (150 s) :
 * un worker tué en plein lot rend la main tout seul.
 */
export const BAIL_BACKFILL_MS = 3 * 60_000;
/** Contenus notés par passage au plus (un appel Gemini chacun, en série). */
export const LOT_BACKFILL = 8;
/** On n'entame plus de contenu au-delà : laisse ~60 s de marge sous le mur Edge. */
export const BUDGET_BACKFILL_MS = 90_000;

export interface EtatBackfillApp {
  actif: boolean;
  demarre_at: string | null;
  dernier_at: string | null;
  faits: number;
  erreurs: number;
  derniere_erreur: string | null;
  /** Bail ISO du worker qui travaille (interne, `null` = libre). */
  bail_jusqu_a: string | null;
}

export type ReglageBackfill = Record<string, EtatBackfillApp>;

/** Vue renvoyée à l'admin (`EtatBackfillPertinence` côté front). */
export interface EtatBackfillVue {
  actif: boolean;
  restants: number;
  faits: number;
  erreurs: number;
  demarre_at: string | null;
  dernier_at: string | null;
  derniere_erreur: string | null;
}

function etatVide(): EtatBackfillApp {
  return {
    actif: false,
    demarre_at: null,
    dernier_at: null,
    faits: 0,
    erreurs: 0,
    derniere_erreur: null,
    bail_jusqu_a: null,
  };
}

/** Lecture tolérante : une valeur abîmée vaut « rien en cours ». */
export function normaliserReglageBackfill(brut: unknown): ReglageBackfill {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return {};
  const out: ReglageBackfill = {};
  for (const [id, v] of Object.entries(brut as Record<string, unknown>)) {
    if (!id || !v || typeof v !== "object" || Array.isArray(v)) continue;
    const e = v as Record<string, unknown>;
    const texte = (x: unknown) => (typeof x === "string" && x ? x : null);
    const entier = (x: unknown) => {
      const n = Math.floor(Number(x));
      return Number.isFinite(n) && n > 0 ? n : 0;
    };
    out[id] = {
      actif: e.actif === true,
      demarre_at: texte(e.demarre_at),
      dernier_at: texte(e.dernier_at),
      faits: entier(e.faits),
      erreurs: entier(e.erreurs),
      derniere_erreur: texte(e.derniere_erreur),
      bail_jusqu_a: texte(e.bail_jusqu_a),
    };
  }
  return out;
}

export function etatBackfillApp(reglage: ReglageBackfill, applicationId: string): EtatBackfillApp {
  return reglage[applicationId] ?? etatVide();
}

/**
 * Allume / éteint. Allumer depuis l'arrêt ouvre une nouvelle campagne
 * (compteurs à zéro, `demarre_at` = maintenant) ; rallumer une campagne déjà
 * active ne change rien.
 */
export function basculerBackfill(
  reglage: ReglageBackfill,
  applicationId: string,
  actif: boolean,
  maintenantIso: string,
): ReglageBackfill {
  const courant = etatBackfillApp(reglage, applicationId);
  if (courant.actif === actif) return reglage;
  const suivant: EtatBackfillApp = actif
    ? { ...courant, actif: true, demarre_at: maintenantIso, faits: 0, erreurs: 0, derniere_erreur: null }
    : { ...courant, actif: false };
  return { ...reglage, [applicationId]: suivant };
}

/**
 * Application dont un worker peut prendre le rattrapage maintenant : active,
 * jamais Sophia (pas de ligne = éligible, rien à rattraper), bail libre. La
 * plus anciennement servie d'abord, pour qu'aucune ne soit affamée.
 */
export function applicationBackfillAPrendre(
  reglage: ReglageBackfill,
  maintenantMs: number,
): string | null {
  const libres = Object.entries(reglage).filter(([id, e]) =>
    id !== ID_SOPHIA &&
    e.actif &&
    (!e.bail_jusqu_a || !(Date.parse(e.bail_jusqu_a) > maintenantMs))
  );
  if (libres.length === 0) return null;
  libres.sort(([, a], [, b]) => (a.dernier_at ?? "").localeCompare(b.dernier_at ?? ""));
  return libres[0][0];
}

// ---------------------------------------------------------------------------
// Base : contexte d'un contenu
// ---------------------------------------------------------------------------

interface ContextePertinence {
  labels: LabelRef[];
  liens: LienLabelApplication[];
  applications: ApplicationMoteur[];
}

async function chargerContexte(
  supabase: Supabase,
  contenuId: string,
): Promise<ContextePertinence> {
  const labels = await chargerLabelsDuContenu(supabase, contenuId);
  const liens = await chargerLiensLabels(supabase, labels.map((l) => l.id));
  return { labels, liens, applications: await chargerApplicationsMoteur(supabase) };
}

async function lirePertinences(
  supabase: Supabase,
  contenuId: string,
): Promise<Array<PertinenceNotee & { note: number | null; eligible: boolean }>> {
  const { data, error } = await supabase
    .from("contenu_pertinences")
    .select("application_id, score, raison, note, eligible")
    .eq("contenu_id", contenuId);
  if (error) throw new Error(`Pertinences du contenu ${contenuId} : ${messageErreur(error)}`);
  return ((data ?? []) as Array<{
    application_id: string;
    score: number;
    raison: string | null;
    note: number | string | null;
    eligible: boolean | null;
  }>).map((r) => ({
    application_id: r.application_id,
    score: Number(r.score),
    raison: r.raison ?? null,
    note: r.note === null || r.note === undefined ? null : Number(r.note),
    eligible: Boolean(r.eligible),
  }));
}

/**
 * Placement Sophia d'un contenu à l'import (voir `PlacementSophia`). LÈVE sur
 * erreur de lecture : le pas d'import est alors rejoué, plutôt que de figer un
 * rang Sophia sur une lecture ratée (même doctrine que `schemaMultiAppPret`).
 * À n'appeler que si 0256 est en place.
 */
export async function placementSophiaImport(
  supabase: Supabase,
  contenuId: string,
): Promise<PlacementSophia> {
  const { data, error } = await supabase
    .from("contenu_pertinences")
    .select("application_id, score")
    .eq("contenu_id", contenuId);
  if (error) {
    throw new Error(`Placement Sophia du contenu ${contenuId} : ${messageErreur(error)}`);
  }
  return placementSophiaDepuisLignes(
    (data ?? []) as Array<{ application_id: string; score: number | null }>,
  );
}

// ---------------------------------------------------------------------------
// Import, étape 2 : une application par passage
// ---------------------------------------------------------------------------

export type DepsNotation = { scoreRelevance: typeof scoreRelevance };

export type PasPertinence =
  | { fini: false; application: string }
  | { fini: true; score: number; raison: string; application: string | null };

/**
 * Note UNE application (un appel Gemini, pour tenir le mur Edge) et dit si la
 * pertinence du contenu est complète. Mêmes entrées que l'import historique :
 * accroche = OCR de la slide 1, légende = titre.
 *
 * Reprise : une application déjà notée (ligne présente) n'est pas re-notée ;
 * si tout est déjà noté (worker tué entre l'écriture de la ligne et celle du
 * contenu), on finalise sans rappeler Gemini.
 *
 * À n'appeler que si `schemaMultiAppPret` : l'appelant garde sinon le chemin
 * historique.
 */
export async function noterPertinenceImport(
  supabase: Supabase,
  contenu: { id: string; titre?: string | null },
  hookText: string,
  deps: DepsNotation = { scoreRelevance },
): Promise<PasPertinence> {
  const ctx = await chargerContexte(supabase, contenu.id);
  const servies = applicationsServies(ctx.labels, ctx.liens);

  const prompts = new Map<string, string | undefined>();
  for (const app of applicationsAPrompter(servies, ctx.applications)) {
    prompts.set(app.id, await chargerPrompt(supabase, clePromptPertinenceApp(app)));
  }
  const aNoter = applicationsANoter({ servies, applications: ctx.applications, prompts });

  const notees: PertinenceNotee[] = await lirePertinences(supabase, contenu.id);
  const suivante = prochaineANoter(aNoter, notees);

  if (suivante) {
    const { score, reason } = await deps.scoreRelevance({
      caption: contenu.titre ?? "",
      hookText,
      instructions: suivante.prompt,
    });
    const { error } = await supabase.from("contenu_pertinences").upsert(
      {
        contenu_id: contenu.id,
        application_id: suivante.app.id,
        score: scoreStockable(score),
        raison: reason,
        // Colonne héritée des angles de label (abandonnés) : plus alimentée.
        angles: null,
        prompt_cle: suivante.cle,
        note: null,
        // Provisoire jusqu'à l'étape 4 (note d'import). Sophia : éligible —
        // seul un refus EXPLICITE l'exclut, et si l'étape 4 ne repassait pas
        // (sonde 0256 en échec), on retomberait sur le comportement d'avant
        // plutôt que de perdre le contenu. Autres : non éligible, le sens sûr.
        eligible: suivante.app.id === ID_SOPHIA,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "contenu_id,application_id" },
    );
    if (error) {
      throw new Error(`Pertinence ${suivante.app.slug} : ${messageErreur(error)}`);
    }
    // Score brut en mémoire (pas l'entier stocké) : la porte d'import d'un
    // contenu Sophia seul reçoit exactement la valeur d'avant.
    notees.push({ application_id: suivante.app.id, score, raison: reason });
  }

  const fin = finaliserPertinence(aNoter, notees);
  if (!fin) {
    return { fini: false, application: suivante?.app.slug ?? "" };
  }
  return { fini: true, ...fin, application: suivante?.app.slug ?? null };
}

// ---------------------------------------------------------------------------
// Import, étape 4 : note et éligibilité par application
// ---------------------------------------------------------------------------

export type PertinencesRapport = Record<string, { score: number; note: number | null; eligible: boolean }>;

/**
 * Calcule la note d'import de chaque application notée (même formule que la
 * porte, avec SON score) et son éligibilité, puis rend le résumé pour
 * `import_elo_rapport.pertinences`.
 *
 * Seules les lignes sans note sont (ré)écrites : l'étape 4 repasse à chaque
 * pas du pipeline, et une ligne forcée par `forcerImportElo` ne doit pas être
 * recalculée. À n'appeler que si `schemaMultiAppPret`.
 */
export async function majNotesPertinences(
  supabase: Supabase,
  contenuId: string,
  opts: {
    noteDe: (score: number) => number;
    seuil: number;
    force: boolean;
  },
): Promise<PertinencesRapport> {
  const lignes = await lirePertinences(supabase, contenuId);
  if (lignes.length === 0) return {};
  const applications = await chargerApplicationsMoteur(supabase);
  const slugDe = (id: string) => applications.find((a) => a.id === id)?.slug ?? id;

  const rapport: PertinencesRapport = {};
  for (const l of lignes) {
    let { note, eligible } = l;
    if (note === null) {
      note = noteStockee(opts.noteDe(l.score), l.application_id, opts.seuil, opts.force);
      eligible = eligibiliteDepuisNote(note, opts.seuil, opts.force, {
        applicationId: l.application_id,
        score: l.score,
      });
      const { error } = await supabase
        .from("contenu_pertinences")
        .update({ note, eligible, updated_at: new Date().toISOString() })
        .eq("contenu_id", contenuId)
        .eq("application_id", l.application_id);
      if (error) {
        throw new Error(`Éligibilité ${slugDe(l.application_id)} : ${messageErreur(error)}`);
      }
    }
    rapport[slugDe(l.application_id)] = {
      score: l.score,
      note: Math.round(note * 100) / 100,
      eligible,
    };
  }
  return rapport;
}

// ---------------------------------------------------------------------------
// Rattrapage du stock (à la demande, jamais automatique)
// ---------------------------------------------------------------------------

async function lireReglageBackfill(
  supabase: Supabase,
): Promise<{ reglage: ReglageBackfill; updatedAt: string | null }> {
  const { data, error } = await supabase
    .from("reglages")
    .select("valeur, updated_at")
    .eq("cle", CLE_BACKFILL_PERTINENCE)
    .maybeSingle();
  if (error) throw new Error(`Réglage ${CLE_BACKFILL_PERTINENCE} : ${messageErreur(error)}`);
  const row = data as { valeur?: unknown; updated_at?: string | null } | null;
  return {
    reglage: normaliserReglageBackfill(row?.valeur),
    updatedAt: row ? (row.updated_at ?? null) : null,
  };
}

/**
 * Lecture-modification-écriture du réglage, en compare-and-set sur
 * `updated_at` : l'admin qui éteint une campagne pendant qu'un worker écrit
 * ses compteurs ne doit pas se faire rallumer par l'écriture du worker. Sur
 * conflit, on relit et on rejoue `modifier` sur la valeur fraîche.
 * `modifier` rend `null` pour « rien à écrire ».
 */
async function modifierReglageBackfill(
  supabase: Supabase,
  modifier: (r: ReglageBackfill) => ReglageBackfill | null,
): Promise<ReglageBackfill | null> {
  for (let essai = 0; essai < 5; essai += 1) {
    const { reglage, updatedAt } = await lireReglageBackfill(supabase);
    const suivant = modifier(reglage);
    if (!suivant) return null;
    const maintenant = new Date().toISOString();
    if (updatedAt === null) {
      const { error } = await supabase
        .from("reglages")
        .insert({ cle: CLE_BACKFILL_PERTINENCE, valeur: suivant, updated_at: maintenant });
      if (!error) return suivant;
      if ((error as { code?: string }).code === "23505") continue;
      throw new Error(`Réglage ${CLE_BACKFILL_PERTINENCE} : ${messageErreur(error)}`);
    }
    const { data, error } = await supabase
      .from("reglages")
      .update({ valeur: suivant, updated_at: maintenant })
      .eq("cle", CLE_BACKFILL_PERTINENCE)
      .eq("updated_at", updatedAt)
      .select("cle");
    if (error) throw new Error(`Réglage ${CLE_BACKFILL_PERTINENCE} : ${messageErreur(error)}`);
    if ((data ?? []).length > 0) return suivant;
  }
  throw new Error(`Réglage ${CLE_BACKFILL_PERTINENCE} : écritures concurrentes, réessaie`);
}

async function compterRestants(supabase: Supabase, applicationId: string): Promise<number> {
  const { count, error } = await supabase
    .from("contenu_pertinence_manquante")
    .select("contenu_id", { count: "exact", head: true })
    .eq("application_id", applicationId);
  if (error) throw new Error(`File du rattrapage : ${messageErreur(error)}`);
  return count ?? 0;
}

export type ResultatBackfillAdmin =
  | { ok: true; etat: EtatBackfillVue }
  | { ok: false; erreur: string };

async function verifierApplicationBackfill(
  supabase: Supabase,
  applicationId: string,
): Promise<{ ok: true; app: ApplicationMoteur } | { ok: false; erreur: string }> {
  if (!(await schemaMultiAppPret(supabase))) {
    return { ok: false, erreur: "Migration 0256 non appliquée : rattrapage indisponible" };
  }
  if (!applicationId) return { ok: false, erreur: "applicationId requis" };
  if (applicationId === ID_SOPHIA) {
    return {
      ok: false,
      erreur: "Rien à rattraper pour Sophia : sans ligne, un contenu lui reste éligible",
    };
  }
  const app = (await chargerApplicationsMoteur(supabase)).find((a) => a.id === applicationId);
  if (!app) return { ok: false, erreur: `Application ${applicationId} inconnue` };
  return { ok: true, app };
}

/** État d'une campagne pour l'admin ; `restants` = décompte exact de la file. */
export async function etatBackfillPertinence(
  supabase: Supabase,
  applicationId: string,
): Promise<ResultatBackfillAdmin> {
  const v = await verifierApplicationBackfill(supabase, applicationId);
  if (!v.ok) return v;
  const [{ reglage }, restants] = await Promise.all([
    lireReglageBackfill(supabase),
    compterRestants(supabase, applicationId),
  ]);
  const e = etatBackfillApp(reglage, applicationId);
  return {
    ok: true,
    etat: {
      actif: e.actif,
      restants,
      faits: e.faits,
      erreurs: e.erreurs,
      demarre_at: e.demarre_at,
      dernier_at: e.dernier_at,
      derniere_erreur: e.derniere_erreur,
    },
  };
}

/**
 * Allume / éteint la campagne d'une application. Refuse d'allumer sans prompt
 * `pertinence_<slug>` : le worker s'arrêterait au premier contenu de toute
 * façon, autant le dire tout de suite à l'admin.
 */
export async function piloterBackfillPertinence(
  supabase: Supabase,
  applicationId: string,
  actif: boolean,
): Promise<ResultatBackfillAdmin> {
  const v = await verifierApplicationBackfill(supabase, applicationId);
  if (!v.ok) return v;
  if (actif) {
    const cle = clePromptPertinenceApp(v.app);
    if (!(await chargerPrompt(supabase, cle))) {
      return { ok: false, erreur: `Prompt « ${cle} » manquant : rattrapage impossible` };
    }
  }
  const maintenant = new Date().toISOString();
  await modifierReglageBackfill(supabase, (r) => {
    const suivant = basculerBackfill(r, applicationId, actif, maintenant);
    return suivant === r ? null : suivant;
  });
  return etatBackfillPertinence(supabase, applicationId);
}

export interface ScoringNote {
  prior: number;
  k: number;
  poidsVues: number;
  vuesPlafond: number;
  eloSeuil: number;
  /** Part de la piste du compte source dans la note (`elo_poids_source`). */
  poidsSource?: number;
}

export interface DepsBackfill extends DepsNotation {
  /** Réglages de scoring (`lireScoring` d'import_contenu). */
  lireScoring: () => Promise<ScoringNote>;
  /** Note d'import (`eloParLangue` d'import_contenu), mêmes entrées qu'à l'étape 4. */
  noteImport: (opts: {
    pertinence: number;
    vues: number | null | undefined;
    langue: string;
    langueSource: string;
    prior: number;
    k: number;
    poidsVues?: number;
    vuesPlafond?: number;
    pisteSource?: number | null;
    poidsSource?: number;
  }) => number;
  /**
   * Piste du compte source (`lirePisteSource` d'import_contenu). Sans elle, ou
   * `null` (source inconnue / sans preuve), le terme de piste est désactivé —
   * exactement comme à l'étape 4 pour une source sans piste.
   */
  lirePisteSource?: (compteReferenceId: string | null) => Promise<number | null>;
  maintenant?: () => number;
}

/** Note un contenu du stock pour une application. Ne touche QUE `contenu_pertinences`. */
async function noterContenuBackfill(
  supabase: Supabase,
  contenuId: string,
  app: ApplicationMoteur,
  prompt: string,
  scoring: ScoringNote,
  deps: DepsBackfill,
): Promise<void> {
  const { data: contenu, error } = await supabase
    .from("contenus")
    .select("id, titre, langue_source, vues_source, import_elo_force_seuil, compte_reference_id")
    .eq("id", contenuId)
    .maybeSingle();
  if (error) throw new Error(`Contenu ${contenuId} : ${messageErreur(error)}`);
  if (!contenu) throw new Error(`Contenu ${contenuId} introuvable`);
  const c = contenu as {
    id: string;
    titre: string | null;
    langue_source: string | null;
    vues_source: number | null;
    import_elo_force_seuil: boolean | null;
    compte_reference_id?: string | null;
  };
  const langueSource = c.langue_source ?? "fr";
  // Même note qu'à l'étape 4 de l'import : piste du compte source et son poids
  // compris (sans eux, la note du rattrapage s'écartait de celle de l'import
  // dès que `elo_poids_source` > 0). Piste lue au moment du rattrapage.
  const pisteSource = deps.lirePisteSource
    ? await deps.lirePisteSource(c.compte_reference_id ?? null)
    : null;

  const { data: ligne, error: errLigne } = await supabase
    .from("contenu_langues")
    .select("slides, slides_base")
    .eq("contenu_id", contenuId)
    .eq("langue", langueSource)
    .maybeSingle();
  if (errLigne) throw new Error(`Deck source de ${contenuId} : ${messageErreur(errLigne)}`);

  const { score, reason } = await deps.scoreRelevance({
    caption: c.titre ?? "",
    hookText: accrocheDepuisLigneSource(ligne as LigneLangueBase | null),
    instructions: prompt,
  });
  const stocke = scoreStockable(score);
  const forcee = Boolean(c.import_elo_force_seuil);
  const brute = deps.noteImport({
    pertinence: stocke,
    vues: c.vues_source ?? null,
    langue: langueSource,
    langueSource,
    prior: scoring.prior,
    k: scoring.k,
    poidsVues: scoring.poidsVues,
    vuesPlafond: scoring.vuesPlafond,
    pisteSource,
    poidsSource: scoring.poidsSource,
  });
  // Import forcé : note planchée au seuil, comme côté Sophia (`noteStockee`).
  const note = noteStockee(brute, app.id, scoring.eloSeuil, forcee);
  const { error: errUp } = await supabase.from("contenu_pertinences").upsert(
    {
      contenu_id: contenuId,
      application_id: app.id,
      score: stocke,
      raison: reason,
      note,
      eligible: eligibiliteDepuisNote(note, scoring.eloSeuil, forcee, {
        applicationId: app.id,
        score: stocke,
      }),
      // Colonne héritée des angles de label (abandonnés) : plus alimentée.
      angles: null,
      prompt_cle: clePromptPertinenceApp(app),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "contenu_id,application_id" },
  );
  if (errUp) throw new Error(`Pertinence ${app.slug} de ${contenuId} : ${messageErreur(errUp)}`);
}

export interface TickBackfill {
  action: string;
  /** Le worker peut se remplacer : campagne active et file pas vide. */
  more: boolean;
  applicationId?: string;
  faits?: number;
  erreurs?: number;
}

/**
 * Un passage de rattrapage, pour un worker qui n'a RIEN d'autre à faire (ni
 * scrape, ni pipeline, ni deck source à reprendre). `null` = rien à faire ici
 * (pas de campagne active, ou bail déjà tenu par un autre worker) : le worker
 * passe à la suite (mise à jour des sources).
 *
 * Ne touche jamais `contenus` (statut, tier, pertinence_score) : seulement
 * `contenu_pertinences` et l'état de la campagne.
 */
export async function tickBackfillPertinence(
  supabase: Supabase,
  deps: DepsBackfill,
): Promise<TickBackfill | null> {
  if (!(await schemaMultiAppPret(supabase))) return null;
  const maintenant = deps.maintenant ?? Date.now;
  const debut = maintenant();

  // Lecture simple d'abord : le cas courant (aucune campagne) ne paie pas d'écriture.
  const { reglage } = await lireReglageBackfill(supabase);
  const candidate = applicationBackfillAPrendre(reglage, debut);
  if (!candidate) return null;

  // Campagne allumée mais file vide (tout le stock est noté) : ni bail ni
  // écriture, et la main passe à la mise à jour des sources. Sans ce coup
  // d'œil, chaque worker oisif prenait le bail pour rien et la séquence des
  // sources ne recevait presque plus de tick.
  {
    const { data, error } = await supabase
      .from("contenu_pertinence_manquante")
      .select("contenu_id")
      .eq("application_id", candidate)
      .limit(1);
    if (error) throw new Error(`File du rattrapage : ${messageErreur(error)}`);
    if ((data ?? []).length === 0) return null;
  }

  const pris = await modifierReglageBackfill(supabase, (r) => {
    if (applicationBackfillAPrendre(r, debut) !== candidate) return null;
    return {
      ...r,
      [candidate]: {
        ...etatBackfillApp(r, candidate),
        bail_jusqu_a: new Date(debut + BAIL_BACKFILL_MS).toISOString(),
      },
    };
  });
  if (!pris) return null;

  let faits = 0;
  let erreurs = 0;
  let derniereErreur: string | null = null;
  let arreter = false;
  let file: string[] = [];
  let traites = 0;
  let actifFinal = false;
  try {
    const applications = await chargerApplicationsMoteur(supabase);
    const app = applications.find((a) => a.id === candidate);
    const prompt = app ? await chargerPrompt(supabase, clePromptPertinenceApp(app)) : undefined;
    if (!app || !prompt) {
      // Prompt supprimé en cours de campagne : on s'arrête net plutôt que de
      // noter avec autre chose (jamais de repli sur le texte Sophia).
      arreter = true;
      erreurs += 1;
      derniereErreur = app
        ? `Prompt « ${clePromptPertinenceApp(app)} » manquant : campagne arrêtée`
        : `Application ${candidate} inconnue : campagne arrêtée`;
    } else {
      const scoring = await deps.lireScoring();
      const { data, error } = await supabase
        .from("contenu_pertinence_manquante")
        .select("contenu_id")
        .eq("application_id", candidate)
        .order("created_at", { ascending: false })
        .limit(LOT_BACKFILL);
      if (error) throw new Error(`File du rattrapage : ${messageErreur(error)}`);
      file = ((data ?? []) as Array<{ contenu_id: string }>).map((r) => r.contenu_id);
      for (const contenuId of file) {
        if (maintenant() - debut > BUDGET_BACKFILL_MS) break;
        traites += 1;
        try {
          await noterContenuBackfill(supabase, contenuId, app, prompt, scoring, deps);
          faits += 1;
        } catch (e) {
          erreurs += 1;
          derniereErreur = `${contenuId} : ${messageErreur(e)}`;
          console.warn(`[backfill pertinence] ${app.slug} ${derniereErreur}`);
        }
      }
    }
  } catch (e) {
    erreurs += 1;
    derniereErreur = messageErreur(e);
    console.warn(`[backfill pertinence] ${candidate} ${derniereErreur}`);
  } finally {
    // Compteurs fusionnés dans la valeur FRAÎCHE (l'admin a pu éteindre entre-temps).
    const fin = new Date(maintenant()).toISOString();
    const ecrit = await modifierReglageBackfill(supabase, (r) => {
      const cur = r[candidate];
      if (!cur) return null;
      return {
        ...r,
        [candidate]: {
          ...cur,
          actif: arreter ? false : cur.actif,
          faits: cur.faits + faits,
          erreurs: cur.erreurs + erreurs,
          derniere_erreur: derniereErreur ?? cur.derniere_erreur,
          dernier_at: fin,
          bail_jusqu_a: null,
        },
      };
    }).catch((e) => {
      console.warn(`[backfill pertinence] bail non rendu : ${messageErreur(e)}`);
      return null;
    });
    actifFinal = Boolean(ecrit?.[candidate]?.actif);
  }

  // Se remplacer seulement si ce passage a avancé et que la file n'est
  // visiblement pas vide : un lot plein, ou coupé par le budget. Un lot qui
  // n'aboutit à rien (Gemini en panne) laisse la main au cron.
  const fileRestante = file.length >= LOT_BACKFILL || traites < file.length;
  return {
    action: arreter ? "backfill_pertinence_arret" : "backfill_pertinence",
    more: actifFinal && faits > 0 && fileRestante,
    applicationId: candidate,
    faits,
    erreurs,
  };
}
