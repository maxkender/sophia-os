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
 * ANGLES (angle_placement.ts) : le placement est lancé une fois avec la
 * RÉFÉRENCE (l'angle ACTIF du label du contenu, ou sans angle — ce que ferait
 * la nuit), puis une fois par angle EN TEST du label (au plus
 * `MAX_ANGLES_TEST`), pour comparer les variantes côte à côte. Les angles en
 * test ne sont lus QUE par ce mode.
 *
 * SOPHIA : pas de notation ni de deck d'application ; le test pose Sophia sur
 * la base sans pub de la langue (comme `assurerDeckPourLangue` quand le deck
 * n'existe pas encore), une fois par angle. Rien n'est écrit.
 *
 * Aucune fonction partagée n'est modifiée par ce module : il n'ajoute que
 * les options `ignorerCache` / `angleBrouillon` (absentes ailleurs) et appelle
 * le code tel quel.
 */

import { MAX_ANGLES_TEST } from "./angle_placement.ts";
import { clePromptPlacement } from "./applications.ts";
import {
  chargerAnglePlacement,
  chargerAnglesTest,
  chargerApplicationsMoteur,
  schemaMultiAppPret,
} from "./applications_moteur.ts";
import { positionConcurrent, sansConcurrent } from "./concurrents.ts";
import { assurerDeckApplication, type DeckApplicationResultat } from "./deck_application.ts";
import { baseDeTraduction, type LigneLangueBase } from "./deck_langue.ts";
import { integrateSophia, scoreRelevance } from "./gemini.ts";
import {
  deckSophiaDuPod,
  eloParLangue,
  lirePisteSource,
  lireScoring,
  type SlideLangue,
  traduireBaseDeck,
} from "./import_contenu.ts";
import { estContenuLivre } from "./pods.ts";
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
 * l'assignation d'un compte, dont le plafond reste 30. Chaque angle en test
 * (au plus `MAX_ANGLES_TEST`) ajoute un placement : 4 essais, 6 avec la marge.
 */
export const PLAFOND_IA_PAR_CONTENU = 15 + 6 * MAX_ANGLES_TEST;

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
  /** Angle de placement ajouté au prompt ; null = placement sans angle. */
  angle: string | null;
  hashtags: string | null;
  appelsIA: SuiviIA;
}

/** Un placement du comparatif d'angles d'un contenu. */
export interface AngleTeste {
  /** `reference` : ce que ferait la nuit (angle actif, ou sans angle) ; `test` : un angle en test. */
  source: "reference" | "test";
  /** Id `angles_placement` de l'angle en test ; null pour la référence. */
  angleId: string | null;
  /** Angle ajouté au prompt ; null = sans angle. */
  angle: string | null;
  deck: DeckTeste | null;
  erreur?: string;
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
  /** Deck de la RÉFÉRENCE (= `angles[0].deck`). */
  deck: DeckTeste | null;
  /** Référence puis un placement par angle en test du label. */
  angles: AngleTeste[];
  /** Angles en test du label au-delà de `MAX_ANGLES_TEST`, non testés. */
  anglesNonTestes: number;
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
  /** Notation testée (toutes les applications sauf Sophia). */
  notation: boolean;
  contenus: ContenuTeste[];
  ecrituresEvitees: Array<{ table: string; operation: OperationEcriture; requetes: number; lignes: number | null }>;
  appelsBloques: Array<{ hote: string; motif: MotifBlocage; nombre: number }>;
  appelsIA: SuiviIA;
  plafondIA: number;
  lectures: number;
  limites: string[];
}

const LIMITE_NON_DETERMINISTE =
  "Le modèle n'est pas déterministe : relancer peut donner un autre score, une autre slide ou une autre phrase.";
const LIMITE_ANGLES =
  `Angles : la référence est l'angle ACTIF du label (ou sans angle), comme la nuit ; chaque angle EN TEST du label donne un placement de plus (au plus ${MAX_ANGLES_TEST}). L'angle n'entre que dans le placement, pas dans la notation.`;

