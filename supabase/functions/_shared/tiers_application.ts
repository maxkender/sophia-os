/**
 * Tierlist PAR APPLICATION (migration 0270) — applications autres que Sophia.
 *
 * Décision du propriétaire (2026-10-08) : « je ne veux plus de tiers mergés, je
 * veux des tiers différents par application ». Sophia GARDE `contenus.tier &
 * co` et tout le code de `tierlist.ts` (requalification, rappels, repêchage),
 * qui n'est pas touché. Les autres applications vivent ici :
 *
 * - table `contenu_tiers_application` (contenu × application : tier, budget,
 *   cycle, rapport) ;
 * - vue `contenu_application_tier_etat` : mêmes colonnes que
 *   `contenu_tier_etat`, sur les SEULS passages de l'application, plus
 *   `application_id`, `eligible`, `materialise`, `note`. Tant qu'aucune ligne
 *   n'est écrite, le tier d'entrée est déduit de SA note d'import
 *   (`tier_initial_note`, miroir de `tierInitialDepuisNote`) : c'est le tier
 *   « paresseux ». La ligne naît à la première écriture (requalification,
 *   repêchage D, changement manuel) ;
 * - vue `contenu_application_a_requalifier` : cycles terminés seulement.
 *
 * MÊME LOGIQUE, appliquée séparément : `deciderRequalif`, `requalifier`,
 * `passagesPourTier`, les réglages `reglages.tierlist`. Rien ici n'écrit dans
 * `contenus` ni dans `remix_debloques` (pas d'`application_id` sur cette file,
 * et le moteur de remix n'est pas branché) : un S+ hors Sophia ne fait que
 * tracer `remix_en_attente` dans son rapport.
 *
 * TOLÉRANCE DE DÉPLOIEMENT : le code Edge part au merge, 0270 se passe à la
 * main APRÈS. `sonderSchemaTiersApplication` dit si elle est là ; sans elle,
 * l'assignation ne sert aucune autre application (repli Sophia) et l'étape de
 * minuit ne fait rien. Une sonde ILLISIBLE n'est jamais prise pour une absence.
 */
import {
  chargerApplicationsMoteur,
  erreurSchemaAbsent,
} from "./applications_moteur.ts";
import { lireParLots, lireTout } from "./lots.ts";
import { ID_SOPHIA, type ApplicationMoteur } from "./multi_app.ts";
import {
  blocRunTierlist,
  chargerTierlistReglages,
  COLONNES_ETAT,
  deciderRequalif,
  estTier,
  passagesPourTier,
  requalifier,
  verifierCoherenceLecture,
  type AttenteMesureDetail,
  type CoherenceLecture,
  type DecisionRequalif,
  type RequalifDetail,
  type RequalificationResultat,
  type RunTierlist,
  type Tier,
  type TierEtat,
} from "./tierlist.ts";

type Supabase = ReturnType<typeof import("./supabase.ts").serviceClient>;

export const TABLE_TIERS_APPLICATION = "contenu_tiers_application";
export const VUE_TIER_APPLICATION = "contenu_application_tier_etat";
export const VUE_REQUALIF_APPLICATION = "contenu_application_a_requalifier";

/**
 * Échéance de l'étape de minuit `tierlist_applications`. L'étape tourne APRÈS
 * toutes les étapes Sophia (le drain d'assignation est déjà lancé) : l'échéance
 * ne protège plus le drain, elle borne la durée de l'appel de minuit. Elle est
 * contrôlée avant CHAQUE lecture et chaque écriture d'une application
 * (comptage, chaque page, titres, chaque contenu) ; ce qui n'est pas requalifié
 * dans ce délai repasse la nuit suivante.
 */
export const ECHEANCE_TIERS_APPLICATIONS_MS = 20_000;

/** Échéance dépassée avant une lecture ou une écriture : l'application s'arrête là. */
class EcheanceDepassee extends Error {
  constructor() {
    super("échéance de l'étape tierlist_applications dépassée");
    this.name = "EcheanceDepassee";
  }
}

function controlerEcheance(echeance: number | undefined): void {
  if (echeance !== undefined && Date.now() > echeance) throw new EcheanceDepassee();
}

