/**
 * Multi-applications côté admin : décisions pures des écrans Pilotage,
 * Prompts et Analytics (bascule d'une application sur un label, langues
 * ciblées, prompts requis avant activation, regroupement des replis).
 *
 * Rien ici ne lit la base : les écrans branchent ces fonctions sur
 * `apiMultiApp.ts`, et les tests les couvrent sans client Supabase.
 */
import type { RepliApplication, RunTiersApplications } from "../apiMultiApp";
import { clePromptPertinence, clePromptPlacement } from "../applications";
import { applicationsDuLabel, type LienLabelApplication } from "../multiApp";

/**
 * L'erreur vient-elle d'un objet de schéma absent (migration 0256 pas encore
 * passée) ? Le front part sur Vercel au merge alors que les migrations
 * s'appliquent à la main, parfois plus tard : pendant cet intervalle, une
 * table, une vue ou une colonne neuve répond par l'une de ces erreurs, et
 * l'écran doit retomber sur le comportement d'avant au lieu de casser.
 *
 * - 42703 / 42P01 : colonne / relation inconnue (Postgres) ;
 * - PGRST204 / PGRST205 : colonne / table absente du cache de schéma ;
 * - PGRST200 : relation (embed) introuvable.
 *
 * Une PANNE n'est jamais une absence (même règle que `erreurSchemaAbsent` côté
 * Edge) : un statut ≥ 500, ou les codes PGRST000 à PGRST003 — dont le 503
 * PGRST002 « Could not query the database for the schema cache » que rend
 * PostgREST quand la base ne répond plus. Son message parle du cache de
 * schéma : l'ancienne règle (« schema cache » quelque part) y lisait « avant
 * 0256 » et affichait, pour un compte 100 % Unswipe, le diagnostic du pool
 * Sophia. Le message ne compte que s'il dit qu'une table, une colonne ou une
 * relation n'existe pas.
 */
export function estErreurSchemaAbsent(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, message, status } = err as { code?: unknown; message?: unknown; status?: unknown };
  if (typeof status === "number" && status >= 500) return false;
  const c = String(code ?? "");
  if (/^PGRST00[0-3]$/.test(c)) return false;
  if (["42703", "42P01", "PGRST200", "PGRST204", "PGRST205"].includes(c)) return true;
  return /(relation|column) .* does not exist|could not find the .*(column|table|relation)|could not find a relationship/i
    .test(String(message ?? ""));
}

/** Le label n'a aucune ligne `label_applications` : il sert Sophia par héritage. */
export function labelImplicite(
  labelId: string,
  liens: readonly LienLabelApplication[],
): boolean {
  return !liens.some((l) => l.label_id === labelId);
}

export type BasculeApplicationLabel =
  | { ok: true; applications: string[] }
  | { ok: false; raison: "derniere" };

/**
 * Ensemble EXPLICITE d'applications après un clic sur une puce.
 *
 * On part de ce que le label sert réellement, héritage compris : un label sans
 * ligne sert Sophia, donc cocher Unswipe dessus écrit {Sophia, Unswipe} et pas
 * {Unswipe} seul — sinon le premier clic retirerait Sophia en silence et
 * viderait son stock sur ce label. Retirer la dernière application est refusé :
 * le label retomberait sur Sophia par héritage, ce qui n'est pas ce que l'admin
 * a demandé en décochant Sophia.
 */
export function basculerApplicationLabel(
  labelId: string,
  liens: readonly LienLabelApplication[],
  applicationId: string,
): BasculeApplicationLabel {
  const actuelles = applicationsDuLabel(labelId, liens);
  if (actuelles.includes(applicationId)) {
    const suivantes = actuelles.filter((a) => a !== applicationId);
    if (suivantes.length === 0) return { ok: false, raison: "derniere" };
    return { ok: true, applications: suivantes };
  }
  return { ok: true, applications: [...actuelles, applicationId].sort() };
}

/**
 * Langues ciblées après le clic sur une case. `null` = toutes : c'est aussi ce
 * qu'on écrit quand toutes les cases sont cochées, pour qu'une langue ajoutée
 * plus tard à `LANGUES_CIBLES` soit servie d'office. Une liste vide est
 * permise : l'application n'est alors servie nulle part (préparation avant
 * lancement). Les langues inconnues du front, posées en base, sont gardées.
 */
export function languesApresBascule(
  actuelles: readonly string[] | null,
  langue: string,
  toutes: readonly string[],
): string[] | null {
  const choisies = new Set(actuelles ?? toutes);
  if (choisies.has(langue)) choisies.delete(langue);
  else choisies.add(langue);
  const connues = toutes.filter((l) => choisies.has(l));
  const autres = [...choisies].filter((l) => !toutes.includes(l)).sort();
  if (autres.length === 0 && connues.length === toutes.length) return null;
  return [...connues, ...autres];
}

/** La langue est-elle ciblée ? (`null` = toutes). */
export function langueCiblee(langues: readonly string[] | null, langue: string): boolean {
  return langues === null || langues.includes(langue);
}

/** Clés de prompt qu'une application non-Sophia doit avoir avant d'être activée. */
export function clesPromptsApplication(slug: string): [string, string] {
  return [clePromptPertinence(slug), clePromptPlacement(slug)];
}

/**
 * Prompts manquants (absents ou vides) pour activer l'application. Le moteur
 * ne retombe JAMAIS sur le texte Sophia : activer sans eux ferait échouer
 * chaque notation et chaque deck de cette application, en boucle.
 */
export function promptsManquants(
  slug: string,
  contenus: Readonly<Record<string, string | null | undefined>>,
): string[] {
  return clesPromptsApplication(slug).filter((cle) => !(contenus[cle] ?? "").trim());
}