/** Ce que ce mode ne rejoue pas — toujours affiché (hors Sophia). */
export const LIMITES_CONTENUS: readonly string[] = [
  "Notation : même calcul que le rattrapage (noterContenuBackfill, piste du compte source comprise) ; une ligne déjà en base n'est remplacée que dans le test.",
  "Placement : cache contenu_langue_decks ignoré pour tester le prompt actuel ; une base déjà traduite en base (slides_base de la langue) est réutilisée, sinon la traduction est faite par le modèle et jamais enregistrée.",
  "Tier d'entrée : celui d'une ligne neuve (tier_initial_note). Un contenu déjà passé dans contenu_tiers_application garde son tier réel.",
  LIMITE_NON_DETERMINISTE,
  LIMITE_ANGLES,
];

/** Limites quand l'application testée est Sophia (à la place de LIMITES_CONTENUS). */
export const LIMITES_SOPHIA: readonly string[] = [
  "Sophia : placement seul, pas de notation (le contenu est déjà dans le stock Sophia).",
  "Sophia : la slide est posée sur la base sans pub de la langue ; la nuit, un deck Sophia déjà prêt est servi tel quel (un angle ne vaut que pour les prochains decks).",
  LIMITE_NON_DETERMINISTE,
  LIMITE_ANGLES,
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
  /** Compte source : sa voix guide la traduction de la base (comme la nuit). */
  compte_reference_id: string | null;
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
  angle: string,
): Promise<DeckTeste> {
  const suivi: SuiviIA = { autorises: 0, bloques: 0 };
  const debutSeq = etat.seq;
  // LE VRAI CODE DU PLACEMENT, cache ignoré : ses écritures sont simulées.
  // L'angle de CE placement (référence ou angle en test) est imposé, sans
  // rien écrire ; "" = sans angle.
  const r = await avecSuivi(
    suivi,
    () =>
      assurerDeckApplication(supabase, contenu.id, langue, app, {
        echeance,
        ignorerCache: true,
        angleBrouillon: angle,
      }),
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
  // Les angles en test tournent en parallèle : l'upsert de CE placement est
  // celui qui porte son angle (absent = sans angle).
  const estCeluiCi = (v: Record<string, unknown>) =>
    v.contenu_id === contenu.id && v.langue === langue && v.variante === app.slug &&
    (texte((v.placement as Record<string, unknown> | null)?.angle) ?? "") === angle;
  const ecrit = [...etat.journal].reverse().find((e) =>
    e.seq > debutSeq && e.table === "contenu_langue_decks" && e.operation === "upsert" && e.valeurs.some(estCeluiCi)
  );
  const ligneDeck = ecrit?.valeurs.find(estCeluiCi);
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
    angle: texte(placement?.angle) || null,
    hashtags: r.statut === "pret" ? r.hashtags : null,
    appelsIA: suivi,
  };
}

/** Base Sophia d'une langue, prête à recevoir la slide Sophia, ou le refus. */
type BaseSophia =
  | {
    deck: SlideLangue[];
    positionImposee?: number;
    masterPrompt: string;
    corrections: Array<{ original_text: string | null; corrected_text: string }>;
  }
  | { refus: string; statut: "ineligible" | "echec" };

/**
 * Comme `assurerDeckPourLangue` quand le deck Sophia de la langue n'existe pas
 * encore : base sans pub de la langue (traduite par le modèle si besoin, sans
 * rien écrire), slide concurrente imposée puis retirée. Une fois par contenu,
 * avant les placements (un par angle).
 */