/** Colonnes lues sur les vues par application (celles de Sophia, puis les siennes). */
export const COLONNES_ETAT_APPLICATION =
  `${COLONNES_ETAT}, application_id, eligible, materialise, note`;

// ---------------------------------------------------------------------------
// Sonde de la migration 0270
// ---------------------------------------------------------------------------

export type EtatSchemaTiers = "pret" | "absent" | "illisible";

/**
 * Durée de vie d'un « 0270 absente ». Un « présente » vaut pour toute la vie de
 * l'isolate : la migration est additive, et son retour arrière impose
 * d'éteindre d'abord toute application non-Sophia.
 */
const TTL_SONDE_ABSENTE_MS = 5 * 60 * 1000;
let sonde: { pret: boolean; at: number } | null = null;

async function lireSonde(
  supabase: Supabase,
): Promise<{ pret: boolean } | { illisible: string }> {
  // GET bornés, JAMAIS HEAD (voir `applications_moteur.ts` : sur une relation
  // absente, postgrest-js transforme « 404 sans corps » en succès). La TABLE
  // (partie A) puis la VUE (partie B) : « prête » exige les deux, donc le
  // filtre Sophia de `contenu_tier_etat` en place, B étant atomique.
  const lectures = [
    () => supabase.from(TABLE_TIERS_APPLICATION).select("contenu_id").limit(1),
    () => supabase.from(VUE_TIER_APPLICATION).select("contenu_id, materialise").limit(1),
  ];
  for (const lecture of lectures) {
    const { error, status } = await lecture();
    if (!error && status !== 404) continue;
    if (erreurSchemaAbsent(error, status)) return { pret: false };
    return { illisible: error?.message || `HTTP ${status}` };
  }
  return { pret: true };
}

/**
 * État de la migration 0270, sans jamais lever (mêmes règles que la sonde 0256) :
 *
 * - `pret` : mémorisé pour toute la vie de l'isolate ;
 * - `absent` (table ou vue inconnue) : revérifié toutes les 5 min ;
 * - `illisible` (réseau, 5xx, PGRST000–003 — après une seconde tentative) :
 *   JAMAIS mémorisé. À l'appelant de décider : l'assignation fait rejouer le
 *   compte, la nuit saute l'étape avec un avertissement.
 */
export async function sonderSchemaTiersApplication(
  supabase: Supabase,
): Promise<EtatSchemaTiers> {
  const maintenant = Date.now();
  if (sonde?.pret) return "pret";
  if (sonde && maintenant - sonde.at < TTL_SONDE_ABSENTE_MS) return "absent";

  let r = await lireSonde(supabase);
  if ("illisible" in r) {
    await new Promise((ok) => setTimeout(ok, 500));
    r = await lireSonde(supabase);
  }
  if ("illisible" in r) {
    console.warn(`[tiers-app] sonde du schéma 0270 illisible : ${r.illisible}`);
    return "illisible";
  }
  if (!r.pret) {
    console.warn("[tiers-app] schéma 0270 absent : aucune application non-Sophia servie");
  }
  sonde = { pret: r.pret, at: maintenant };
  return r.pret ? "pret" : "absent";
}

/** Pour les tests : oublie la sonde. */
export function oublierSondeTiersApplication(): void {
  sonde = null;
}

// ---------------------------------------------------------------------------
// Lectures / écritures de l'état par application
// ---------------------------------------------------------------------------

/** Ligne de `contenu_application_tier_etat` (ou de la vue de requalification). */
export interface EtatTierApplication extends TierEtat {
  application_id: string;
  /** Une ligne existe dans `contenu_tiers_application`. Sinon : tier paresseux. */
  materialise: boolean;
  /** `contenu_pertinences.eligible` : dans la réserve de l'application. */
  eligible: boolean;
  /** Note d'import de l'application (`contenu_pertinences.note`). */
  note: number | null;
}

/** Ce que le tirage lit de l'état d'une application (`lireEtatsTierApplication`). */
export type EtatTirageApplication = Pick<
  EtatTierApplication,
  | "contenu_id"
  | "application_id"
  | "tier"
  | "tier_cycle"
  | "passages_prevus"
  | "restants"
  | "materialise"
  | "eligible"
  | "note"
