/**
 * Test à blanc — mode « contenus » : la NOTATION et le PLACEMENT d'une
 * application autre que Sophia, sur 1 à 3 slideshows choisis, sans rien écrire.
 *
 * But : avant d'allumer le rattrapage de pertinence d'une application sur tout
 * un label, en voir le résultat sur quelques slideshows. Pour chacun, dans le
 * contexte du test (a_blanc_intercepteur.ts : lectures réelles, écritures
 * simulées dans le calque, IA seulement vers l'API du modèle, plafonnée) :
 *
 *  a) PERTINENCE — le VRAI `noterContenuBackfill` (pertinence_apps.ts), avec
 *     les mêmes dépendances que le rattrapage réel (import-contenu/index.ts :
 *     `scoreRelevance`, `lireScoring`, `eloParLangue`, `lirePisteSource`).
 *     Son upsert `contenu_pertinences` est simulé ; la ligne est RELUE à
 *     travers le calque, puis expliquée (seuil, plancher hors Sophia) ;
 *  b) TIER D'ENTRÉE — celui que la vue `contenu_application_tier_etat` donne
 *     à une ligne neuve : `tierInitialDepuisNote(note)` si éligible, D / 0
 *     sinon ;
 *  c) PLACEMENT — le VRAI `assurerDeckApplication` (deck_application.ts) avec
 *     `ignorerCache` : le cache `contenu_langue_decks` est ignoré pour tester
 *     le prompt de placement ACTUEL. Lancé même pour un contenu non éligible
 *     (dit dans le résultat). Base, deck final, slide pub, position imposée
 *     par un concurrent : relus dans le calque et dans le journal du test.
 *
 * Aucune fonction partagée n'est modifiée par ce module : il n'ajoute que
 * l'option `ignorerCache` (absente ailleurs) et appelle le code tel quel.
 */

import { clePromptPlacement } from "./applications.ts";
import { chargerApplicationsMoteur, schemaMultiAppPret } from "./applications_moteur.ts";
import { assurerDeckApplication, type DeckApplicationResultat } from "./deck_application.ts";
import { baseDeTraduction, type LigneLangueBase } from "./deck_langue.ts";
import { scoreRelevance } from "./gemini.ts";
import { eloParLangue, lirePisteSource, lireScoring, type SlideLangue } from "./import_contenu.ts";
import { type ApplicationMoteur, ID_SOPHIA, SLUG_SOPHIA } from "./multi_app.ts";
import {
  clePromptPertinenceApp,
  type DepsBackfill,
  noterContenuBackfill,
  PERTINENCE_MIN_HORS_SOPHIA,
  pertinenceSuffisante,
  type ScoringNote,
} from "./pertinence_apps.ts";
import { chargerPrompt, messageErreur } from "./supabase.ts";
import { passagesPourTier, type Tier, tierInitialDepuisNote } from "./tierlist.ts";
import { raisonRefusIA } from "./a_blanc_execution.ts";
import {
  avecSuivi,
  type ContexteABlanc,
  type EtatABlanc,
  intercepteurActif,
  type MotifBlocage,
  type OperationEcriture,
  type SuiviIA,
} from "./a_blanc_intercepteur.ts";

type Supabase = Parameters<typeof assurerDeckApplication>[0];

/** Slideshows testés au plus par appel. */
export const MAX_CONTENUS_A_BLANC = 3;

/**
 * Appels IA autorisés PAR contenu dans ce mode. Un contenu coûte au plus,
 * sans incident : 1 notation + 1 traduction + 4 essais de placement + 1 jeu de
 * hashtags = 7 appels. Le plafond par défaut du test (30) suffit pour 3, mais
 * chaque appel peut en coûter deux quand le premier modèle de la liste échoue
 * (repli sur le suivant) : 15 par contenu garde cette marge sans la donner à
 * l'assignation d'un compte, dont le plafond reste 30.
 */
export const PLAFOND_IA_PAR_CONTENU = 15;