async function preparerBaseSophia(
  supabase: Supabase,
  contenu: ContenuLu,
  langue: string,
  suivi: SuiviIA,
  echeance: number,
): Promise<BaseSophia> {
  if (await estContenuLivre(supabase, contenu.id)) {
    return { statut: "ineligible", refus: "contenu livré par un pod (images finies) : pas de placement, l'angle ne s'y applique pas" };
  }
  const langueSource = contenu.langue_source ?? "fr";
  const { data, error } = await supabase
    .from("contenu_langues")
    .select("id, langue, slides, slides_base")
    .eq("contenu_id", contenu.id)
    .in("langue", [...new Set([langue, langueSource])]);
  if (error) throw new Error(`contenu_langues : ${messageErreur(error)}`);
  const lignes = (data ?? []) as Array<LigneLangueBase & { langue?: string; slides?: SlideLangue[] | null }>;
  const source = lignes.find((l) => l.langue === langueSource) ?? null;
  const cible = lignes.find((l) => l.langue === langue) ?? null;
  const deckSource = baseDeTraduction(source) as SlideLangue[];
  if (deckSource.length === 0 || !deckSource.some((s) => s.texte_overlay)) {
    return { statut: "echec", refus: "deck de la langue source vide" };
  }
  const { data: brut } = await supabase.from("contenus").select("pod").eq("id", contenu.id).maybeSingle();
  if (deckSophiaDuPod({ pod: (brut as { pod?: string | null } | null)?.pod ?? null }, source as never)) {
    return {
      statut: "ineligible",
      refus: "original de pod : la slide Sophia est écrite par le pod puis traduite, l'angle Sophia ne s'y applique pas",
    };
  }

  let deck: SlideLangue[];
  if (langue === langueSource) {
    deck = deckSource.map((s) => ({ ...s }));
  } else if ((cible?.slides_base ?? []).length > 0) {
    deck = (cible!.slides_base as SlideLangue[]).map((s) => ({ ...s }));
  } else {
    if (Date.now() > echeance) return { statut: "echec", refus: "budget" };
    const traduction = await avecSuivi(suivi, () => traduireBaseDeck(supabase, contenu, deckSource, langue));
    if (traduction.traduits === 0) return { statut: "echec", refus: `traduction ${langue} vide` };
    deck = traduction.slides;
  }
  if (deck.some((s) => s.position_sophia)) {
    return { statut: "ineligible", refus: "la base porte déjà une slide Sophia : la nuit ne reposerait rien" };
  }
  const positionImposee = positionConcurrent(deck) ?? positionConcurrent(deckSource);
  deck = sansConcurrent(deck).slides;

  const [{ data: corrections }, masterPrompt] = await Promise.all([
    supabase.from("corrections").select("texte_origine, texte_corrige").order("created_at", { ascending: false })
      .limit(40),
    chargerPrompt(supabase, clePromptPlacement("sophia")),
  ]);
  return {
    deck,
    positionImposee,
    masterPrompt: masterPrompt ?? "",
    corrections: ((corrections ?? []) as Array<{ texte_origine: string | null; texte_corrige: string }>).map((c) => ({
      original_text: c.texte_origine,
      corrected_text: c.texte_corrige,
    })),
  };
}