>;

/**
 * État tierlist de ces contenus pour UNE application. Une ligne par couple
 * (contenu, application) au plus : un lot de 100 contenus ne peut pas rendre
 * plus de 100 lignes, le découpage du filtre borne aussi la réponse. L'erreur
 * REMONTE : un état illisible ne doit pas passer pour un pool vide.
 */
export async function lireEtatsTierApplication(
  supabase: Supabase,
  applicationId: string,
  contenuIds: string[],
): Promise<EtatTirageApplication[]> {
  return await lireParLots<EtatTirageApplication>(
    contenuIds,
    `État tierlist (application ${applicationId})`,
    (lot) =>
      supabase
        .from(VUE_TIER_APPLICATION)
        .select(
          "contenu_id, application_id, tier, tier_cycle, passages_prevus, restants, materialise, eligible, note",
        )
        .eq("application_id", applicationId)
        .in("contenu_id", lot),
  );
}

/**
 * Écrit l'état PARESSEUX courant (tier d'entrée déduit de la note, cycle 0)
 * dans `contenu_tiers_application`, AVANT la première vraie écriture. Avec
 * `ignoreDuplicates` : une ligne écrite entre-temps (repêchage, admin, autre
 * run) reste telle quelle — l'écriture qui suit est gardée par `tier_cycle`.
 */