/**
 * Au-delà, on n'entame plus d'étape coûteuse (traduction, essai de placement) :
 * le test rend son résultat avant le mur des fonctions Edge (150 s).
 */
export const BUDGET_CONTENUS_MS = 110_000;

export type MotifNonEligible = "pertinence_sous_plancher" | "note_sous_seuil";

export interface SlideTestee {
  position: number;
  texte: string;
  pub: boolean;
}

export interface PertinenceTestee {
  promptCle: string;
  score: number | null;
  raison: string | null;
  /** Texte envoyé au modèle comme accroche (première slide sans pub de la langue source). */
  accroche: string | null;
  note: number | null;
  /** Seuil d'import (`elo_seuil_import`). */
  seuil: number;
  /** Pertinence minimum hors Sophia (PERTINENCE_MIN_HORS_SOPHIA). */
  plancher: number;
  eligible: boolean;
  motifs: MotifNonEligible[];
  /** Import forcé (`import_elo_force_seuil`) : note planchée au seuil. */
  forcee: boolean;
  /** Tier d'entrée dans le pool de l'application (D si non éligible). */
  tier: Tier;
  passages: number;
  /** Ligne réellement en base avant le test (null : jamais noté pour cette application). */
  enBase: { score: number | null; note: number | null; eligible: boolean } | null;
  appelsIA: SuiviIA;
  erreur?: string;
}

export interface DeckTeste {
  promptCle: string;
  statut: DeckApplicationResultat["statut"];
  raison: string | null;
  /** Deck de la langue AVANT placement (sans pub). */
  base: SlideTestee[];
  /** Deck final (prêt seulement). */
  slides: SlideTestee[];
  slidePub: number | null;
  /** Slide qui citait un concurrent de l'application : remplacée par la pub. */
  positionImposee: number | null;
  mode: string | null;
  variantes: string[];
  varianteRetenue: number | null;
  hashtags: string | null;
  appelsIA: SuiviIA;
}

export interface ContenuTeste {
  id: string;
  titre: string | null;
  statut: string | null;
  importStatut: string | null;
  langueSource: string;
  langue: string;
  vues: number | null;
  /** Piste du compte source (0-100), null si inconnue ou sans preuve. */
  pisteSource: number | null;
  /** Hors du stock que la nuit sert (non valide, import pas fini, langue non ciblée…). */
  avertissements: string[];
  pertinence: PertinenceTestee | null;
  deck: DeckTeste | null;
  erreur?: string;
  dureeMs: number;
}

export interface ResultatContenusABlanc {
  aBlanc: true;
  mode: "contenus";
  ia: true;
  dureeMs: number;
  resume: string;
  erreurRun?: string;
  application: { id: string; slug: string; nom: string; actif: boolean; langues: string[] | null } | null;
  prompts: {
    pertinence: { cle: string; present: boolean };
    placement: { cle: string; present: boolean };
  } | null;
  scoring: { seuil: number; plancher: number; poidsVues: number; poidsSource: number } | null;
  contenus: ContenuTeste[];
  ecrituresEvitees: Array<{ table: string; operation: OperationEcriture; requetes: number; lignes: number | null }>;
  appelsBloques: Array<{ hote: string; motif: MotifBlocage; nombre: number }>;
  appelsIA: SuiviIA;
  plafondIA: number;
  lectures: number;
  limites: string[];
}

/** Ce que ce mode ne rejoue pas — toujours affiché. */
export const LIMITES_CONTENUS: readonly string[] = [
  "Notation : même calcul que le rattrapage (noterContenuBackfill, piste du compte source comprise) ; une ligne déjà en base n'est remplacée que dans le test.",
  "Placement : cache contenu_langue_decks ignoré pour tester le prompt actuel ; une base déjà traduite en base (slides_base de la langue) est réutilisée, sinon la traduction est faite par le modèle et jamais enregistrée.",
  "Tier d'entrée : celui d'une ligne neuve (tier_initial_note). Un contenu déjà passé dans contenu_tiers_application garde son tier réel.",
  "Le modèle n'est pas déterministe : relancer peut donner un autre score, une autre slide ou une autre phrase.",
];