/** Un placement Sophia sur la base préparée, avec CET angle ("" = sans angle). */
async function testerPlacementSophia(
  base: BaseSophia,
  contenu: ContenuLu,
  langue: string,
  angle: string,
  echeance: number,
  suiviBase: SuiviIA,
): Promise<DeckTeste> {
  const suivi: SuiviIA = { ...suiviBase };
  const cle = clePromptPlacement("sophia");
  const vide = (statut: DeckTeste["statut"], raison: string, baseSlides: SlideLangue[] = []): DeckTeste => ({
    promptCle: cle,
    statut,
    raison,
    base: versSlides(baseSlides).map((s) => ({ ...s, pub: false })),
    slides: [],
    slidePub: null,
    positionImposee: null,
    mode: null,
    variantes: [],
    varianteRetenue: null,
    angle: angle || null,
    hashtags: null,
    appelsIA: suivi,
  });
  if ("refus" in base) return vide(base.statut, base.refus);
  if (Date.now() > echeance) return vide("echec", "budget", base.deck);
  const placement = await avecSuivi(suivi, () =>
    integrateSophia({
      masterPrompt: base.masterPrompt,
      corrections: base.corrections,
      slides: base.deck.map((s) => ({ position: s.position, text: s.texte_overlay ?? "" })),
      caption: contenu.titre ?? "",
      langue,
      positionImposee: base.positionImposee,
      ...(angle ? { angle } : {}),
    })
  );
  if (!placement) {
    return vide("echec", "placement impossible : la nuit poserait le texte de repli", base.deck);
  }
  const deck = base.deck.map((s) =>
    s.position === placement.chosenPosition
      ? { ...s, texte_overlay: placement.variants[placement.bestIndex], position_sophia: true }
      : { ...s }
  );
  const slides = versSlides(deck);
  return {
    promptCle: cle,
    statut: "pret",
    raison: null,
    base: versSlides(base.deck).map((s) => ({ ...s, pub: false })),
    slides,
    slidePub: slides.find((s) => s.pub)?.position ?? null,
    positionImposee: base.positionImposee ?? null,
    mode: placement.mode || null,
    variantes: placement.variants,
    varianteRetenue: placement.bestIndex,
    angle: angle || null,
    hashtags: null,
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
    notation: true,
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
      : r.notation
      ? `${r.contenus.length} slideshow(s) testé(s) : ${eligibles} éligible(s), ${prets} deck(s) prêt(s) — ${sansEcriture}`
      : `${r.contenus.length} slideshow(s) testé(s) : ${prets} deck(s) prêt(s) — ${sansEcriture}`;
    Object.assign(r, agregerJournal(etat));
    r.appelsIA = { ...etat.compteurIA };
    r.lectures = etat.lectures;
    r.limites = [...etat.limites, ...r.limites, ...(r.notation ? LIMITES_CONTENUS : LIMITES_SOPHIA)];
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
  // Sophia : placement seul (ni rattrapage ni deck d'application).
  const estSophia = app.id === ID_SOPHIA || app.slug === SLUG_SOPHIA;
  r.notation = !estSophia;
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
  if (!promptPertinence && !estSophia) log(`Prompt « ${clePertinence} » vide : pas de notation possible.`);
  if (!promptPlacement) {
    log(
      estSophia
        ? `Prompt « ${clePlacement} » vide : Sophia posée sans prompt maître, comme la nuit.`
        : `Prompt « ${clePlacement} » vide : pas de placement possible.`,
    );
  }

  const deps = args.deps ?? depsRattrapage(supabase);
  let scoring: ScoringNote | null = null;
  if (!estSophia) {
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
  }

  // d. Chaque contenu, en parallèle (un seul mur Edge pour les trois).
  const echeance = debut + BUDGET_CONTENUS_MS;
  const appli = app;
  r.contenus = await Promise.all(ids.map(async (id, i): Promise<ContenuTeste> => {
    const t0 = Date.now();
    const tag = `[${i + 1}/${ids.length}]`;
    const { data, error } = await supabase
      .from("contenus")
      .select("id, titre, langue_source, vues_source, statut, import_statut, import_elo_force_seuil, compte_reference_id")
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
        angles: [],
        anglesNonTestes: 0,
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
    let pertinence: PertinenceTestee | null = null;
    if (!estSophia && scoring) {
      log(`${nom} : notation (${clePertinence})…`);
      pertinence = await testerPertinence(supabase, contenu, appli, promptPertinence, scoring, deps, piste);
      log(
        pertinence.erreur
          ? `${nom} : notation impossible — ${pertinence.erreur}`
          : `${nom} : pertinence ${pertinence.score}/100 · note ${pertinence.note?.toFixed(1)} (seuil ${pertinence.seuil}) · ` +
            `${pertinence.eligible ? `éligible, tier ${pertinence.tier}` : "NON éligible"}`,
      );
    }

    // Angles : la référence (l'actif du label, ou sans angle — ce que ferait la
    // nuit), puis chaque angle EN TEST du label, au plus MAX_ANGLES_TEST.
    const reference = await chargerAnglePlacement(supabase, contenu.id, appli.id);
    const enTest = (await chargerAnglesTest(supabase, contenu.id, appli.id)).filter((a) => a.texte !== reference);
    const testes = enTest.slice(0, MAX_ANGLES_TEST);
    const essais: Array<Omit<AngleTeste, "deck">> = [
      { source: "reference", angleId: null, angle: reference || null },
      ...testes.map((a) => ({ source: "test" as const, angleId: a.id, angle: a.texte })),
    ];
    if (testes.length > 0) {
      log(`${nom} : ${testes.length} angle(s) en test à comparer à la référence${reference ? " (angle actif)" : " (sans angle)"}`);
    }

    const decrire = (d: DeckTeste) =>
      d.statut === "pret"
        ? `deck prêt, pub en slide ${d.slidePub ?? "?"}` +
          (d.positionImposee !== null ? ` (slide ${d.positionImposee} imposée)` : "")
        : `deck ${d.statut} — ${d.raison === "budget" ? "temps du test épuisé" : d.raison}`;
    const etiquette = (e: Omit<AngleTeste, "deck">, k: number) =>
      e.source === "reference" ? "référence" : `angle en test ${k}`;

    const angles: AngleTeste[] = [];
    let erreur: string | undefined;
    log(`${nom} : placement ${appli.nom} en ${langue}${pertinence && !pertinence.eligible ? " (contenu non éligible : testé quand même)" : ""}…`);
    if (estSophia) {
      // Base préparée une fois (traduction comprise), puis un placement par angle.
      const suiviBase: SuiviIA = { autorises: 0, bloques: 0 };
      let base: BaseSophia | null = null;
      try {
        base = await preparerBaseSophia(supabase, contenu, langue, suiviBase, echeance);
      } catch (e) {
        erreur = `placement : ${messageErreur(e)}`;
        log(`${nom} : ${erreur}`);
      }
      if (base) {
        const prete = base;
        const decks = await Promise.all(essais.map(async (e) => {
          try {
            return { deck: await testerPlacementSophia(prete, contenu, langue, e.angle ?? "", echeance, suiviBase) };
          } catch (err) {
            return { erreur: `placement : ${messageErreur(err)}` };
          }
        }));
        essais.forEach((e, k) => angles.push({ ...e, deck: decks[k].deck ?? null, ...(decks[k].erreur ? { erreur: decks[k].erreur } : {}) }));
      }
    } else {
      // Référence d'abord : elle traduit la base et l'écrit dans le calque ;
      // les angles en test la relisent ensuite, en parallèle, sans retraduire.
      const lancer = async (e: Omit<AngleTeste, "deck">): Promise<AngleTeste> => {
        try {
          return { ...e, deck: await testerDeck(supabase, etat, contenu, langue, appli, echeance, e.angle ?? "") };
        } catch (err) {
          return { ...e, deck: null, erreur: `placement : ${messageErreur(err)}` };
        }
      };
      angles.push(await lancer(essais[0]));
      // Sans base (traduction ratée, deck source vide…), les angles en test
      // retraduiraient chacun la leur : comparaison faussée. Ils attendent.
      if (essais.length > 1 && (angles[0].deck?.base.length ?? 0) === 0) {
        angles.push(...essais.slice(1).map((e) => ({
          ...e,
          deck: null,
          erreur: "non testé : la référence n'a pas de base dans cette langue (traduction ou deck source indisponible)",
        })));
      } else {
        angles.push(...await Promise.all(essais.slice(1).map(lancer)));
      }
    }
    angles.forEach((a, k) => {
      if (a.deck) log(`${nom} · ${etiquette(a, k)} : ${decrire(a.deck)}`);
      else if (a.erreur) log(`${nom} · ${etiquette(a, k)} : ${a.erreur}`);
    });
    const deck = angles[0]?.deck ?? null;
    if (!erreur && !deck) erreur = angles[0]?.erreur;
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
      angles,
      anglesNonTestes: enTest.length - testes.length,
      ...(erreur ? { erreur } : {}),
      dureeMs: Date.now() - t0,
    };
  }));
  const nonTestes = r.contenus.reduce((n, c) => n + c.anglesNonTestes, 0);
  if (nonTestes > 0) {
    r.limites.push(`${nonTestes} angle(s) en test au-delà de ${MAX_ANGLES_TEST} par slideshow : non testés (les plus récents).`);
  }
  if (r.contenus.some((c) => c.angles.some((a) => a.deck?.raison === "budget"))) {
    r.limites.push(
      `Temps du test épuisé (${BUDGET_CONTENUS_MS / 1000} s) avant la fin d'un placement : relance avec moins de slideshows.`,
    );
  }
  return fin();
}