export async function materialiserTierApplication(
  supabase: Supabase,
  e: Pick<EtatTierApplication, "contenu_id" | "application_id" | "tier" | "passages_prevus" | "note">,
): Promise<void> {
  const tier: Tier = estTier(e.tier) ? e.tier : "D";
  const { error } = await supabase.from(TABLE_TIERS_APPLICATION).upsert(
    {
      contenu_id: e.contenu_id,
      application_id: e.application_id,
      tier,
      passages_prevus: e.passages_prevus,
      tier_cycle: 0,
      tier_rapport: {
        origine: "entree_paresseuse",
        note: e.note ?? null,
        tier,
        passages: e.passages_prevus,
      },
    },
    { onConflict: "contenu_id,application_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Requalification (minuit, étape `tierlist_applications`)
// ---------------------------------------------------------------------------

/** Détail d'une requalification hors Sophia : jamais de remix débloqué. */
export interface RequalifDetailApplication extends RequalifDetail {
  /** S+ sur mesure : remix qui auraient été débloqués (file non branchée). */
  remixEnAttente?: number;
}

export interface ResultatApplication extends RequalificationResultat {
  details: RequalifDetailApplication[];
  /** Échéance dépassée : le reste repasse la nuit suivante. */
  interrompu: boolean;
  /** UPDATE gardé par `tier_cycle` qui n'a rien touché : requalifié ailleurs. */
  dejaRequalifies: number;
  /** L'application a levé ; les suivantes ont tourné quand même. */
  erreur?: string;
}

export interface RequalificationApplications {
  etat: EtatSchemaTiers;
  /** slug → résultat. Vide tant que la sonde ne dit pas « prête ». */
  parApplication: Record<string, ResultatApplication>;
}

function resultatVide(coherence: CoherenceLecture): ResultatApplication {
  return {
    examines: 0,
    requalifies: 0,
    enAttente: 0,
    sansMesure: 0,
    remixDebloques: 0,
    details: [],
    attentesMesure: [],
    coherence,
    repli: false,
    interrompu: false,
    dejaRequalifies: 0,
  };
}

/** Témoin de complétude, comme `compterCyclesTermines` : un échec rend `null`. */
async function compterCyclesTerminesApplication(
  supabase: Supabase,
  applicationId: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from(VUE_REQUALIF_APPLICATION)
    .select("contenu_id", { count: "exact", head: true })
    .eq("application_id", applicationId);
  if (error || typeof count !== "number") return null;
  return count;
}

/**
 * Lecture du run complet d'UNE application : comptage AVANT (les UPDATE font
 * sortir les contenus de la vue), puis pagination keyset sur `contenu_id` —
 * unique à application fixée (clé primaire de `contenu_pertinences`).
 */
async function lireCyclesTerminesApplication(
  supabase: Supabase,
  app: ApplicationMoteur,
  echeance: number | undefined,
): Promise<{ etats: EtatTierApplication[]; coherence: CoherenceLecture }> {
  controlerEcheance(echeance);
  const attendues = await compterCyclesTerminesApplication(supabase, app.id);
  const etats = await lireTout<EtatTierApplication>(
    `Requalification ${app.slug} — cycles terminés`,
    async (curseur, taille) => {
      // Avant chaque page : une échéance dépassée n'attend pas la fin du stock.
      controlerEcheance(echeance);
      let q = supabase
        .from(VUE_REQUALIF_APPLICATION)
        .select(COLONNES_ETAT_APPLICATION)
        .eq("application_id", app.id)
        .order("contenu_id", { ascending: true })
        .limit(taille);
      if (curseur) q = q.gt("contenu_id", curseur.contenu_id);
      const { data, error } = await q;
      return { data: (data ?? null) as EtatTierApplication[] | null, error };
    },
    { ancre: (e) => e.contenu_id },
  );
  return {
    etats,
    coherence: verifierCoherenceLecture(etats.length, attendues, undefined, VUE_REQUALIF_APPLICATION),
  };
}

/**
 * Clic admin « requalifier maintenant » : la vue COMPLÈTE, pas celle de
 * dégrossissage — un cycle non terminé doit afficher son attente, pas
 * disparaître (même raison que `lireUnContenu` côté Sophia).
 */
async function lireUnContenuApplication(
  supabase: Supabase,
  app: ApplicationMoteur,
  contenuId: string,
): Promise<{ etats: EtatTierApplication[]; coherence: CoherenceLecture }> {
  const { data, error } = await supabase
    .from(VUE_TIER_APPLICATION)
    .select(COLONNES_ETAT_APPLICATION)
    .eq("application_id", app.id)
    .eq("contenu_id", contenuId)
    .maybeSingle();
  if (error) throw error;
  return {
    etats: data ? [data as EtatTierApplication] : [],
    coherence: verifierCoherenceLecture(
      data ? 1 : 0,
      null,
      "lecture ciblée d'un seul contenu, sans objet",
      VUE_TIER_APPLICATION,
    ),
  };
}

/**
 * Requalifie, application par application (hors Sophia), les contenus dont le
 * cycle de CETTE application est terminé. Même décision et même barème que
 * `requalifierContenus` (Sophia) — mêmes fonctions pures, mêmes réglages —,
 * appliqués aux vues et à la table de l'application.
 *
 * - Sonde 0270 autre que « prête » : rien n'est fait, l'état est rendu.
 * - Applications INACTIVES comprises : un cycle publié avant la désactivation
 *   doit pouvoir se terminer.
 * - Chaque application est isolée : une erreur est rendue dans SON résultat,
 *   les suivantes tournent.
 * - Écriture contenu par contenu : matérialisation de l'état paresseux s'il le
 *   faut, puis UPDATE gardé par `tier_cycle` avec `.select` — 0 ligne touchée =
 *   requalifié ailleurs entre-temps (`dejaRequalifies`), pas compté.
 * - `echeance` (epoch ms) vérifiée avant chaque lecture (comptage, chaque page,
 *   titres) et avant chaque contenu écrit : dépassée, l'application s'arrête
 *   (`interrompu`, sans erreur), les suivantes aussi, et le reste repasse la
 *   nuit suivante. Seules la sonde, la liste des applications et les réglages
 *   (trois petites lectures, la sonde « prête » étant mémorisée) la précèdent.
 * - N'écrit JAMAIS dans `contenus` ni dans `remix_debloques`.
 */
export async function requalifierApplications(
  supabase: Supabase,
  opts: {
    dryRun?: boolean;
    contenuId?: string | null;
    applicationId?: string | null;
    echeance?: number;
  } = {},
): Promise<RequalificationApplications> {
  const etat = await sonderSchemaTiersApplication(supabase);
  if (etat !== "pret") return { etat, parApplication: {} };
  if (opts.applicationId === ID_SOPHIA) {
    throw new Error("Sophia se requalifie par l'étape tierlist (contenus.tier), pas par application");
  }

  const applications = (await chargerApplicationsMoteur(supabase)).filter((a) =>
    a.id !== ID_SOPHIA && (!opts.applicationId || a.id === opts.applicationId)
  );
  if (opts.applicationId && applications.length === 0) {
    throw new Error(`application ${opts.applicationId} inconnue`);
  }
  const reglages = await chargerTierlistReglages(supabase);
  const dryRun = Boolean(opts.dryRun);
  const parApplication: Record<string, ResultatApplication> = {};

  for (const app of applications) {
    const res = resultatVide(verifierCoherenceLecture(0, null, "lecture non faite", VUE_REQUALIF_APPLICATION));
    parApplication[app.slug] = res;
    try {
      const lecture = opts.contenuId
        ? await lireUnContenuApplication(supabase, app, opts.contenuId)
        : await lireCyclesTerminesApplication(supabase, app, opts.echeance);
      res.examines = lecture.etats.length;
      res.coherence = lecture.coherence;
      await requalifierLesEtats(supabase, app, lecture.etats, res, {
        dryRun,
        echeance: opts.echeance,
        reglages,
      });
    } catch (e) {
      if (e instanceof EcheanceDepassee) {
        // Pas une erreur : ce qui est écrit l'est, le reste passe demain.
        res.interrompu = true;
        continue;
      }
      res.erreur = e instanceof Error ? e.message : String(e);
      console.error(`[tiers-app] requalification ${app.slug} en échec : ${res.erreur}`);
    }
  }
  return { etat, parApplication };
}

async function requalifierLesEtats(
  supabase: Supabase,
  app: ApplicationMoteur,
  etats: EtatTierApplication[],
  res: ResultatApplication,
  args: {
    dryRun: boolean;
    echeance?: number;
    reglages: Awaited<ReturnType<typeof chargerTierlistReglages>>;
  },
): Promise<void> {
  const { reglages } = args;
  type Mur = { etat: EtatTierApplication; decision: Extract<DecisionRequalif, { requalifier: true }> };
  const mursOk: Mur[] = [];
  const attentes: EtatTierApplication[] = [];
  const maintenantMs = Date.now();
  for (const e of etats) {
    const decision = deciderRequalif({
      publies: e.publies,
      passagesPrevus: e.passages_prevus,
      mesures: e.mesures ?? 0,
      introuvables: e.introuvables ?? 0,
      enAttenteMesure: e.en_attente_mesure ?? 0,
      moyenne: e.moyenne_vues ?? null,
      dernierPublieMs: e.dernier_publie_at ? Date.parse(e.dernier_publie_at) : Number.NaN,
      maintenantMs,
      reculJours: reglages.reculJours,
      requalifMaxJours: reglages.requalifMaxJours,
    });
    if (!decision.requalifier) {
      res.enAttente += 1;
      if (decision.motif === "mesure") attentes.push(e);
      continue;
    }
    mursOk.push({ etat: e, decision });
  }
  if (mursOk.length === 0 && attentes.length === 0) return;

  // Titres : NON fatal, comme côté Sophia — ils ne décident de rien. Lecture
  // seule de `contenus` (jamais d'écriture). Échéance contrôlée avant.
  controlerEcheance(args.echeance);
  const ids = [...mursOk.map((m) => m.etat.contenu_id), ...attentes.map((e) => e.contenu_id)];
  let titreParId = new Map<string, string>();
  try {
    const titres = await lireParLots<{ id: string; titre: string | null }>(
      ids,
      `Requalification ${app.slug} — titres des contenus`,
      (lot) => supabase.from("contenus").select("id, titre").in("id", lot),
    );
    titreParId = new Map(titres.map((c) => [c.id, c.titre ?? ""]));
  } catch (e) {
    console.warn(
      `[tiers-app] titres illisibles (${app.slug}, ${ids.length} id) : ` +
        `${e instanceof Error ? e.message : String(e)} — requalification faite, titres vides.`,
    );
  }

  for (const e of attentes) {
    const attente: AttenteMesureDetail = {
      contenuId: e.contenu_id,
      titre: titreParId.get(e.contenu_id) ?? "",
      tier: e.tier,
      publies: e.publies,
      introuvables: e.introuvables ?? 0,
      enAttenteMesure: e.en_attente_mesure ?? 0,
      dernierPublieAt: e.dernier_publie_at,
    };
    res.attentesMesure.push(attente);
  }

  for (const { etat: e, decision } of mursOk) {
    if (!estTier(e.tier)) continue;
    controlerEcheance(args.echeance);
    const moyenne = Number(e.moyenne_vues ?? 0);
    const maxVues = Number(e.max_vues ?? 0);
    const verdict = decision.surMesure
      ? requalifier({ tier: e.tier, moyenne, maxVues, nb150k: e.nb_150k ?? 0 })
      : {
        tier: e.tier,
        regle: decision.motif === "introuvable"
          ? `aucune mesure possible (${e.introuvables ?? 0} post(s) introuvable(s)) — cycle relancé au même rang`
          : `aucune vue relevée après ${reglages.requalifMaxJours} j — cycle relancé au même rang`,
      };
    const passages = passagesPourTier(verdict.tier);
    const cycle = e.tier_cycle + 1;
    // S+ sur mesure : côté Sophia, des remix seraient débloqués. Ici, seulement
    // tracés — `remix_debloques` n'a pas d'application et son UNIQUE
    // (contenu_id, tier_cycle) entrerait en collision avec les cycles Sophia.
    const remixEnAttente = decision.surMesure && verdict.tier === "S+"
      ? reglages.remixParRequalif
      : 0;

    const detail: RequalifDetailApplication = {
      contenuId: e.contenu_id,
      titre: titreParId.get(e.contenu_id) ?? "",
      avant: e.tier,
      apres: verdict.tier,
      moyenne,
      maxVues,
      passages,
      regle: verdict.regle,
      remix: 0,
      ...(decision.surMesure ? {} : { sansMesure: decision.motif }),
      ...(remixEnAttente > 0 ? { remixEnAttente } : {}),
    };

    const rapport: Record<string, unknown> = {
      avant: e.tier,
      apres: verdict.tier,
      regle: verdict.regle,
      nb_150k: e.nb_150k ?? 0,
      passages_mesures: e.publies,
      cycle,
      application: app.slug,
    };
    if (decision.surMesure) {
      rapport.m = Math.round(moyenne);
      rapport.max_vues = maxVues;
    } else {
      rapport.sans_mesure = decision.motif;
    }
    if (remixEnAttente > 0) rapport.remix_en_attente = remixEnAttente;

    if (!args.dryRun) {
      if (!e.materialise) await materialiserTierApplication(supabase, e);
      const maintenant = new Date().toISOString();
      const { data, error } = await supabase
        .from(TABLE_TIERS_APPLICATION)
        .update({
          tier: verdict.tier,
          passages_prevus: passages,
          tier_cycle: cycle,
          tier_maj_at: maintenant,
          tier_rapport: rapport,
          updated_at: maintenant,
        })
        .eq("contenu_id", e.contenu_id)
        .eq("application_id", app.id)
        // Garde-fou concurrence : personne d'autre n'a fait tourner le cycle.
        .eq("tier_cycle", e.tier_cycle)
        .select("contenu_id");
      if (error) throw error;
      if (((data ?? []) as unknown[]).length === 0) {
        res.dejaRequalifies += 1;
        continue;
      }
    }

    res.requalifies += 1;
    if (!decision.surMesure) res.sansMesure += 1;
    res.details.push(detail);
  }
}

/** Bloc d'une application dans `reglages.tierlist_applications_dernier_run`. */
export interface RunTierlistApplication extends RunTierlist {
  interrompu: boolean;
  dejaRequalifies: number;
  erreur: string | null;
}

/** `blocRunTierlist` application par application, plus interruption et erreur. */
export function blocRunTierlistApplications(
  res: RequalificationApplications,
  maintenant: Date = new Date(),
): Record<string, RunTierlistApplication> {
  const out: Record<string, RunTierlistApplication> = {};
  for (const [slug, r] of Object.entries(res.parApplication)) {
    out[slug] = {
      ...blocRunTierlist(r, maintenant),
      interrompu: r.interrompu,
      dejaRequalifies: r.dejaRequalifies,
      erreur: r.erreur ?? null,
    };
  }
  return out;
}