/** Avancement du rattrapage (0–100), `null` tant qu'il n'y a rien à mesurer. */
export function avancementBackfill(etat: { restants: number; faits: number } | null | undefined): number | null {
  if (!etat) return null;
  const total = etat.restants + etat.faits;
  if (total <= 0) return null;
  return Math.round((etat.faits * 100) / total);
}

/**
 * Jour calendaire Paris (YYYY-MM-DD) d'il y a `jours` jours — même horloge que
 * minuit et l'assignation, qui datent les passages en heure de Paris.
 */
export function jourParisIlYa(jours: number, maintenant: Date = new Date()): string {
  const d = new Date(maintenant.getTime() - jours * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
}

export interface MotifRepli {
  application_visee_id: string;
  motif: string | null;
  n: number;
  /** Date de publication prévue la plus récente de ce motif. */
  dernier: string | null;
}

export interface ReplisCompte {
  compte_id: string;
  handle: string | null;
  persona: string | null;
  langue: string | null;
  total: number;
  motifs: MotifRepli[];
}

/**
 * Replis regroupés par compte puis par (application visée, motif). Un compte
 * qui retombe dix fois sur Sophia pour « réserve vide » se lit en une ligne,
 * pas en dix : c'est le label à sourcer qui intéresse, pas chaque créneau.
 * Comptes les plus touchés d'abord.
 */
export function grouperReplis(replis: readonly RepliApplication[]): ReplisCompte[] {
  const parCompte = new Map<string, ReplisCompte>();
  for (const r of replis) {
    let groupe = parCompte.get(r.compte_id);
    if (!groupe) {
      groupe = {
        compte_id: r.compte_id,
        handle: r.compte?.handle_tiktok ?? null,
        persona: r.compte?.persona_nom ?? null,
        langue: r.compte?.langue ?? null,
        total: 0,
        motifs: [],
      };
      parCompte.set(r.compte_id, groupe);
    }
    groupe.total += 1;
    const motif = r.repli_motif?.trim() || null;
    let ligne = groupe.motifs.find(
      (m) => m.application_visee_id === r.application_visee_id && m.motif === motif,
    );
    if (!ligne) {
      ligne = { application_visee_id: r.application_visee_id, motif, n: 0, dernier: null };
      groupe.motifs.push(ligne);
    }
    ligne.n += 1;
    const date = r.date_publication_prevue;
    if (date && (!ligne.dernier || date > ligne.dernier)) ligne.dernier = date;
  }
  const groupes = [...parCompte.values()];
  for (const g of groupes) g.motifs.sort((a, b) => b.n - a.n || (a.motif ?? "").localeCompare(b.motif ?? ""));
  return groupes.sort(
    (a, b) => b.total - a.total || (a.handle ?? a.compte_id).localeCompare(b.handle ?? b.compte_id),
  );
}

/** Clé react-query du run `tierlist_applications` (page Minuit, carte Applications). */
export const CLE_RUN_TIERS_APPLICATIONS = ["tierlist-applications-dernier-run"] as const;

/** Ligne d'une application dans le résumé du run `tierlist_applications` (0270). */
export interface LigneRunTiersApplication {
  slug: string;
  at: string | null;
  examines: number;
  requalifies: number;
  alerte: string | null;
  erreur: string | null;
  interrompu: boolean;
}

function lignesRun(run: RunTiersApplications): LigneRunTiersApplication[] {
  return Object.entries(run.applications ?? {}).map(([slug, b]) => ({
    slug,
    at: b?.at ?? null,
    examines: Number(b?.examines ?? 0),
    requalifies: Number(b?.requalifies ?? 0),
    alerte: b?.alerte ?? null,
    erreur: b?.erreur ?? null,
    interrompu: Boolean(b?.interrompu),
  }));
}

/**
 * Page Minuit : ce que la tierlist PAR APPLICATION a fait CE jour-là, mais
 * seulement s'il y a quelque chose à dire (des cycles examinés, une alerte,
 * une erreur, une interruption, une sonde 0270 illisible). Sinon `null` : la
 * page reste celle d'avant tant qu'aucune autre application ne tourne.
 */
export function resumeRunTiersApplications(
  run: RunTiersApplications | null | undefined,
  jour: string,
): { illisible: boolean; erreur: string | null; lignes: LigneRunTiersApplication[] } | null {
  if (!run || run.jour !== jour) return null;
  const lignes = lignesRun(run).filter(
    (l) => l.examines > 0 || l.alerte !== null || l.erreur !== null || l.interrompu,
  );
  const illisible = run.etat === "illisible";
  const erreur = run.erreur ?? null;
  if (lignes.length === 0 && !illisible && !erreur) return null;
  return { illisible, erreur, lignes };
}

/**
 * Carte Applications : dernière requalification de CETTE application (0270).
 * `rouge` dès qu'une alerte ou une erreur est présente — y compris une erreur
 * de l'étape entière, qui vaut pour toutes les applications. `null` quand le
 * run ne la connaît pas (0270 absente, ou application jamais requalifiée).
 */
export function derniereRequalifApplication(
  run: RunTiersApplications | null | undefined,
  slug: string,
): (LigneRunTiersApplication & { jour: string; rouge: boolean }) | null {
  if (!run) return null;
  const ligne = lignesRun(run).find((l) => l.slug === slug);
  if (!ligne) {
    if (!run.erreur) return null;
    return {
      slug,
      at: run.at ?? null,
      examines: 0,
      requalifies: 0,
      alerte: null,
      erreur: run.erreur,
      interrompu: false,
      jour: run.jour,
      rouge: true,
    };
  }
  return {
    ...ligne,
    jour: run.jour,
    rouge: ligne.alerte !== null || ligne.erreur !== null || Boolean(run.erreur),
  };
}