function texte(v: unknown): string | null {
  return typeof v === "string" ? v : v === null || v === undefined ? null : String(v);
}

function nombre(v: unknown): number | null {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : n;
}

function versSlides(deck: readonly SlideLangue[] | null | undefined): SlideTestee[] {
  return [...(deck ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({ position: s.position, texte: s.texte_overlay ?? "", pub: Boolean(s.position_sophia) }));
}

/** Écritures évitées et appels bloqués, agrégés (même forme que le mode compte). */
export function agregerJournal(etat: EtatABlanc): Pick<ResultatContenusABlanc, "ecrituresEvitees" | "appelsBloques"> {
  const ecritures = new Map<string, ResultatContenusABlanc["ecrituresEvitees"][number]>();
  for (const e of etat.journal) {
    const cle = `${e.table}|${e.operation}`;
    const agg = ecritures.get(cle) ?? { table: e.table, operation: e.operation, requetes: 0, lignes: 0 };
    agg.requetes += 1;
    agg.lignes = agg.lignes === null || e.lignes === null ? null : agg.lignes + e.lignes;
    ecritures.set(cle, agg);
  }
  const blocages = new Map<string, ResultatContenusABlanc["appelsBloques"][number]>();
  for (const b of etat.bloques) {
    const cle = `${b.hote}|${b.motif}`;
    const agg = blocages.get(cle) ?? { hote: b.hote, motif: b.motif, nombre: 0 };
    agg.nombre += 1;
    blocages.set(cle, agg);
  }
  return { ecrituresEvitees: [...ecritures.values()], appelsBloques: [...blocages.values()] };
}

/** Pourquoi une ligne n'est pas éligible — la règle de `eligibiliteDepuisNote`, décomposée. */
export function motifsNonEligible(args: {
  applicationId: string;
  score: number;
  note: number;
  seuil: number;
  forcee: boolean;
}): MotifNonEligible[] {
  const motifs: MotifNonEligible[] = [];
  if (!pertinenceSuffisante(args.applicationId, args.score)) motifs.push("pertinence_sous_plancher");
  if (!args.forcee && !(Number.isFinite(args.note) && args.note >= args.seuil)) motifs.push("note_sous_seuil");
  return motifs;
}

/** Tier d'entrée d'une ligne neuve : miroir de la vue (tier_initial_note si éligible, D / 0 sinon). */
export function tierEntree(eligible: boolean, note: number | null): { tier: Tier; passages: number } {
  const tier: Tier = eligible ? tierInitialDepuisNote(note) : "D";
  return { tier, passages: passagesPourTier(tier) };
}

/** Dépendances du rattrapage réel (import-contenu/index.ts), à l'identique. */
export function depsRattrapage(supabase: Supabase): Required<Pick<DepsBackfill, "lirePisteSource">> & DepsBackfill {
  return {
    scoreRelevance,
    lireScoring: () => lireScoring(supabase),
    noteImport: eloParLangue,
    lirePisteSource: (id) => lirePisteSource(supabase, id),
  };
}

interface ContenuLu {
  id: string;
  titre: string | null;
  langue_source: string | null;
  vues_source: number | null;
  statut: string | null;
  import_statut: string | null;
  import_elo_force_seuil: boolean | null;
}

async function testerPertinence(
  supabase: Supabase,
  contenu: ContenuLu,
  app: ApplicationMoteur,
  prompt: string | undefined,
  scoring: ScoringNote,
  deps: DepsBackfill,
  piste: { valeur: number | null },
): Promise<PertinenceTestee> {
  const cle = clePromptPertinenceApp(app);
  const suivi: SuiviIA = { autorises: 0, bloques: 0 };
  const forcee = Boolean(contenu.import_elo_force_seuil);
  const vide = (erreur: string, enBase: PertinenceTestee["enBase"] = null): PertinenceTestee => ({
    promptCle: cle,
    score: null,
    raison: null,
    accroche: null,
    note: null,
    seuil: scoring.eloSeuil,
    plancher: PERTINENCE_MIN_HORS_SOPHIA,
    eligible: false,
    motifs: [],
    forcee,
    ...tierEntree(false, null),
    enBase,
    appelsIA: suivi,
    erreur,
  });

  // Ce qui est réellement en base AVANT (lecture réelle : la table n'est pas
  // encore écrite par ce contenu).
  let enBase: PertinenceTestee["enBase"] = null;
  {
    const { data, error } = await supabase
      .from("contenu_pertinences")
      .select("score, note, eligible")
      .eq("contenu_id", contenu.id)
      .eq("application_id", app.id)
      .maybeSingle();
    if (!error && data) {
      const l = data as Record<string, unknown>;
      enBase = { score: nombre(l.score), note: nombre(l.note), eligible: Boolean(l.eligible) };
    }
  }
  if (!prompt) {
    return vide(`Prompt « ${cle} » vide ou absent : notation impossible (le rattrapage refuserait de démarrer).`, enBase);
  }

  let accroche: string | null = null;
  const depsTest: DepsBackfill = {
    ...deps,
    scoreRelevance: (input) => {
      accroche = input.hookText;
      return deps.scoreRelevance(input);
    },
    lirePisteSource: async (id) => {
      const v = deps.lirePisteSource ? await deps.lirePisteSource(id) : null;
      piste.valeur = v;
      return v;
    },
  };
  try {
    // LE VRAI CODE DU RATTRAPAGE : son upsert est simulé par l'intercepteur.
    await avecSuivi(suivi, () => noterContenuBackfill(supabase, contenu.id, app, prompt, scoring, depsTest));
  } catch (e) {
    return { ...vide(messageErreur(e), enBase), accroche };
  }

  // Relue à travers le calque : la ligne que le rattrapage aurait écrite.
  const { data, error } = await supabase
    .from("contenu_pertinences")
    .select("score, raison, note, eligible, prompt_cle")
    .eq("contenu_id", contenu.id)
    .eq("application_id", app.id)
    .maybeSingle();
  if (error || !data) {
    return { ...vide(`ligne simulée illisible : ${error ? messageErreur(error) : "absente"}`, enBase), accroche };
  }
  const l = data as Record<string, unknown>;
  const score = nombre(l.score);
  const note = nombre(l.note);
  const eligible = l.eligible === true;
  return {
    promptCle: texte(l.prompt_cle) ?? cle,
    score,
    raison: texte(l.raison),
    accroche,
    note,
    seuil: scoring.eloSeuil,
    plancher: PERTINENCE_MIN_HORS_SOPHIA,
    eligible,
    motifs: eligible ? [] : motifsNonEligible({
      applicationId: app.id,
      score: score ?? 0,
      note: note ?? Number.NaN,
      seuil: scoring.eloSeuil,
      forcee,
    }),
    forcee,
    ...tierEntree(eligible, note),
    enBase,
    appelsIA: suivi,
  };
}

async function testerDeck(
  supabase: Supabase,
  etat: EtatABlanc,
  contenu: ContenuLu,
  langue: string,
  app: ApplicationMoteur,
  echeance: number,
): Promise<DeckTeste> {
  const suivi: SuiviIA = { autorises: 0, bloques: 0 };
  const debutSeq = etat.seq;
  // LE VRAI CODE DU PLACEMENT, cache ignoré : ses écritures sont simulées.
  const r = await avecSuivi(
    suivi,
    () => assurerDeckApplication(supabase, contenu.id, langue, app, { echeance, ignorerCache: true }),
  );

  // Base de la langue AVANT placement, relue dans le calque (sauvegarde ou
  // traduction simulées comprises).
  const langueSource = contenu.langue_source ?? "fr";
  let base: SlideLangue[] = [];
  try {
    const { data } = await supabase
      .from("contenu_langues")
      .select("id, langue, slides, slides_base")
      .eq("contenu_id", contenu.id)
      .in("langue", [...new Set([langue, langueSource])]);
    const lignes = (data ?? []) as Array<LigneLangueBase & { langue?: string }>;
    const source = lignes.find((l) => l.langue === langueSource) ?? null;
    const cible = lignes.find((l) => l.langue === langue) ?? null;
    base = (langue === langueSource ? baseDeTraduction(source) : (cible?.slides_base ?? [])) as SlideLangue[];
  } catch {
    base = [];
  }

  // Le placement retenu : dans l'upsert SIMULÉ de contenu_langue_decks de ce
  // contenu (jamais dans le cache réel, qui peut dater d'un autre prompt).
  const ecrit = [...etat.journal].reverse().find((e) =>
    e.seq > debutSeq && e.table === "contenu_langue_decks" && e.operation === "upsert" &&
    e.valeurs.some((v) => v.contenu_id === contenu.id && v.langue === langue && v.variante === app.slug)
  );
  const ligneDeck = ecrit?.valeurs.find((v) => v.contenu_id === contenu.id && v.variante === app.slug);
  const placement = (ligneDeck?.placement ?? null) as Record<string, unknown> | null;
  const slides = r.statut === "pret" ? versSlides(r.slides) : [];
  const variantes = Array.isArray(placement?.variants) ? (placement!.variants as unknown[]).map(String) : [];
  return {
    promptCle: clePromptPlacement(app.slug),
    statut: r.statut,
    raison: r.statut === "pret" ? null : r.raison,
    base: versSlides(base).map((s) => ({ ...s, pub: false })),
    slides,
    slidePub: slides.find((s) => s.pub)?.position ?? null,
    positionImposee: nombre(placement?.positionImposee),
    mode: texte(placement?.mode) || null,
    variantes,
    varianteRetenue: nombre(placement?.bestIndex),
    hashtags: r.statut === "pret" ? r.hashtags : null,
    appelsIA: suivi,
  };
}

/**
 * Le test à blanc « contenus ». À appeler DANS le contexte `ctx` (nature run,
 * IA autorisée), avec un client créé dans ce contexte. Lève seulement si
 * l'interception n'est pas prouvée active — AVANT toute étape ; toute autre
 * erreur est rendue dans le résultat.
 */
export async function executerContenusABlanc(
  supabase: Supabase,
  ctx: ContexteABlanc,
  args: {
    applicationId: string;
    contenuIds: readonly string[];
    /** Langue du deck testé ; absente : langue source de chaque contenu. */
    langue?: string | null;
    onLog?: (detail: string) => void;
    /** Dépendances du rattrapage (tests) ; défaut : celles du rattrapage réel. */
    deps?: DepsBackfill;
    /** Horloge (tests) : refus de l'IA pendant la nuit. */
    maintenant?: () => Date;
  },
): Promise<ResultatContenusABlanc> {
  const debut = Date.now();
  const etat = ctx.etat;
  const log = (detail: string) => {
    try {
      args.onLog?.(detail);
    } catch {
      // un flux fermé n'arrête pas le test
    }
  };
  const ids = [...new Set(args.contenuIds)].slice(0, MAX_CONTENUS_A_BLANC);

  // a. SONDE : l'intercepteur est posé ET cette lecture est passée par lui.
  if (!intercepteurActif()) {
    throw new Error("Interception inactive : test annulé avant toute étape (rien n'a été lancé).");
  }
  const avant = etat.lectures;
  const sonde = await supabase.from("applications").select("id").eq("id", args.applicationId).limit(1);
  if (!intercepteurActif() || etat.lectures === avant) {
    throw new Error("Interception inactive : test annulé avant toute étape (rien n'a été lancé).");
  }

  const r: ResultatContenusABlanc = {
    aBlanc: true,
    mode: "contenus",
    ia: true,
    dureeMs: 0,
    resume: "",
    application: null,
    prompts: null,
    scoring: null,
    contenus: [],
    ecrituresEvitees: [],
    appelsBloques: [],
    appelsIA: { autorises: 0, bloques: 0 },
    plafondIA: etat.plafondIA,
    lectures: 0,
    limites: [],
  };
  const fin = (erreurRun?: string): ResultatContenusABlanc => {
    const sansEcriture = "rien n'a été écrit";
    const eligibles = r.contenus.filter((c) => c.pertinence?.eligible).length;
    const prets = r.contenus.filter((c) => c.deck?.statut === "pret").length;
    r.erreurRun = erreurRun;
    if (!erreurRun) delete r.erreurRun;
    r.resume = erreurRun
      ? `Test interrompu : ${erreurRun} — ${sansEcriture}`
      : `${r.contenus.length} slideshow(s) testé(s) : ${eligibles} éligible(s), ${prets} deck(s) prêt(s) — ${sansEcriture}`;
    Object.assign(r, agregerJournal(etat));
    r.appelsIA = { ...etat.compteurIA };
    r.lectures = etat.lectures;
    r.limites = [...etat.limites, ...r.limites, ...LIMITES_CONTENUS];
    r.dureeMs = Date.now() - debut;
    return r;
  };
  if (sonde.error) return fin(`lecture de sonde : ${messageErreur(sonde.error)}`);
  if (ids.length === 0) return fin("aucun slideshow à tester");

  // b. L'IA est la raison d'être de ce mode : refusée pendant la nuit.
  {
    const { data: run } = await supabase.from("reglages").select("valeur").eq("cle", "minuit_dernier_run").maybeSingle();
    const at = (run?.valeur as { at?: string } | null)?.at ?? null;
    const refus = raisonRefusIA((args.maintenant ?? (() => new Date()))(), at);
    if (refus) return fin(refus);
  }

  // c. L'application (jamais Sophia), ses prompts, les réglages de scoring.
  try {
    if (!(await schemaMultiAppPret(supabase))) return fin("schéma multi-applications absent (migration 0256)");
  } catch (e) {
    return fin(`schéma multi-applications illisible : ${messageErreur(e)}`);
  }
  let app: ApplicationMoteur | undefined;
  try {
    app = (await chargerApplicationsMoteur(supabase)).find((a) => a.id === args.applicationId);
  } catch (e) {
    return fin(`applications illisibles : ${messageErreur(e)}`);
  }
  if (!app) return fin(`Application ${args.applicationId} inconnue`);
  if (app.id === ID_SOPHIA || app.slug === SLUG_SOPHIA) {
    return fin("Ce test est réservé aux applications autres que Sophia (Sophia n'a ni rattrapage ni deck d'application).");
  }
  r.application = { id: app.id, slug: app.slug, nom: app.nom, actif: app.actif, langues: app.langues };
  if (!app.actif) {
    r.limites.push(`${app.nom} est inactive : la nuit ne la sert pas encore (le test la sert quand même).`);
  }

  const clePertinence = clePromptPertinenceApp(app);
  const clePlacement = clePromptPlacement(app.slug);
  const [promptPertinence, promptPlacement] = await Promise.all([
    chargerPrompt(supabase, clePertinence),
    chargerPrompt(supabase, clePlacement),
  ]);
  r.prompts = {
    pertinence: { cle: clePertinence, present: Boolean(promptPertinence) },
    placement: { cle: clePlacement, present: Boolean(promptPlacement) },
  };
  if (!promptPertinence) log(`Prompt « ${clePertinence} » vide : pas de notation possible.`);
  if (!promptPlacement) log(`Prompt « ${clePlacement} » vide : pas de placement possible.`);

  const deps = args.deps ?? depsRattrapage(supabase);
  let scoring: ScoringNote;
  try {
    scoring = await deps.lireScoring();
  } catch (e) {
    return fin(messageErreur(e));
  }
  r.scoring = {
    seuil: scoring.eloSeuil,
    plancher: PERTINENCE_MIN_HORS_SOPHIA,
    poidsVues: scoring.poidsVues,
    poidsSource: scoring.poidsSource ?? 0,
  };

  // d. Chaque contenu, en parallèle (un seul mur Edge pour les trois).
  const echeance = debut + BUDGET_CONTENUS_MS;
  const appli = app;
  r.contenus = await Promise.all(ids.map(async (id, i): Promise<ContenuTeste> => {
    const t0 = Date.now();
    const tag = `[${i + 1}/${ids.length}]`;
    const { data, error } = await supabase
      .from("contenus")
      .select("id, titre, langue_source, vues_source, statut, import_statut, import_elo_force_seuil")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) {
      const erreur = error ? `lecture du contenu : ${messageErreur(error)}` : "Contenu introuvable";
      log(`${tag} ${id.slice(0, 8)} : ${erreur}`);
      return {
        id,
        titre: null,
        statut: null,
        importStatut: null,
        langueSource: "",
        langue: args.langue ?? "",
        vues: null,
        pisteSource: null,
        avertissements: [],
        pertinence: null,
        deck: null,
        erreur,
        dureeMs: Date.now() - t0,
      };
    }
    const contenu = data as ContenuLu;
    const langueSource = contenu.langue_source ?? "fr";
    const langue = args.langue || langueSource;
    const nom = `${tag} « ${(contenu.titre ?? id.slice(0, 8)).slice(0, 40)} »`;
    const avertissements: string[] = [];
    if (contenu.statut !== "valide") avertissements.push(`statut « ${contenu.statut ?? "?"} » : hors du stock servi`);
    if (contenu.import_statut !== "done") {
      avertissements.push(`import « ${contenu.import_statut ?? "?"} » : hors de la file du rattrapage`);
    }
    if (appli.langues !== null && !appli.langues.includes(langue)) {
      avertissements.push(`langue ${langue} non ciblée par ${appli.nom} : la nuit ne la servirait pas`);
    }

    const piste = { valeur: null as number | null };
    log(`${nom} : notation (${clePertinence})…`);
    const pertinence = await testerPertinence(supabase, contenu, appli, promptPertinence, scoring, deps, piste);
    log(
      pertinence.erreur
        ? `${nom} : notation impossible — ${pertinence.erreur}`
        : `${nom} : pertinence ${pertinence.score}/100 · note ${pertinence.note?.toFixed(1)} (seuil ${pertinence.seuil}) · ` +
          `${pertinence.eligible ? `éligible, tier ${pertinence.tier}` : "NON éligible"}`,
    );

    let deck: DeckTeste | null = null;
    let erreur: string | undefined;
    log(`${nom} : placement ${appli.nom} en ${langue}${pertinence.eligible ? "" : " (contenu non éligible : testé quand même)"}…`);
    try {
      deck = await testerDeck(supabase, etat, contenu, langue, appli, echeance);
      log(
        deck.statut === "pret"
          ? `${nom} : deck prêt, pub en slide ${deck.slidePub ?? "?"}` +
            (deck.positionImposee !== null ? ` (slide concurrente ${deck.positionImposee} remplacée)` : "")
          : `${nom} : deck ${deck.statut} — ${deck.raison === "budget" ? "temps du test épuisé" : deck.raison}`,
      );
    } catch (e) {
      erreur = `placement : ${messageErreur(e)}`;
      log(`${nom} : ${erreur}`);
    }
    return {
      id,
      titre: contenu.titre,
      statut: contenu.statut,
      importStatut: contenu.import_statut,
      langueSource,
      langue,
      vues: nombre(contenu.vues_source),
      pisteSource: piste.valeur,
      avertissements,
      pertinence,
      deck,
      ...(erreur ? { erreur } : {}),
      dureeMs: Date.now() - t0,
    };
  }));
  if (r.contenus.some((c) => c.deck?.raison === "budget")) {
    r.limites.push(
      `Temps du test épuisé (${BUDGET_CONTENUS_MS / 1000} s) avant la fin d'un placement : relance avec moins de slideshows.`,
    );
  }
  return fin();
}
