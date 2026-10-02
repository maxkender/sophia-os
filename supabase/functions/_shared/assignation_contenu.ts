import {
  resoudreVisuelsAssignation,
  type SlideStructureManuel,
} from "./creation_manuelle.ts";
import {
  APPLICATION_SOPHIA_SECOURS,
  chargerApplicationsMoteur,
  chargerLiensLabels,
  type EtatSchemaMultiApp,
  schemaMultiAppPretSinonSophia,
  sonderSchemaMultiApp,
} from "./applications_moteur.ts";
import {
  assurerDeckApplication,
  DELAI_REESSAI_ECHEC_MS,
  RAISON_BUDGET,
} from "./deck_application.ts";
import { assurerDeckPourLangue } from "./import_contenu.ts";
import { hashtagsPour } from "./hashtags_langue.ts";
import {
  ECART_MIN_JOURS_AUTRE_APPLICATION,
  FENETRE_REPARTITION_DEFAUT,
  ID_SOPHIA,
  SLUG_SOPHIA,
  applicationsEligiblesCompte,
  choisirApplicationCreneau,
  labelsParApplication,
  normaliserParts,
  partsEffectives,
  type ApplicationMoteur,
  type EntreeFenetre,
  type LabelRef,
  type LienLabelApplication,
  type PartsApplications,
} from "./multi_app.ts";
import { LOT_IDS, decouperEnLots, lireParLots, lireTout } from "./lots.ts";
import { avecMentionPublicite } from "./mention_publicite.ts";
import { mapPool } from "./parallel.ts";
import { serviceClient } from "./supabase.ts";
import {
  bandesDeTirage,
  estTier,
  programmerRappels,
  type RappelsResultat,
  type Tier,
} from "./tierlist.ts";
import {
  appliquerFaceSwapUgcPost,
  chargerPersonaUgc,
} from "./ugc_face_swap.ts";

/** Comptes traités en parallèle. Gemini (trad + Sophia) est dans assurerDeck —
 *  trop large → 429 ; trop petit → assignation lente. */
const LARGEUR_ASSIGNATION = 6;

export { LOT_IDS, lireParLots };

/** Par invocation drain : assez petit pour finir avant timeout Edge / cron. */
const DRAIN_BATCH = 8;
const DRAIN_MAX_CHAIN = 40;

/**
 * Contenus essayés pour UN créneau d'une application autre que Sophia avant de
 * le replier sur Sophia. Chaque essai peut cuire un deck (appel modèle) : trois
 * suffisent à passer un contenu dont la base est polluée, sans transformer un
 * placement cassé (prompt manquant) en dizaines d'appels par compte.
 */
const ESSAIS_DECK_APPLICATION = 3;

/**
 * Budget d'un lot du drain pour CUIRE des decks d'autres applications
 * (traduction + jusqu'à 4 essais de placement, ~60 s au pire par contenu).
 * Passé ce délai, les créneaux non-Sophia du lot se replient d'office sur
 * Sophia (motif `budget`) : une invocation tuée avant `kickAssignationDrain`
 * arrêterait la chaîne de la nuit, comptes 100 % Sophia compris. Les decks
 * Sophia, eux, ne sont jamais bornés — comme avant.
 */
export const BUDGET_DECKS_APPLICATION_MS = 60_000;

/**
 * Au-delà de l'échéance de démarrage, une cuisson déjà lancée a encore ce délai
 * pour finir son étape en cours ; elle s'arrête ensuite avant la suivante. Le
 * pire cas reste ainsi bien sous le mur de 150 s d'une invocation, journal du
 * lot et relance de la chaîne compris.
 */
const MARGE_CUISSON_MS = 30_000;

/**
 * Échecs de cuisson (`deck_echec`) d'une même application × langue dans un
 * lot au-delà desquels on cesse d'essayer pour le reste du lot : une panne
 * systémique (prompt cassé, modèle lent) n'est payée qu'une fois par lot, pas
 * une fois par compte.
 */
const ECHECS_DECK_PAR_LOT = 3;

/**
 * Cuisson des decks, derrière un objet pour que les tests de la boucle
 * d'assignation puissent la remplacer : les deux chemins appellent un modèle
 * (traduction, placement). En prod, rien ne les touche.
 */
export const decksAssignation = {
  sophia: assurerDeckPourLangue,
  application: assurerDeckApplication,
};

export type Supabase = ReturnType<typeof serviceClient>;

export interface AssignationReglages {
  postsParJour: number;
  /** Passages offerts à un contenu en D repêché quand le pool ne suffit pas. */
  repechagePassages: number;
}

export async function chargerAssignationReglages(
  supabase: Supabase,
): Promise<AssignationReglages> {
  // Lecture non bornée ASSUMÉE. `reglages` est la table de configuration du
  // dépôt : une ligne par clé (`frequence`, `tierlist`, …), une dizaine au
  // total, et elle ne grossit que quand un humain ajoute un réglage. Elle ne
  // peut pas approcher les 1000 lignes du plafond PostgREST, donc le garde-fou
  // de complétude restera muet dessus. Si un jour il lève ici, c'est que
  // `reglages` a changé de nature (log ? historique ?) : la réponse sera alors
  // un `.eq("cle", …)` par réglage lu, pas un `.limit()` qui masquerait la
  // troncature. À noter pour ce jour-là : cet appel est fait AVANT la boucle par
  // compte de `assignerDrainLot` / `assignerTousComptes`, donc hors de leur
  // try/catch par compte — un jet ici emporte le lot entier, pas un créateur.
  // Ce n'est plus la fin de la nuit pour autant : le drain relance la génération
  // suivante et le cron de 4 h repasse.
  //
  // L'ERREUR EST RELUE, et le jet est le bon comportement depuis que le drain
  // relance la génération suivante et que les étapes de minuit sont isolées.
  // Avant, `data` nul sur un 502 rendait une Map vide : les défauts du fichier
  // prenaient le relais et toute la flotte passait à 1 post/jour au lieu de 2,
  // sans une ligne de log — une nuit à moitié vide qui ressemble à une nuit
  // normale. C'est la confusion « échec vs vide » qui a motivé ce chantier, et
  // ici elle se paie en posts pour tout le monde.
  const { data, error } = await supabase.from("reglages").select("cle, valeur");
  if (error) {
    throw new Error(`lecture des réglages d'assignation : ${error.message}`);
  }
  const map = new Map((data ?? []).map((r) => [r.cle, r.valeur]));
  const frequence = (map.get("frequence") ?? { posts_par_jour: 1 }) as {
    posts_par_jour?: number;
  };
  const tierlist = (map.get("tierlist") ?? {}) as Record<string, number>;
  return {
    postsParJour: Math.min(3, Math.max(1, frequence.posts_par_jour ?? 1)),
    repechagePassages: Math.max(1, tierlist.repechage_passages ?? 1),
  };
}

interface Candidat {
  contenuId: string;
  tier: Tier;
  /** Cycle de requalification en cours — estampillé sur le passage créé. */
  tierCycle: number;
  /** Passages encore à effectuer sur ce cycle. */
  restants: number;
  /** Repêché depuis la D-tier pour combler le pool du jour. */
  repeche: boolean;
  slides: unknown;
  musique_url: string | null;
  musique_titre: string | null;
  musique_plateforme: string | null;
  dejaPoste: boolean;
  derniereDate: string | null;
}

export interface ContenuCandidat {
  id: string;
  musique_url: string | null;
  musique_titre: string | null;
  musique_plateforme: string | null;
  ugc_compatible: boolean | null;
}

/* -------------------------------------------------------------------------
 * Mémo de RUN : le mapping label → contenus est invariant, sa lecture ne l'est pas.
 *
 * La boucle de pioche de `assignerCompteJour` appelle `choisirContenu` jusqu'à
 * `manquants + 8` fois par compte, et chaque appel repartait de zéro : lecture
 * de `comptes` pour l'application, puis `contenuIdsDesLabels`, puis le pool des
 * `contenus` prêts. Rien de tout cela ne bouge pendant le run — ni les liens
 * `contenu_labels`, ni `statut` / `import_statut` / `ugc_compatible` /
 * `application_id` des contenus —, et on le repayait pourtant à chaque
 * tentative, sur 131 comptes.
 *
 * Ce coût vient d'AUGMENTER. `contenuIdsDesLabels` pagine désormais LABEL PAR
 * LABEL pour ne plus se faire rogner à `max-rows` : là où l'ancienne version
 * tirait une requête pour tous les labels du compte, il en faut maintenant au
 * moins une par label. Le correctif de la troncature muette aurait donc, sans
 * ce mémo, payé sa justesse en allers-retours — dans la fonction dont le mode
 * de panne documenté est précisément le timeout à 280 s.
 *
 * DURÉE DE VIE : l'invocation d'Edge Function en cours, et rien de plus. Le
 * mémo est un OBJET, créé par `assignerDrainLot` / `assignerTousComptes` (ou, à
 * défaut, par `assignerCompteJour` pour son seul compte) et passé de main en
 * main. Surtout pas un `const cache = new Map()` au niveau module : une Edge
 * Function réutilise son isolat d'une invocation à l'autre, un cache de module
 * survivrait donc au run et servirait un pool périmé au suivant — un contenu
 * importé ou labellisé entre les deux resterait invisible jusqu'au prochain
 * redémarrage de l'isolat, c'est-à-dire de façon imprévisible. On accepte en
 * revanche de ne pas voir un import qui se termine PENDANT le run (≤ 280 s) :
 * c'est la contrepartie assumée, et le run suivant le verra.
 *
 * Ce qui n'est délibérément PAS mémoïsé : `contenu_tier_etat` et l'historique
 * `passages`. Ceux-là bougent à chaque passage créé (`restants` tombe, un
 * contenu doit sortir du pool du jour, y compris pour les comptes traités en
 * parallèle par `mapPool`). Les mémoïser changerait la politique d'assignation
 * et pas seulement son coût — ce n'est pas le chantier.
 *
 * MULTI-APPLICATIONS. Le mémo porte aussi ce que le multi-app lit une fois par
 * run : la sonde du schéma 0256 (une réponse pour TOUT le run, pas une par
 * compte — deux comptes d'un même lot ne doivent pas voir deux schémas si la
 * migration passe au milieu), les applications, les liens label → application
 * par ensemble de labels, et les ensembles de pertinence / decks inéligibles.
 * Ces derniers ne bougent qu'à l'import ou à la révocation, pas à chaque
 * passage : même statut que le mapping label → contenus.
 *
 * L'ancienne entrée `application` (compte → `comptes.application_id`) a
 * disparu avec le partitionnement des contenus par application : la colonne
 * reste en base (figée à Sophia, lue par les bundles figés), le pool ne la lit
 * plus.
 * ---------------------------------------------------------------------- */

/** Mémo porté explicitement pendant un run d'assignation. Voir le bloc ci-dessus. */
export interface MemoAssignation {
  /** clé labels → ids de contenus portant au moins un de ces labels. */
  labels: Map<string, Promise<string[]>>;
  /** clé labels+ugc → contenus prêts (hors règles d'application). */
  pool: Map<string, Promise<ContenuCandidat[]>>;
  /** « schema » → état de la migration 0256 (une sonde par run). */
  schema: Map<string, Promise<EtatSchemaMultiApp>>;
  /** « applications » → applications du moteur (table minuscule). */
  applications: Map<string, Promise<ApplicationMoteur[]>>;
  /** clé labels → liens label_applications de ces labels. */
  liens: Map<string, Promise<LienLabelApplication[]>>;
  /**
   * application_id → ensemble de contenus. Sophia : les contenus EXCLUS (ligne
   * explicite non éligible). Autres : les contenus ÉLIGIBLES (ligne requise).
   */
  pertinences: Map<string, Promise<Set<string>>>;
  /** application_id::langue → contenus dont le deck est `ineligible`. */
  decksIneligibles: Map<string, Promise<Set<string>>>;
  /** application_id::langue → échecs de cuisson dans ce lot. */
  echecsDeck: Map<string, number>;
}

export function creerMemoAssignation(): MemoAssignation {
  return {
    labels: new Map(),
    pool: new Map(),
    schema: new Map(),
    applications: new Map(),
    liens: new Map(),
    pertinences: new Map(),
    decksIneligibles: new Map(),
    echecsDeck: new Map(),
  };
}

/**
 * Clé d'un ensemble de labels : dédupliquée et TRIÉE.
 *
 * Deux comptes qui portent les mêmes labels dans un ordre différent doivent
 * partager l'entrée — sinon le mémo rate justement le cas qui le rend utile,
 * la flotte étant taguée avec une poignée de labels partagés.
 */
function cleLabels(labelIds: string[]): string {
  return [...new Set(labelIds)].sort().join("|");
}

/**
 * Mémoïse une LECTURE, pas une valeur : on range la promesse tout de suite,
 * donc deux comptes traités en parallèle par `mapPool` partagent le même
 * aller-retour au lieu d'en lancer deux.
 *
 * Un ÉCHEC n'est jamais conservé. Une erreur réseau transitoire sur un label
 * resterait sinon collée au mémo pour tout le reste du run et ferait échouer
 * tous les comptes qui partagent ce label : on transformerait une lecture ratée
 * en famine de flotte, exactement ce qu'on cherche à éviter. La prochaine
 * demande relit.
 */
function memoiser<T>(
  cache: Map<string, Promise<T>>,
  cle: string,
  produire: () => Promise<T>,
): Promise<T> {
  const dejaLa = cache.get(cle);
  if (dejaLa) return dejaLa;
  const promesse = produire();
  cache.set(cle, promesse);
  promesse.catch(() => {
    if (cache.get(cle) === promesse) cache.delete(cle);
  });
  return promesse;
}

/** PostgREST rend l'embed `posts(...)` en objet ou en tableau selon la relation. */
type PostLie = { est_test?: boolean | null } | Array<{ est_test?: boolean | null }> | null;

function estPassageDeTest(posts: PostLie | undefined): boolean {
  if (!posts) return false;
  const p = Array.isArray(posts) ? posts[0] : posts;
  return Boolean(p?.est_test);
}

interface PassageHisto {
  /** Ancre de pagination : uuid unique sur toute la table (voir lireHistoriquePassages). */
  id: string;
  contenu_id: string;
  date_publication_prevue: string | null;
  posts?: PostLie;
  /** Lu seulement sur le chemin multi-app (colonne 0256) : écart entre applications. */
  application_id?: string | null;
}

/**
 * Tirage au hasard dans une bande du pool.
 *
 * Plus de softmax sur un score : c'est le nombre de passages du rang tierlist
 * qui décide de la fréquence d'un contenu (D 0 · C 1 · B 2 · A 4 · S 8 · S+ 16).
 * À l'intérieur d'une bande de tirage, tout le monde a la même chance — c'est
 * `bandesDeTirage` qui ordonne les bandes (B+ avant le bas de tierlist).
 */
export function tirerAuHasard<T>(candidats: T[]): T | null {
  if (candidats.length === 0) return null;
  return candidats[Math.floor(Math.random() * candidats.length)];
}

export interface QuotaBaisse {
  avant: number;
  apres: number;
  /** Diagnostic pool qui a déclenché la baisse. */
  raison: string;
}

/**
 * Pourquoi un créneau demandé pour une application autre que Sophia est parti
 * sur Sophia. Écrit tel quel dans `passages.repli_motif`.
 */
export type MotifRepli = "reserve_vide" | "deck_ineligible" | "deck_echec" | "budget";

/** Un créneau replié sur Sophia : l'application visée (slug) et le motif. */
export interface RepliCreneau {
  visee: string;
  motif: MotifRepli;
}

export interface AssignationCompteDetail {
  ids: string[];
  /** Motif si rien (ou pas assez) n'a pu être créé — pour l'UI admin. */
  raison?: string;
  /** Quota posts_par_jour baissé pour coller au pool disponible. */
  quotaBaisse?: QuotaBaisse;
  /** Créneaux repliés sur Sophia (multi-app) ; absent s'il n'y en a aucun. */
  replis?: RepliCreneau[];
  /**
   * Compte qu'aucun repli ne peut servir (ses labels ne servent pas Sophia et
   * son application est inactive, hors langue ou à sec). Le drain l'écarte de
   * la suite de la chaîne : sinon, resté sous quota sans erreur, il reviendrait
   * en tête de chaque lot et affamerait le reste de la flotte.
   */
  nonServable?: boolean;
}

/** Options d'assignation (test admin = posts invisibles + rollback). */
export interface AssignationOpts {
  forcer?: boolean;
  /** Posts `est_test` — hors calendriers créateurs. */
  test?: boolean;
  /** Ignore le budget de passages tierlist (mode test admin). */
  ignorerTierlist?: boolean;
  /** Ignore `warmup_ends_at` (compte hors process OK). */
  ignorerWarmup?: boolean;
  /** Logs progression (stream NDJSON / UI test). */
  onLog?: (detail: string) => void;
  /**
   * Contenus à écarter de ce tirage (recharge créateur). Le slideshow reste
   * valide pour le reste de la flotte — on ne le ressert juste pas tout de
   * suite au créateur qui vient de le refuser.
   */
  exclureContenus?: string[];
  /**
   * Slug de l'application à servir pour ces créneaux, au lieu de la répartition
   * (recharge d'un post révoqué : on refait un post de la MÊME application).
   * Toujours soumis à l'éligibilité du compte, et au repli sur Sophia.
   */
  applicationImposee?: string | null;
  /**
   * Échéance (epoch ms) au-delà de laquelle on ne CUIT plus de deck d'une autre
   * application : ses créneaux se replient sur Sophia (motif `budget`). Posée
   * par le drain ; absente ailleurs (pas de borne, comme avant).
   */
  echeance?: number;
}

/**
 * Matérialisation ratée = passage sans `post_id` + post sans slides.
 * Sans purge, le quota compte ces passages et le Planning affiche des
 * slideshows « assignés » vides.
 */
async function purgerAssignationIncomplete(
  supabase: Supabase,
  compteId: string,
  jour: string,
): Promise<void> {
  // Toutes les lectures de cette fonction sont bornées par la clé métier
  // (UN compte, UN jour) : le quota est de 1 à 3 posts, les coquilles
  // s'ajoutent à la marge. Structurellement hors d'atteinte du plafond de 1000,
  // et ce ne sont pas des relations many-to-one — pas de pagination ici.
  const { data: orphelins } = await supabase
    .from("passages")
    .select("id")
    .eq("compte_id", compteId)
    .eq("date_publication_prevue", jour)
    .is("post_id", null);
  for (const o of orphelins ?? []) {
    await supabase.from("passages").delete().eq("id", o.id);
  }

  const { data: posts } = await supabase
    .from("posts")
    .select("id")
    .eq("compte_id", compteId)
    .eq("date_publication_prevue", jour)
    .eq("est_test", false)
    .in("statut", ["brouillon", "assigne"]);
  for (const p of posts ?? []) {
    const { count } = await supabase
      .from("post_slides")
      .select("id", { count: "exact", head: true })
      .eq("post_id", p.id);
    if ((count ?? 0) > 0) continue;
    const { data: lie } = await supabase
      .from("passages")
      .select("id")
      .eq("post_id", p.id)
      .maybeSingle();
    if (!lie) {
      await supabase.from("posts").delete().eq("id", p.id);
    }
  }
}

/**
 * Assignation v-next pour un compte : labels ∩, score langue, top-K,
 * pénalité saturation, non-écrasement, fallbacks.
 */
// deno-lint-ignore no-explicit-any
export async function assignerCompteJour(
  supabase: Supabase,
  compte: any,
  jour: string,
  reglages: AssignationReglages,
  opts: AssignationOpts | boolean = {},
  // Mémo du run, fourni par `assignerDrainLot` / `assignerTousComptes` pour que
  // les comptes d'un même lot partagent le mapping label → contenus. Absent (appel
  // direct), on en crée un pour ce compte : la boucle de pioche en profite quand
  // même, ce qui est le gros du gain.
  memo: MemoAssignation = creerMemoAssignation(),
): Promise<AssignationCompteDetail> {
  const o: AssignationOpts = typeof opts === "boolean" ? { forcer: opts } : (opts ?? {});
  const forcer = Boolean(o.forcer);
  const estTest = Boolean(o.test);
  const ignorerTierlist = Boolean(o.ignorerTierlist ?? estTest);
  const log = (detail: string) => {
    try {
      o.onLog?.(detail);
    } catch {
      // ignore
    }
  };

  const brut = Number(compte.posts_par_jour ?? reglages.postsParJour ?? 1);
  // Toujours 1–3 : un compte actif doit TOUJOURS viser au moins 1 post/jour.
  // (L'ancien fallback « pool mince → 0 » est interdit.)
  const quota = !Number.isFinite(brut) ? 1 : Math.min(3, Math.max(1, Math.round(brut)));
  const langue: string = compte.langue ?? "fr";
  const ugcAiVideo = Boolean(compte.ugc_ai_video);
  const ugcAi = Boolean(compte.ugc_ai) && !ugcAiVideo;
  const ugcPersonaId = (compte.ugc_persona_id as string | null) ?? null;
  const nomCompte =
    (compte.persona_nom as string | null) ??
    (compte.handle_tiktok as string | null) ??
    String(compte.id).slice(0, 8);

  if (compte.type_compte === "cm") {
    log(`Compte ${nomCompte} · CM — skip assignation slideshow`);
    return {
      ids: [],
      raison: "Compte CM — hors assignation slideshow (vidéo papier).",
    };
  }

  // UGC AI VIDEO : hors assignation slideshow minuit (pipeline vidéos à part).
  if (ugcAiVideo) {
    log(`Compte ${nomCompte} · UGC AI VIDEO — skip assignation slideshow`);
    return {
      ids: [],
      raison: "Compte UGC AI VIDEO — hors assignation slideshow.",
    };
  }

  // Soigne les comptes restés à 0 après l'ancien fallback.
  if (!estTest && Number.isFinite(brut) && brut <= 0) {
    const { error: errHeal } = await supabase
      .from("comptes")
      .update({ posts_par_jour: 1 })
      .eq("id", compte.id);
    if (!errHeal) log(`Compte ${nomCompte} · quota 0→1 (plancher obligatoire)`);
  }

  log(`Compte ${nomCompte} · langue=${langue} · quota=${quota}${ugcAi ? " · UGC" : ""}${estTest ? " · test" : ""}`);

  if (ugcAi && !ugcPersonaId) {
    log("Échec : compte UGC sans persona");
    return {
      ids: [],
      raison:
        "Compte UGC AI sans persona — assigne un persona UGC (4 angles) sur le créateur.",
    };
  }

  // Purge les coquilles legacy recycle/remanie/nouveau du jour (non publiées,
  // sans passage) — sinon « Assigner » empile du Recyclé à côté du v-next.
  // Comme `purgerAssignationIncomplete` : UN compte, UN jour — bornée par le
  // quota (1–3) plus les coquilles legacy. Le plafond de 1000 est hors sujet.
  if (!forcer && !estTest) {
    const { data: legacy } = await supabase
      .from("posts")
      .select("id, type, statut")
      .eq("compte_id", compte.id)
      .eq("date_publication_prevue", jour)
      .eq("est_test", false)
      .in("type", ["recycle", "remanie", "nouveau"])
      .in("statut", ["brouillon", "assigne"]);
    for (const lp of legacy ?? []) {
      const { data: lie } = await supabase
        .from("passages")
        .select("id")
        .eq("post_id", lp.id)
        .maybeSingle();
      if (!lie) {
        await supabase.from("posts").delete().eq("id", lp.id);
      }
    }
  }

  // Toujours : passages orphelins / posts sans slides ne doivent pas
  // bloquer le quota ni apparaître comme « assignés ».
  if (!estTest) {
    await purgerAssignationIncomplete(supabase, compte.id as string, jour);
  }

  // Quota prod / test séparés : les posts `est_test` n'entrent pas dans le
  // calendrier ni le quota de minuit réel. Bornée elle aussi par (compte, jour).
  const { data: existants } = await supabase
    .from("passages")
    .select("id, posts!inner(est_test)")
    .eq("compte_id", compte.id)
    .eq("date_publication_prevue", jour)
    .eq("posts.est_test", estTest);

  const dejaLa = existants?.length ?? 0;
  // Non-écrasement : on ne touche pas aux passages déjà là, on complète
  // seulement jusqu'au quota (1–3) du compte.
  const manquants = forcer ? 1 : Math.max(0, quota - dejaLa);
  log(`Passages déjà là : ${dejaLa}/${quota} → à créer : ${manquants}`);
  if (manquants <= 0) {
    return { ids: [], raison: `Quota déjà rempli (${dejaLa}/${quota} passage(s) ce jour).` };
  }

  // Bornée par le nombre de labels du dépôt (9 en base) : un compte ne peut pas
  // en porter plus, la table n'a qu'une ligne par couple (compte, label).
  // Le slug vient avec, dans la MÊME requête : il sert à écarter les labels
  // système (hook, ugc-ai-video) du calcul labels → applications.
  const { data: labelsCompte } = await supabase
    .from("compte_labels")
    .select("label_id, labels(nom, slug)")
    .eq("compte_id", compte.id);
  const labelIds = (labelsCompte ?? []).map((l) => l.label_id as string);
  // deno-lint-ignore no-explicit-any
  const labelNoms = (labelsCompte ?? [])
    .map((l: any) => l.labels?.nom as string | undefined)
    .filter(Boolean) as string[];
  type LabelLu = { slug?: string | null; nom?: string | null };
  const labelRefs: LabelRef[] = (labelsCompte ?? []).map((l) => {
    const brut = (l as { labels?: LabelLu | LabelLu[] | null }).labels;
    const ref = Array.isArray(brut) ? brut[0] : brut;
    return { id: l.label_id as string, slug: ref?.slug ?? null, nom: ref?.nom ?? null };
  });
  // Sans labels : impossible d'intersecter → baisse le quota à ce qui est déjà là.
  if (labelIds.length === 0) {
    log("Échec : aucun label sur le compte");
    const diag =
      "Aucun label sur ce compte — ajoute un label (Bibliothèque / Compte) pour piocher.";
    const quotaBaisse = await baisserQuotaSiBesoin(
      supabase,
      compte.id as string,
      quota,
      dejaLa,
      diag,
      estTest,
      forcer,
      log,
    );
    return {
      ids: [],
      raison: quotaBaisse
        ? `Lowered quota ${quotaBaisse.avant}→${quotaBaisse.apres} — ${diag}`
        : diag,
      quotaBaisse,
    };
  }
  log(`Labels : ${labelNoms.length ? labelNoms.join(", ") : `${labelIds.length} id(s)`}`);

  // Multi-applications : quelles applications ce compte peut promouvoir, dans
  // quelles parts, et où en est sa fenêtre glissante. Sans 0256, ou pour un
  // compte 100 % Sophia (le cas de TOUTE la flotte au déploiement), on reste
  // sur le chemin d'aujourd'hui : pas de fenêtre lue, pas de colonne nouvelle
  // écrite, mêmes labels, même pool.
  const repartition = await preparerRepartition(
    supabase,
    {
      compteId: compte.id as string,
      jour,
      langue,
      ugcAi,
      labelIds,
      labelRefs,
      partsBrutes: compte.parts_applications,
      imposee: o.applicationImposee ?? null,
    },
    memo,
  );
  const labelsSophia = repartition.labelsSophia;
  const setSophia = new Set(labelsSophia);
  // Mêmes noms, même ordre que `labelNoms` quand tous les labels servent
  // Sophia : le diagnostic (et donc la baisse de quota) reste au mot près. Sans
  // 0256, c'est `labelNoms` lui-même.
  const nomsSophia = labelsSophia === labelIds ? labelNoms : labelRefs
    .filter((r) => setSophia.has(r.id))
    .map((r) => r.nom ?? undefined)
    .filter(Boolean) as string[];
  if (repartition.multi) {
    log(
      `Répartition : ${Object.entries(repartition.parts).map(([s, p]) => `${s} ${Math.round(p)} %`).join(" · ")}` +
        ` · fenêtre ${repartition.fenetre.map((e) => e.application).join(",") || "vide"}`,
    );
  }

  const crees: string[] = [];
  /** Créneaux repliés sur Sophia (passages créés seulement). */
  const replis: RepliCreneau[] = [];
  /**
   * Application → motif, dès qu'un créneau s'est replié. Les créneaux suivants
   * du compte se replient sans relire ni recuire : la réserve ne se remplit pas
   * en cours de run, et chaque essai de deck peut coûter un appel modèle.
   */
  const appsRepliees = new Map<string, MotifRepli>();
  /** Contenu IDs déjà pris / exclus cette session (choisirContenu filtre dessus). */
  const contenusSession: string[] = [...(o.exclureContenus ?? [])];
  const maxTentatives = manquants + 8;
  const finir = (detail: AssignationCompteDetail): AssignationCompteDetail =>
    replis.length > 0 ? { ...detail, replis } : detail;

  /**
   * Un créneau d'une application autre que Sophia : jusqu'à
   * ESSAIS_DECK_APPLICATION contenus de SA réserve, chacun avec SON deck. Rend
   * le motif du repli si aucun ne passe — l'appelant bascule alors le créneau
   * sur Sophia, AVANT la branche « pool trop mince » : une réserve Unswipe vide
   * ne doit jamais baisser le quota d'un compte (décision persistante) alors
   * que Sophia peut encore le servir.
   */
  const piocherPourApplication = async (
    app: ApplicationMoteur,
  ): Promise<
    | { choisi: Candidat; slides: SlideLangue[]; hashtags: string }
    | { motif: MotifRepli }
  > => {
    const labelsApp = repartition.parApp.get(app.id) ?? [];
    const cleEchecs = `${app.id}::${langue}`;
    let motif: MotifRepli = "reserve_vide";
    for (let essai = 0; essai < ESSAIS_DECK_APPLICATION; essai += 1) {
      if (o.echeance !== undefined && Date.now() > o.echeance) {
        log(`Budget de cuisson ${app.nom} du lot épuisé — repli Sophia`);
        return { motif: essai === 0 ? "budget" : motif };
      }
      if ((memo.echecsDeck.get(cleEchecs) ?? 0) >= ECHECS_DECK_PAR_LOT) {
        log(`Decks ${app.nom} ${langue} en échec répété dans ce lot — repli Sophia`);
        return { motif: "deck_echec" };
      }
      const candidat = await choisirContenu(
        supabase,
        compte.id,
        langue,
        labelsApp,
        jour,
        reglages,
        contenusSession,
        ugcAi,
        {
          ignorerTierlist,
          exclureTestsHisto: true,
          regle: { application: app, langue },
          espacement: app.id,
        },
        memo,
      );
      if (!candidat) {
        log(`Réserve ${app.nom} vide pour ce compte`);
        return { motif };
      }
      contenusSession.push(candidat.contenuId);
      log(
        `Contenu ${candidat.contenuId.slice(0, 8)} · ${candidat.tier}-tier` +
          `${candidat.repeche ? " (repêché de D)" : ` · ${candidat.restants} passage(s) restant(s)`}` +
          ` — deck ${app.nom} ${langue}…`,
      );
      let deck: Awaited<ReturnType<typeof assurerDeckApplication>>;
      try {
        deck = await decksAssignation.application(supabase, candidat.contenuId, langue, app, {
          echeance: o.echeance !== undefined ? o.echeance + MARGE_CUISSON_MS : undefined,
        });
      } catch (e) {
        // Panne d'infrastructure : traitée comme un échec de deck — le créneau
        // a encore Sophia pour lui.
        deck = { statut: "echec", raison: e instanceof Error ? e.message : String(e), cuit: true };
      }
      if (deck.statut === "pret" && deck.slides.length > 0) {
        return { choisi: candidat, slides: deck.slides, hashtags: deck.hashtags ?? "" };
      }
      if (deck.statut === "ineligible") {
        motif = "deck_ineligible";
        await noterDeckIneligible(memo, app, langue, candidat.contenuId);
      } else if (deck.statut === "echec" && deck.raison === RAISON_BUDGET) {
        log(`Budget de cuisson ${app.nom} du lot épuisé en cours de deck — repli Sophia`);
        return { motif: "budget" };
      } else {
        motif = "deck_echec";
        // Seule une cuisson ratée compte comme panne systémique : un échec
        // relu en cache n'a rien coûté et ne dit rien des autres contenus.
        if (deck.cuit) {
          memo.echecsDeck.set(cleEchecs, (memo.echecsDeck.get(cleEchecs) ?? 0) + 1);
        }
        await noterDeckIneligible(memo, app, langue, candidat.contenuId);
      }
      log(
        `Deck ${app.nom} ${deck.statut === "pret" ? "vide" : deck.statut}` +
          `${"raison" in deck ? ` : ${deck.raison}` : ""} — contenu suivant`,
      );
    }
    return { motif };
  };

  let persona = null;
  if (ugcAi && ugcPersonaId) {
    log("Chargement persona UGC…");
    persona = await chargerPersonaUgc(supabase, ugcPersonaId);
    if (!persona) {
      log("Échec : persona UGC introuvable");
      return {
        ids: [],
        raison: "Persona UGC introuvable — recrée / réassigne le persona du créateur.",
      };
    }
    log(`Persona UGC OK (${persona.id.slice(0, 8)})`);
  }

  for (let t = 0; t < maxTentatives && crees.length < manquants; t += 1) {
    log(`Pioche contenu ${crees.length + 1}/${manquants} (tentative ${t + 1})…`);

    // Application du créneau : Sophia sur le chemin historique ; sinon
    // l'application imposée (recharge) ou la plus en retard sur la fenêtre.
    const appCreneau = repartition.multi ? applicationDuCreneau(repartition) : repartition.sophia;
    let appEffective = repartition.sophia;
    let repli: { visee: ApplicationMoteur; motif: MotifRepli } | null = null;
    let choisi: Candidat | null = null;
    let slides: SlideLangue[] = [];
    let hashtagsDeck = "";

    if (appCreneau.id !== ID_SOPHIA) {
      const dejaRepliee = appsRepliees.get(appCreneau.id);
      const servi = dejaRepliee ? { motif: dejaRepliee } : await piocherPourApplication(appCreneau);
      if ("choisi" in servi) {
        choisi = servi.choisi;
        slides = servi.slides;
        hashtagsDeck = servi.hashtags;
        appEffective = appCreneau;
        log(`Deck ${appCreneau.nom} prêt (${slides.length} slides) — matérialisation…`);
      } else {
        repli = { visee: appCreneau, motif: servi.motif };
        appsRepliees.set(appCreneau.id, servi.motif);
        log(`Créneau ${appCreneau.nom} replié sur Sophia (${servi.motif})`);
      }
    }

    if (!choisi) {
      choisi = await choisirContenu(
        supabase,
        compte.id,
        langue,
        labelsSophia,
        jour,
        reglages,
        contenusSession,
        ugcAi,
        {
          ignorerTierlist,
          exclureTestsHisto: true,
          regle: repartition.pret ? { application: repartition.sophia, langue } : null,
          espacement: repartition.multi ? ID_SOPHIA : null,
        },
        memo,
      );
      if (!choisi) {
        log("Plus de candidat dans le pool");
        break;
      }
      contenusSession.push(choisi.contenuId);
      log(
        `Contenu ${choisi.contenuId.slice(0, 8)} · ${choisi.tier}-tier` +
          `${choisi.repeche ? " (repêché de D)" : ` · ${choisi.restants} passage(s) restant(s)`}` +
          ` — deck ${langue}…`,
      );

      // Traduction + Sophia à la demande (hors langue source) — pas à l'import.
      try {
        const deck = await decksAssignation.sophia(supabase, choisi.contenuId, langue);
        slides = deck.slides;
        hashtagsDeck = deck.hashtags;
      } catch (e) {
        log(`Deck échoué : ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      if (!slides.length) {
        log("Deck vide — contenu suivant");
        continue;
      }
      log(`Deck prêt (${slides.length} slides) — matérialisation…`);
    }
    // Hashtags issus de la traduction si dispo, sinon jeu localisé de repli.
    // La mention publicitaire locale (turc : #Tanıtım) est posée ici, donc sur
    // le créneau ET sur le post pont matérialisé juste après.
    const hashtags = avecMentionPublicite(
      hashtagsDeck || hashtagsPour(langue, `${compte.id}-${jour}-${crees.length}`),
      langue,
    );

    const { data: passage, error } = await supabase
      .from("passages")
      .insert({
        contenu_id: choisi.contenuId,
        compte_id: compte.id,
        langue,
        date_publication_prevue: jour,
        statut: "assigne",
        slides,
        musique_url: choisi.musique_url,
        musique_titre: choisi.musique_titre,
        musique_plateforme: choisi.musique_plateforme,
        hashtags,
        // Fenêtre de mesure : ce passage comptera dans le `m` de ce cycle.
        tier_cycle: choisi.tierCycle,
        // Chemin multi-app seulement : l'application promue, et le repli s'il
        // y en a eu un. Sur le chemin historique, l'objet inséré reste celui
        // d'avant 0256 — la colonne prend son défaut (Sophia).
        ...(repartition.multi ? colonnesApplicationPassage(appEffective, repli) : {}),
      })
      .select("id")
      .single();
    if (error) throw error;

    // Pont poster : le calendrier / détail créateur lit encore `posts` +
    // `post_slides`. On matérialise un post déjà cuit (pipeline done) et on
    // le lie via passages.post_id — plus de type recycle/remanie/nouveau.
    let postId: string;
    try {
      postId = await materialiserPostDepuisPassage(supabase, {
        passageId: passage.id,
        compteId: compte.id as string,
        contenuId: choisi.contenuId,
        jour,
        slides,
        musique_url: choisi.musique_url,
        musique_titre: choisi.musique_titre,
        musique_plateforme: choisi.musique_plateforme,
        hashtags,
        estTest,
        applicationId: repartition.multi ? appEffective.id : null,
      });
    } catch (e) {
      // Pas de transaction multi-tables : nettoyer le passage pour ne pas
      // bloquer le quota, puis piocher un autre contenu.
      log(`Matérialisation échouée : ${e instanceof Error ? e.message : String(e)}`);
      await supabase.from("passages").delete().eq("id", passage.id);
      continue;
    }
    log(`Post ${postId.slice(0, 8)} créé`);

    // UGC AI : swap Nano Banana sur slides à visage (hors upscale ensuite).
    if (persona) {
      try {
        log("UGC face swap (Nano Banana)…");
        const swap = await appliquerFaceSwapUgcPost(supabase, {
          postId,
          compteId: compte.id as string,
          contenuId: choisi.contenuId,
          persona,
          onLog: log,
        });
        log(`Face swap : ${swap.swaps} ok · ${swap.echecs} échec(s)`);
      } catch (e) {
        // Post déjà utilisable avec médias d'origine — on ne rollback pas.
        log(`Face swap erreur (post gardé) : ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    crees.push(passage.id);
    if (repartition.multi) {
      // La fenêtre en mémoire suit les créneaux du jour : sans ça, les trois
      // créneaux d'un compte à 3 posts verraient la même fenêtre et iraient
      // tous à la même application.
      repartition.fenetre.push({ application: appEffective.slug, poids: 1 });
    }
    if (repli) replis.push({ visee: repli.visee.slug, motif: repli.motif });
    log(`Passage ${crees.length}/${manquants} prêt`);
  }

  if (crees.length < manquants && labelsSophia.length === 0) {
    // Aucun label du compte ne sert Sophia (compte 100 % autre application) :
    // il n'y a pas de pool Sophia à diagnostiquer, et surtout pas de quota à
    // baisser sur la foi d'une réserve d'une autre application — c'est un
    // réglage (application inactive, langue non ciblée, réserve à remplir),
    // pas un pool mince.
    const motifs = [...appsRepliees.entries()]
      .map(([id, motif]) => `${repartition.eligibles.find((a) => a.id === id)?.nom ?? id} : ${motif}`)
      .join(", ");
    const diag =
      `Aucun label de ce compte ne sert Sophia — repli impossible` +
      `${motifs ? ` (${motifs})` : ""}. Vérifie les applications de ses labels et leur réserve.`;
    log(diag);
    return finir({
      ids: crees,
      raison: crees.length === 0 ? diag : `${crees.length}/${manquants} créé(s). ${diag}`,
      nonServable: true,
    });
  }

  if (crees.length < manquants) {
    const diag = await diagnostiquerPoolVide(
      supabase,
      labelsSophia,
      nomsSophia,
      langue,
      ugcAi,
      ignorerTierlist,
      memo,
    );
    log(diag);

    // Fallback : baisser posts_par_jour au nombre réellement assigné aujourd'hui
    // (plancher 1 — jamais 0 : on doit toujours retenter au moins 1 post).
    const totalAssignes = dejaLa + crees.length;
    const quotaBaisse = estRaisonPoolPourBaisseQuota(diag)
      ? await baisserQuotaSiBesoin(
        supabase,
        compte.id as string,
        quota,
        totalAssignes,
        diag,
        estTest,
        forcer,
        log,
      )
      : undefined;

    const quotaEffectif = quotaBaisse?.apres ?? quota;
    if (totalAssignes >= quotaEffectif) {
      return finir({
        ids: crees,
        quotaBaisse,
        raison: quotaBaisse
          ? `Lowered quota ${quotaBaisse.avant}→${quotaBaisse.apres} — pool trop mince / déjà assigné.`
          : undefined,
      });
    }
    if (crees.length === 0) {
      return finir({ ids: [], raison: diag, quotaBaisse });
    }
    return finir({
      ids: crees,
      raison: `${crees.length}/${manquants} créé(s). ${diag}`,
      quotaBaisse,
    });
  }
  log(`Terminé : ${crees.length} passage(s)`);
  return finir({ ids: crees });
}

/** Pool labels×langue trop mince / épuisé → candidat au fallback baisse de quota. */
function estRaisonPoolPourBaisseQuota(diag: string): boolean {
  // Ne pas baisser le quota si le pool est OK (timeout batch) — on doit réessayer.
  if (/Pool « .+ » × .+ OK \(/i.test(diag) || /n'a probablement pas atteint/i.test(diag)) {
    return false;
  }
  return (
    /trop mince|épuisé|déjà tout assigné|importe \/ labellise/i.test(diag) ||
    /aucun éligible|pas de ligne ELO|pas de score ELO/i.test(diag) ||
    /aucun valide \+ import/i.test(diag) ||
    /Aucun slideshow tagué/i.test(diag) ||
    /Aucun label sur ce compte/i.test(diag)
  );
}

/**
 * Aligne posts_par_jour sur le nombre de posts réellement assignés ce jour.
 * Plancher strict = 1 (jamais 0) : un jour sans post ne doit pas désactiver
 * le compte pour les jours suivants.
 */
async function baisserQuotaSiBesoin(
  supabase: Supabase,
  compteId: string,
  quota: number,
  totalAssignes: number,
  diag: string,
  estTest: boolean,
  forcer: boolean,
  log: (detail: string) => void,
): Promise<QuotaBaisse | undefined> {
  if (estTest || forcer || totalAssignes >= quota) return undefined;
  // 0 assigné → on ne touche pas au quota (reste ≥1 pour retenter demain).
  if (totalAssignes <= 0) {
    log(`Quota inchangé (${quota}) — 0 assigné aujourd'hui, plancher 1 conservé`);
    return undefined;
  }
  const apres = Math.min(3, Math.max(1, totalAssignes));
  if (apres >= quota) return undefined;
  const { error: errQ } = await supabase
    .from("comptes")
    .update({ posts_par_jour: apres })
    .eq("id", compteId);
  if (errQ) {
    log(`Quota non baissé : ${errQ.message}`);
    return undefined;
  }
  log(`Quota baissé ${quota}→${apres} (pool trop mince, plancher 1)`);
  return { avant: quota, apres, raison: diag };
}

/* -------------------------------------------------------------------------
 * Multi-applications : l'application de chaque créneau.
 *
 * Un compte porte des labels ; chaque label sert une ou plusieurs applications
 * (`label_applications`, et un label SANS ligne sert Sophia). Le compte publie
 * selon `comptes.parts_applications` (NULL = 100 % Sophia), restreint aux
 * applications servies par ses labels, actives, ciblant sa langue — un compte
 * UGC reste Sophia. La part est tenue par DÉFICIT sur ses 10 derniers posts
 * (`choisirApplicationCreneau`) : en 70/30, toute suite de 10 posts compte 7/3.
 *
 * DEUX CHEMINS, et le premier est celui de toute la flotte au déploiement :
 *
 * - historique : schéma 0256 absent, OU parts effectives 100 % Sophia sans
 *   application imposée. Aucune fenêtre lue, labels Sophia, pool Sophia, deck
 *   `assurerDeckPourLangue`, passage inséré SANS les colonnes nouvelles. Seule
 *   différence une fois 0256 passée : le pool Sophia écarte les contenus notés
 *   explicitement non pertinents pour Sophia (une lecture par run, vide tant
 *   que personne n'importe pour une autre application).
 * - multi : fenêtre lue une fois par compte, application choisie par créneau,
 *   repli sur Sophia, écart de 7 jours entre deux applications sur un même
 *   contenu, colonnes `application_id` / `application_visee_id` / `repli_motif`.
 *
 * Le critère du chemin multi est la répartition EFFECTIVE et non la seule
 * éligibilité : quand Unswipe sera cochée sur les labels partagés, presque
 * tous les comptes seront éligibles à Unswipe sans en avoir la moindre part —
 * leur lire une fenêtre pour choisir Sophia à coup sûr coûterait 131 requêtes
 * pour rien.
 * ---------------------------------------------------------------------- */

interface Repartition {
  /** Migration 0256 en place (pool Sophia filtré par les pertinences). */
  pret: boolean;
  /** Chemin multi : fenêtre, application par créneau, colonnes nouvelles. */
  multi: boolean;
  sophia: ApplicationMoteur;
  /** Labels du compte qui servent Sophia — le pool et le diagnostic Sophia. */
  labelsSophia: string[];
  /** application_id → labels du compte qui la servent. */
  parApp: Map<string, string[]>;
  eligibles: ApplicationMoteur[];
  parts: PartsApplications;
  imposee: ApplicationMoteur | null;
  /** Derniers posts du compte, du plus ancien au plus récent (chemin multi). */
  fenetre: EntreeFenetre[];
}

async function preparerRepartition(
  supabase: Supabase,
  args: {
    compteId: string;
    jour: string;
    langue: string;
    ugcAi: boolean;
    labelIds: string[];
    labelRefs: LabelRef[];
    partsBrutes: unknown;
    imposee: string | null;
  },
  memo: MemoAssignation,
): Promise<Repartition> {
  const etat = await memoiser(memo.schema, "schema", () => sonderSchemaMultiApp(supabase));
  if (etat === "illisible") {
    // Sonde illisible (réseau, 5xx). Un compte qui ne demande que Sophia garde
    // le chemin d'avant : une panne passagère ne doit pas lui coûter sa nuit.
    // Un compte qui demande une autre application échoue (il sera rejoué au
    // rattrapage) plutôt que de publier Sophia à la place, en silence.
    const parts = normaliserParts(args.partsBrutes);
    const demandeAutre =
      Object.keys(parts ?? {}).some((slug) => slug !== SLUG_SOPHIA) ||
      (args.imposee !== null && args.imposee !== SLUG_SOPHIA);
    if (demandeAutre) {
      throw new Error("[multi-app] schéma illisible pour un compte multi-applications — à rejouer");
    }
  }
  if (etat !== "pret") {
    // Avant 0256 : le code d'avant, labels compris (tous, tels que lus).
    return {
      pret: false,
      multi: false,
      sophia: APPLICATION_SOPHIA_SECOURS,
      labelsSophia: args.labelIds,
      parApp: new Map([[ID_SOPHIA, args.labelIds]]),
      eligibles: [APPLICATION_SOPHIA_SECOURS],
      parts: { [SLUG_SOPHIA]: 100 },
      imposee: null,
      fenetre: [],
    };
  }

  const [applications, liens] = await Promise.all([
    memoiser(memo.applications, "applications", () => chargerApplicationsMoteur(supabase)),
    memoiser(
      memo.liens,
      cleLabels(args.labelIds),
      () => chargerLiensLabels(supabase, args.labelIds),
    ),
  ]);
  const parApp = labelsParApplication(args.labelRefs, liens);
  const eligibles = applicationsEligiblesCompte({
    applications,
    servies: [...parApp.keys()],
    langue: args.langue,
    ugc: args.ugcAi,
  });
  const parts = partsEffectives(
    normaliserParts(args.partsBrutes),
    eligibles.map((a) => a.slug),
  );
  const sophia = applications.find((a) => a.id === ID_SOPHIA) ?? APPLICATION_SOPHIA_SECOURS;
  const imposee = args.imposee
    ? eligibles.find((a) => a.slug === args.imposee) ?? null
    : null;
  const multi =
    Object.keys(parts).some((slug) => slug !== SLUG_SOPHIA) ||
    (imposee !== null && imposee.id !== ID_SOPHIA);

  const fenetre = multi
    ? await lireFenetreRepartition(
      supabase,
      args.compteId,
      args.jour,
      new Map(applications.map((a) => [a.id, a.slug])),
    )
    : [];

  return {
    pret: true,
    multi,
    sophia,
    labelsSophia: parApp.get(ID_SOPHIA) ?? [],
    parApp,
    eligibles,
    parts,
    imposee,
    fenetre,
  };
}

/**
 * Les FENETRE_REPARTITION_DEFAUT derniers posts réels du compte (hors test),
 * jusqu'au jour assigné inclus, rendus du plus ancien au plus récent.
 *
 * Bornée par construction (`limit` 10, très loin du plafond de 1000) : c'est
 * une fenêtre, pas un inventaire. Le jour même est inclus — un passage déjà
 * posé aujourd'hui (rappel, run précédent) compte dans la répartition.
 *
 * Une lecture ratée NE lève PAS, et c'est délibéré à rebours de la règle
 * « échec ≠ vide » du fichier : aucune décision persistante n'en découle (ni
 * quota, ni rejet), seulement le choix d'application du créneau. Fenêtre vide
 * = la plus grosse part d'abord ; faire tomber le compte entier pour ça lui
 * coûterait ses posts du jour.
 */
export async function lireFenetreRepartition(
  supabase: Supabase,
  compteId: string,
  jour: string,
  slugParId: Map<string, string>,
  taille: number = FENETRE_REPARTITION_DEFAUT,
): Promise<EntreeFenetre[]> {
  const { data, error } = await supabase
    .from("passages")
    .select("application_id, date_publication_prevue, created_at, posts!inner(est_test)")
    .eq("compte_id", compteId)
    .eq("posts.est_test", false)
    .lte("date_publication_prevue", jour)
    .order("date_publication_prevue", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(taille);
  if (error) {
    console.warn(`[assignation] fenêtre de répartition illisible (${compteId}) : ${error.message}`);
    return [];
  }
  return ((data ?? []) as Array<{ application_id: string | null }>)
    .map((p): EntreeFenetre => ({
      application: slugParId.get(String(p.application_id)) ?? String(p.application_id),
      poids: 1,
    }))
    .reverse();
}

/** Application du prochain créneau : imposée (recharge) sinon par déficit. */
function applicationDuCreneau(r: Repartition): ApplicationMoteur {
  if (r.imposee) return r.imposee;
  const slug = choisirApplicationCreneau(r.parts, r.fenetre);
  return r.eligibles.find((a) => a.slug === slug) ?? r.sophia;
}

/** Colonnes 0256 d'un passage du chemin multi. */
function colonnesApplicationPassage(
  app: ApplicationMoteur,
  repli: { visee: ApplicationMoteur; motif: MotifRepli } | null,
): Record<string, string> {
  const colonnes: Record<string, string> = { application_id: app.id };
  if (repli) {
    colonnes.application_visee_id = repli.visee.id;
    colonnes.repli_motif = repli.motif;
  }
  return colonnes;
}

/** Écart en jours entre deux dates `YYYY-MM-DD` (valeur absolue). */
function ecartJours(a: string, b: string): number {
  const ta = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const tb = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb) / 86_400_000;
}

/** Règle d'application d'un pool : quelle application, pour quelle langue. */
export interface RegleApplication {
  application: ApplicationMoteur;
  langue: string;
}

/**
 * Contenus d'une application dans `contenu_pertinences`, filtrés sur
 * `eligible`. Sophia : on lit les EXCLUS (`eligible = false`) — pas de ligne
 * vaut éligible. Autres : on lit les ÉLIGIBLES — pas de ligne vaut absent.
 *
 * Lu EN ENTIER (le stock Unswipe se comptera en milliers) : ancre
 * `contenu_id`, unique à application fixée (clé primaire du couple).
 */
function contenusPertinence(
  supabase: Supabase,
  applicationId: string,
  eligible: boolean,
  memo?: MemoAssignation,
): Promise<Set<string>> {
  const lire = async () => {
    const lignes = await lireTout<{ contenu_id: string }>(
      `Pertinences ${eligible ? "éligibles" : "exclues"} (application ${applicationId})`,
      (curseur, taille) => {
        let q = supabase
          .from("contenu_pertinences")
          .select("contenu_id")
          .eq("application_id", applicationId)
          .eq("eligible", eligible);
        if (curseur) q = q.gt("contenu_id", curseur.contenu_id);
        return q.order("contenu_id", { ascending: true }).limit(taille);
      },
      { ancre: (l) => l.contenu_id },
    );
    return new Set(lignes.map((l) => l.contenu_id));
  };
  if (!memo) return lire();
  return memoiser(memo.pertinences, `${applicationId}::${eligible ? "ok" : "ko"}`, lire);
}

/**
 * Contenus dont le deck de cette application, dans cette langue, ne servira
 * pas : `ineligible`, ou `echec` de moins de 24 h (le délai avant nouvel essai
 * de `assurerDeckApplication`). Inutile de les tirer, le deck le redirait —
 * et un tirage gaspillé sur eux épuiserait les essais du créneau.
 * Ancre `id` (la ligne de deck), pas `contenu_id`.
 */
function decksIneligibles(
  supabase: Supabase,
  app: ApplicationMoteur,
  langue: string,
  memo?: MemoAssignation,
): Promise<Set<string>> {
  const lire = async () => {
    const lignes = await lireTout<
      { id: string; contenu_id: string; statut: string; updated_at: string | null }
    >(
      `Decks ${app.slug} à écarter (${langue})`,
      (curseur, taille) => {
        let q = supabase
          .from("contenu_langue_decks")
          .select("id, contenu_id, statut, updated_at")
          .eq("application_id", app.id)
          .eq("langue", langue)
          .eq("variante", app.slug)
          .in("statut", ["ineligible", "echec"]);
        if (curseur) q = q.gt("id", curseur.id);
        return q.order("id", { ascending: true }).limit(taille);
      },
      { ancre: (l) => l.id },
    );
    const maintenant = Date.now();
    return new Set(
      lignes
        .filter((l) =>
          l.statut === "ineligible" ||
          maintenant - Date.parse(l.updated_at ?? "") < DELAI_REESSAI_ECHEC_MS
        )
        .map((l) => l.contenu_id),
    );
  };
  if (!memo) return lire();
  return memoiser(memo.decksIneligibles, `${app.id}::${langue}`, lire);
}

/**
 * Un deck vient d'être déclaré inéligible : les comptes suivants du run ne le
 * tirent plus. On n'ajoute qu'à un ensemble DÉJÀ lu (sinon la lecture suivante
 * le verra de toute façon en base).
 */
async function noterDeckIneligible(
  memo: MemoAssignation,
  app: ApplicationMoteur,
  langue: string,
  contenuId: string,
): Promise<void> {
  const ensemble = memo.decksIneligibles.get(`${app.id}::${langue}`);
  if (!ensemble) return;
  try {
    (await ensemble).add(contenuId);
  } catch {
    // Lecture en échec : déjà retirée du mémo, rien à noter.
  }
}

/**
 * Règles d'application posées SUR le pool labels × prêts × UGC.
 *
 * - Sophia : tout le pool, moins les contenus notés explicitement non
 *   pertinents pour Sophia (importés pour une autre application).
 * - Autre application : il FAUT une ligne éligible ; jamais d'UGC (Unswipe =
 *   slideshows classiques) ; et pas un contenu dont le deck est inéligible.
 */
async function appliquerRegleApplication(
  supabase: Supabase,
  base: ContenuCandidat[],
  regle: RegleApplication,
  ugcAi: boolean,
  memo?: MemoAssignation,
): Promise<ContenuCandidat[]> {
  if (base.length === 0) return base;
  if (regle.application.id === ID_SOPHIA) {
    const exclus = await contenusPertinence(supabase, ID_SOPHIA, false, memo);
    return exclus.size === 0 ? base : base.filter((c) => !exclus.has(c.id));
  }
  if (ugcAi) return [];
  const [eligibles, ineligibles] = await Promise.all([
    contenusPertinence(supabase, regle.application.id, true, memo),
    decksIneligibles(supabase, regle.application, regle.langue, memo),
  ]);
  return base.filter(
    (c) => c.ugc_compatible === false && eligibles.has(c.id) && !ineligibles.has(c.id),
  );
}

/* -------------------------------------------------------------------------
 * Le pool d'assignation, lu EN ENTIER.
 *
 * `lireParLots` découpe le FILTRE (100 `label_id` par requête), jamais le
 * RÉSULTAT. Sur `contenu_labels` la relation est many-to-one, et c'est ce qui
 * rend le découpage inopérant ici : les 9 labels du dépôt tiennent tous dans UN
 * lot, donc une seule requête part — et elle ramène aujourd'hui 965 lignes pour
 * alpha_male, 951 pour smart_girl. Un compte qui porte les deux en demande
 * 1916 : PostgREST en rend 1000 et répond 200.
 *
 * Il n'y a alors rien à relire. `contenusLabel.length === 0` ne se déclenche
 * pas, le pool amputé passe pour le pool entier, le tirage puise dans ~900
 * contenus de moins, et en bout de chaîne `baisserQuotaSiBesoin` abaisse
 * `posts_par_jour` parce que le pool « paraît mince ». C'est la panne du 20/08
 * — un pool plein pris pour un pool vide, 41 créateurs à 0 post/jour — sous sa
 * forme silencieuse : aucune erreur 400 cette fois, juste un inventaire
 * amputé qui a l'air complet.
 * ---------------------------------------------------------------------- */

/**
 * Contenus portant au moins un des labels, sans troncature possible.
 *
 * Boucle LABEL PAR LABEL, et c'est le point à ne pas rater. L'autre forme —
 * un seul passage sur tous les labels à la fois, ancré sur `contenu_id` — a
 * une ancre NON UNIQUE : la clé primaire de `contenu_labels` est le couple
 * `(contenu_id, label_id)`, un contenu y a une ligne par label qu'il porte.
 * Quand une page se termine au milieu des lignes d'un contenu, reprendre à
 * `contenu_id > curseur` saute les autres ; reprendre à `>=` reboucle sur lui
 * sans fin.
 *
 * Le piège, ici, est que ça MARCHERAIT quand même — et c'est pour ça qu'il faut
 * l'écarter explicitement. Les lignes perdues sont d'autres liens du MÊME
 * contenu, dont l'id est déjà dans l'ensemble : la fonction rendrait le bon
 * résultat, mais par une propriété de son APPELANT (il déduplique) et non par
 * une propriété de sa LECTURE. Le jour où quelqu'un ajoute `label_id` au select
 * pour savoir quel label a matché, ou compte les liens, la lecture se remet à
 * mentir sans qu'une ligne de code de la pagination ait bougé. C'est exactement
 * la forme de raisonnement implicite que cet incident punit.
 *
 * L'ancre réellement unique serait le couple, exprimable en PostgREST par
 * `.or("label_id.gt.X,and(label_id.eq.X,contenu_id.gt.Y)")` : correct, mais
 * illisible pour un gain nul. Les labels sont une poignée (9 en base), et à
 * l'intérieur d'UN label `contenu_id` est unique — l'ancre redevient vérifiable
 * de tête. On paie un aller-retour par label.
 *
 * Le résultat reste dédupliqué (un contenu peut porter deux labels du compte).
 * Son ORDRE change — labels puis `contenu_id` au lieu de l'ordre de tas — et
 * c'est sans effet sur l'assignation : les deux appelants n'en font qu'un
 * ensemble d'ids, le tirage (`bandesDeTirage` + `tirerAuHasard`) est aléatoire
 * et le repêchage (`repecherContenuD`) mélange avant de choisir.
 */
export async function contenuIdsDesLabels(
  supabase: Supabase,
  labelIds: string[],
  quoi: string,
  memo?: MemoAssignation,
): Promise<string[]> {
  if (!memo) return await lireContenuIdsDesLabels(supabase, labelIds, quoi);
  // Copie à chaque service : le mémo rend la MÊME instance à tous les
  // appelants, et l'un d'eux finira par trier ou filtrer en place.
  const ids = await memoiser(
    memo.labels,
    cleLabels(labelIds),
    () => lireContenuIdsDesLabels(supabase, labelIds, quoi),
  );
  return [...ids];
}

async function lireContenuIdsDesLabels(
  supabase: Supabase,
  labelIds: string[],
  quoi: string,
): Promise<string[]> {
  const ids = new Set<string>();
  for (const labelId of labelIds) {
    const liens = await lireTout<{ contenu_id: string }>(
      `${quoi} (label ${labelId})`,
      (curseur, taille) => {
        let q = supabase.from("contenu_labels").select("contenu_id").eq("label_id", labelId);
        if (curseur) q = q.gt("contenu_id", curseur.contenu_id);
        return q.order("contenu_id", { ascending: true }).limit(taille);
      },
      { ancre: (l) => l.contenu_id },
    );
    for (const l of liens) ids.add(l.contenu_id);
  }
  return [...ids];
}

/**
 * Pool des slideshows assignables : labels ∩ prêts ∩ UGC, puis la règle de
 * l'application du créneau (multi-app) par-dessus.
 *
 * La lecture de base est mémoïsée par (labels, ugc) — les DEUX, et pas
 * seulement les labels. `ugc_compatible` est un filtre de cette lecture : une
 * clé qui l'oublierait servirait le pool d'un créateur UGC à un créateur
 * classique, ce qui n'est plus une optimisation mais un changement d'ensemble
 * de candidats. La clé porte donc exactement ce que la requête filtre.
 *
 * `contenus.application_id` n'en fait PLUS partie : les contenus ne sont plus
 * rattachés à une application (un post importé une fois sert toutes les
 * applications de ses labels). La colonne reste en base, figée à Sophia, pour
 * les lecteurs historiques. Ce qui sépare les applications, c'est désormais
 * `regle` — appliquée APRÈS la base, sur des ensembles eux-mêmes mémoïsés par
 * run (`appliquerRegleApplication`). Sans `regle` (schéma 0256 absent), le
 * pool est celui d'avant au contenu près : le filtre application était un
 * no-op en prod (comptes actifs et contenus labellisés prêts tous Sophia,
 * vérifié en base avant ce changement).
 *
 * Les messages d'erreur (« Slideshows du label », « Slideshows prêts ») sont
 * conservés au mot près : ils remontent tels quels dans les rapports de run.
 */
export async function poolContenusPrets(
  supabase: Supabase,
  labelIds: string[],
  args: { ugcAi: boolean; regle?: RegleApplication | null },
  memo?: MemoAssignation,
): Promise<ContenuCandidat[]> {
  const lire = async () => {
    const contenusLabel = await contenuIdsDesLabels(
      supabase,
      labelIds,
      "Slideshows du label",
      memo,
    );
    if (contenusLabel.length === 0) return [];
    // UGC AI ↔ slideshows ugc_compatible ; créateurs classiques ↔ non-UGC.
    return await lireParLots<ContenuCandidat>(
      contenusLabel,
      "Slideshows prêts",
      (lot) =>
        supabase
          .from("contenus")
          .select("id, musique_url, musique_titre, musique_plateforme, ugc_compatible")
          .eq("statut", "valide")
          .eq("import_statut", "done")
          .eq("ugc_compatible", args.ugcAi)
          .in("id", lot),
    );
  };
  // Copie du tableau, même raison que pour les ids de labels : l'appelant en
  // dérive `contenuIds` / `meta` et ne doit pas pouvoir abîmer l'entrée du mémo.
  const base = memo
    ? [...(await memoiser(memo.pool, `${cleLabels(labelIds)}::${args.ugcAi ? "ugc" : "std"}`, lire))]
    : await lire();
  if (!args.regle) return base;
  return await appliquerRegleApplication(supabase, base, args.regle, args.ugcAi, memo);
}

/**
 * Historique des passages de CE compte sur les contenus candidats.
 *
 * DEUX bornes à tenir, et une seule était tenue. `lireParLots` découpe le
 * FILTRE (100 `contenu_id` par requête) : il protège du 400 sur URL trop
 * longue, pas de la troncature à `max-rows`. Or la relation est many-to-one —
 * un compte a plusieurs passages par contenu, et un lot de 100 contenus peut
 * donc ramener bien plus de 100 lignes. Découper le filtre ne borne pas le
 * résultat.
 *
 * Volumétrie d'aujourd'hui, faite honnêtement : un compte tourne à ~2 passages
 * par jour (quota 1–3, plus les rappels J+7), l'historique remonte à juillet,
 * soit ~120 passages sur 60 jours. Le résultat est de toute façon borné par le
 * nombre TOTAL de passages du compte, et encore réparti sur ~19 lots. Les 1000
 * lignes sont hors d'atteinte aujourd'hui : il faudrait ~500 jours de compte à
 * quota plein, tous ses passages tombant sur les mêmes 100 contenus.
 *
 * On pagine quand même, parce qu'ici ça ne coûte RIEN. `lireTout` sort sur page
 * courte : une lecture qui rend 120 lignes pour une page de 999 demandées fait
 * exactement UN aller-retour, comme avant. On n'échange donc pas du temps
 * contre de la sûreté, on retire une échéance — celle du jour où le compte le
 * plus ancien de la flotte franchit le plafond, et où le garde-fou de
 * complétude se mettrait à lever dans la boucle de pioche.
 *
 * L'ancre est `passages.id` (uuid, unique sur toute la table) et non
 * `contenu_id` : avec plusieurs passages par contenu, `contenu_id` n'est pas
 * unique et la pagination sauterait ou reboucherait — c'est le piège décrit
 * dans `lots.ts`. L'ordre de lecture n'a aucun effet en aval : l'appelant
 * n'agrège qu'un maximum de dates par contenu.
 */
export async function lireHistoriquePassages(
  supabase: Supabase,
  compteId: string,
  contenuIds: string[],
  // Chemin multi-app seulement : `application_id` (colonne 0256) pour l'écart
  // minimal entre deux applications. Ailleurs, le select reste celui d'avant.
  avecApplication = false,
): Promise<PassageHisto[]> {
  const colonnes = avecApplication
    ? "id, contenu_id, date_publication_prevue, application_id, posts(est_test)"
    : "id, contenu_id, date_publication_prevue, posts(est_test)";
  const hist: PassageHisto[] = [];
  for (const lot of decouperEnLots(contenuIds, LOT_IDS)) {
    const lignes = await lireTout<PassageHisto>(
      `Historique des passages (${lot.length} contenu(s))`,
      async (curseur, taille) => {
        let q = supabase
          .from("passages")
          .select(colonnes)
          .eq("compte_id", compteId)
          .in("contenu_id", lot);
        if (curseur) q = q.gt("id", curseur.id);
        // Select dynamique : le typage de postgrest-js ne sait pas le lire.
        const { data, error } = await q.order("id", { ascending: true }).limit(taille);
        return { data: (data ?? null) as unknown as PassageHisto[] | null, error };
      },
      { ancre: (h) => h.id },
    );
    hist.push(...lignes);
  }
  return hist;
}

/** Explique pourquoi le pool labels ∩ langue est vide / trop petit. */
async function diagnostiquerPoolVide(
  supabase: Supabase,
  labelIds: string[],
  labelNoms: string[],
  langue: string,
  ugcAi = false,
  ignorerTierlist = false,
  memo?: MemoAssignation,
): Promise<string> {
  const labelsTxt = labelNoms.length > 0 ? labelNoms.join(", ") : `${labelIds.length} label(s)`;

  // Un diagnostic tronqué est pire qu'un diagnostic absent : il ferme
  // l'enquête. C'est ce texte que l'admin lit pour comprendre pourquoi un
  // créateur est tombé à 0 post/jour, et c'est lui qui sert de justification
  // écrite à la baisse de quota — il doit porter sur le pool entier.
  //
  // Mémo partagé avec la pioche : le diagnostic tombe juste après elle, sur les
  // mêmes labels, et relire tout le mapping pour écrire un message serait payer
  // une seconde fois la lecture la plus chère du chemin. Le `quoi` ne diverge
  // que dans le message d'une lecture en ÉCHEC — et un échec n'est jamais
  // mémoïsé, donc le message reste juste.
  const idsLabel = await contenuIdsDesLabels(
    supabase,
    labelIds,
    "Diagnostic — slideshows du label",
    memo,
  );
  if (idsLabel.length === 0) {
    return `Aucun slideshow tagué « ${labelsTxt} » dans la bibliothèque.`;
  }

  const prets = await lireParLots<{ id: string }>(
    idsLabel,
    "Diagnostic — slideshows prêts",
    (lot) =>
      supabase
        .from("contenus")
        .select("id")
        .eq("statut", "valide")
        .eq("import_statut", "done")
        .eq("ugc_compatible", ugcAi)
        .in("id", lot),
  );
  const idsPrets = prets.map((c) => c.id);
  if (idsPrets.length === 0) {
    return (
      `${idsLabel.length} slideshow(s) « ${labelsTxt} » mais aucun valide + import terminé` +
      (ugcAi ? " + checkmark UGC" : " (non-UGC)") +
      "."
    );
  }

  if (ignorerTierlist) {
    return (
      `Pool « ${labelsTxt} » × ${langue.toUpperCase()} épuisé (mode test sans tierlist) — ` +
      `${idsPrets.length} slideshow(s) prêt(s), déjà tout assigné ou deck impossible.`
    );
  }

  const etats = await lireParLots<{ contenu_id: string; restants: number; passages_prevus: number }>(
    idsPrets,
    "Diagnostic — état tierlist",
    (lot) =>
      supabase
        .from("contenu_tier_etat")
        .select("contenu_id, restants, passages_prevus")
        .in("contenu_id", lot),
  );
  const avecPassages = etats.filter((e) => (e.restants ?? 0) > 0).length;
  const dormants = etats.filter((e) => (e.passages_prevus ?? 0) <= 0).length;

  if (avecPassages === 0 && dormants === 0) {
    return (
      `${idsPrets.length} slideshow(s) « ${labelsTxt} » prêts, mais tous ont épuisé ` +
      `leurs passages et attendent leur requalification (minuit).`
    );
  }
  if (avecPassages === 0) {
    return (
      `Pool « ${labelsTxt} » épuisé : plus aucun passage à effectuer, ` +
      `${dormants} slideshow(s) en D disponibles au repêchage — ` +
      `le repêchage a échoué (concurrence) ou le deck ${langue.toUpperCase()} n'a pas pu être produit.`
    );
  }

  // Beaucoup de candidats : le pool n'est PAS vide — minuit a souvent
  // timeout avant d'atteindre ce compte (batch trop long).
  if (avecPassages >= 15) {
    return (
      `Pool « ${labelsTxt} » × ${langue.toUpperCase()} OK (${avecPassages} slideshow(s) avec passages à faire) — ` +
      `minuit n'a probablement pas atteint ce compte (timeout batch). ` +
      `Réassigne les incomplets (bouton parallèle) ; sinon baisse auto du quota.`
    );
  }

  return (
    `Pool « ${labelsTxt} » × ${langue.toUpperCase()} trop mince ` +
    `(${avecPassages} slideshow(s) avec passages à faire, ${dormants} en D) — ` +
    `importe / labellise d'autres slideshows (sinon minuit baisse le quota du créateur).`
  );
}

interface SlideStructure {
  position: number;
  media_id?: string | null;
  raw_url?: string | null;
  reference_url?: string | null;
  pinned?: boolean;
  critere?: string | null;
}

interface SlideLangue {
  position: number;
  texte_overlay: string | null;
  position_sophia: boolean;
}

/**
 * Crée le `posts` + `post_slides` que le poster consomme, liés au passage.
 * Deck déjà traduit + Sophia (assurerDeckPourLangue) → pipeline_statut = done.
 *
 * Important : un `media_id` fantôme (média supprimé) faisait échouer l'INSERT
 * `post_slides` (FK) après création du post — passage orphelin + post vide.
 * On nullifie les médias absents, et on rollback le post si les slides
 * n'ont pas pu être écrites.
 */
async function materialiserPostDepuisPassage(
  supabase: Supabase,
  args: {
    passageId: string;
    compteId: string;
    contenuId: string;
    jour: string;
    slides: SlideLangue[];
    musique_url: string | null;
    musique_titre: string | null;
    musique_plateforme: string | null;
    hashtags: string;
    estTest?: boolean;
    /**
     * Application promue (copie de `passages.application_id`). Absente ou
     * nulle : la colonne n'est pas écrite — défaut Sophia, et insert identique
     * à celui d'avant 0256 sur le chemin historique.
     */
    applicationId?: string | null;
  },
): Promise<string> {
  const { data: contenu, error: errC } = await supabase
    .from("contenus")
    .select("id, sujet_id, structure_slides, titre")
    .eq("id", args.contenuId)
    .single();
  if (errC || !contenu) throw errC ?? new Error("Contenu introuvable pour pont post");

  if (!args.slides.length) {
    throw new Error("Deck vide — impossible de matérialiser le post");
  }

  const structure = (contenu.structure_slides ?? []) as SlideStructure[];
  // Positions parfois number / parfois string selon JSONB → clé normalisée.
  const parPos = new Map(structure.map((s) => [Number(s.position), s]));

  const { parPos: mediaResolus, logs: visuelsLogs } = await resoudreVisuelsAssignation(
    supabase,
    args.contenuId,
    structure.map((s) => ({
      position: Number(s.position),
      media_id: s.media_id ?? null,
      pinned: Boolean(s.pinned && s.media_id),
      critere: s.critere ?? null,
      raw_url: s.raw_url ?? null,
      reference_url: s.reference_url ?? null,
    })) as SlideStructureManuel[],
  );
  if (visuelsLogs.some((l) => l.fallback)) {
    console.log(
      `[assignation] contenu=${args.contenuId} visuels ` +
        visuelsLogs
          .map((l) => `#${l.position}:${l.motif}`)
          .join(" · "),
    );
  }

  const mediaIds = [
    ...new Set(
      [...mediaResolus.values(), ...structure.map((s) => s.media_id)]
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const mediaOk = new Set<string>();
  if (mediaIds.length > 0) {
    // Bornée par le nombre de slides d'UN deck (une dizaine) : un média par id,
    // donc ni l'URL ni la réponse ne peuvent approcher leurs plafonds. On passe
    // quand même par `lireParLots` plutôt que de le supposer — le découpage est
    // sans coût sur un seul lot, et un deck qui exploserait un jour ne
    // casserait pas la matérialisation du post.
    const existants = await lireParLots<{ id: string }>(
      mediaIds,
      "Médias des slides du deck",
      (lot) => supabase.from("media_library").select("id").in("id", lot),
    );
    for (const m of existants) mediaOk.add(m.id);
  }

  const { data: post, error: errP } = await supabase
    .from("posts")
    .insert({
      compte_id: args.compteId,
      sujet_id: contenu.sujet_id ?? null,
      type: "contenu",
      statut: "assigne",
      date_publication_prevue: args.jour,
      musique_url: args.musique_url,
      musique_titre: args.musique_titre,
      musique_plateforme: args.musique_plateforme,
      hashtags: args.hashtags,
      pipeline_statut: "done",
      pipeline_etape: null,
      pipeline_erreur: null,
      est_test: Boolean(args.estTest),
      ...(args.applicationId ? { application_id: args.applicationId } : {}),
    })
    .select("id")
    .single();
  if (errP || !post) throw errP ?? new Error("Création post pont échouée");

  const rows = args.slides.map((s) => {
    const visuel = parPos.get(Number(s.position));
    const mid = mediaResolus.get(Number(s.position)) ?? visuel?.media_id ?? null;
    return {
      post_id: post.id,
      position: Number(s.position),
      media_id: mid && mediaOk.has(mid) ? mid : null,
      texte_overlay: s.texte_overlay ?? "",
      position_sophia: Boolean(s.position_sophia),
      reference_url: visuel?.reference_url ?? visuel?.raw_url ?? null,
    };
  });

  const { error: errS } = await supabase.from("post_slides").insert(rows);
  if (errS) {
    await supabase.from("posts").delete().eq("id", post.id);
    throw errS;
  }

  const { error: errL } = await supabase
    .from("passages")
    .update({
      post_id: post.id,
      visuels_resolution: visuelsLogs,
    })
    .eq("id", args.passageId);
  if (errL) {
    await supabase.from("posts").delete().eq("id", post.id);
    throw errL;
  }
  return post.id as string;
}

async function choisirContenu(
  supabase: Supabase,
  compteId: string,
  langue: string,
  labelIds: string[],
  jour: string,
  reglages: AssignationReglages,
  dejaCreesCetteSession: string[],
  ugcAi = false,
  opts: {
    ignorerTierlist?: boolean;
    exclureTestsHisto?: boolean;
    /** Règle d'application du pool (schéma 0256 en place) ; absente = pool d'avant. */
    regle?: RegleApplication | null;
    /**
     * Chemin multi-app : id de l'application du créneau. Écarte un contenu que
     * CE compte a passé pour une AUTRE application à moins de
     * ECART_MIN_JOURS_AUTRE_APPLICATION jours du jour assigné.
     */
    espacement?: string | null;
  } = {},
  memo?: MemoAssignation,
): Promise<Candidat | null> {
  const ignorerTierlist = Boolean(opts.ignorerTierlist);
  // Labels du compte → contenus prêts. Invariant pendant le run : mémoïsé (voir
  // le bloc « Mémo de RUN »), au lieu d'être relu à chaque tentative de pioche.
  const contenus = await poolContenusPrets(
    supabase,
    labelIds,
    { ugcAi, regle: opts.regle ?? null },
    memo,
  );
  if (contenus.length === 0) return null;

  const contenuIds = contenus.map((c) => c.id);
  const meta = new Map(contenus.map((c) => [c.id, c]));

  // État tierlist : passages publiés / en vol / restants sur le cycle courant.
  const etats = await lireParLots<TierEtatLigne>(
    contenuIds,
    "État tierlist",
    (lot) =>
      supabase
        .from("contenu_tier_etat")
        .select("contenu_id, tier, tier_cycle, passages_prevus, restants")
        .in("contenu_id", lot),
  );
  const etatParContenu = new Map(etats.map((e) => [e.contenu_id, e]));

  // Historique passages de CE compte (hors posts test si demandé).
  const espacement = opts.espacement ?? null;
  const hist = await lireHistoriquePassages(supabase, compteId, contenuIds, espacement !== null);
  const derniere = new Map<string, string>();
  /**
   * Même contenu, autre application, à moins de 7 jours sur CE compte : deux
   * decks quasi identiques se voleraient leurs stats au rattrapage et passeraient
   * pour du doublon aux yeux de TikTok. `dejaPoste` reste, lui, sans
   * application : il ne fait qu'ordonner les bandes de tirage.
   */
  const tropProches = new Set<string>();
  for (const h of hist) {
    if (opts.exclureTestsHisto && estPassageDeTest(h.posts)) continue;
    const d = h.date_publication_prevue ?? "";
    const prev = derniere.get(h.contenu_id);
    if (!prev || d > prev) derniere.set(h.contenu_id, d);
    if (
      espacement !== null &&
      d &&
      h.application_id &&
      h.application_id !== espacement &&
      ecartJours(d, jour) < ECART_MIN_JOURS_AUTRE_APPLICATION
    ) {
      tropProches.add(h.contenu_id);
    }
  }
  const idsTirables = tropProches.size === 0
    ? contenuIds
    : contenuIds.filter((cid) => !tropProches.has(cid));

  const construire = (cid: string, e: TierEtatLigne | undefined, repeche: boolean): Candidat | null => {
    const m = meta.get(cid);
    if (!m) return null;
    const tier = estTier(e?.tier) ? e!.tier : "D";
    return {
      contenuId: cid,
      tier,
      tierCycle: e?.tier_cycle ?? 0,
      restants: e?.restants ?? 0,
      repeche,
      slides: null,
      musique_url: m.musique_url,
      musique_titre: m.musique_titre,
      musique_plateforme: m.musique_plateforme,
      dejaPoste: derniere.has(cid),
      derniereDate: derniere.get(cid) ?? null,
    };
  };

  // Pool du jour : les contenus qui ont encore des passages à effectuer.
  // Un passage assigné mais jamais publié n'est pas consommé — la vue le
  // compte « en vol » une semaine, puis il retourne au pool.
  const pool: Candidat[] = [];
  for (const cid of idsTirables) {
    if (dejaCreesCetteSession.includes(cid)) continue;
    const e = etatParContenu.get(cid);
    if (!ignorerTierlist && (e?.restants ?? 0) <= 0) continue;
    const candidat = construire(cid, e, false);
    if (!candidat) continue;
    pool.push(candidat);
  }

  // Bandes servies dans l'ordre : B+ d'abord, et seulement si le pool n'a plus
  // rien en B ou au-dessus, le bas de tierlist (C, D repêché dont le passage
  // est encore en vol). Un contenu peut repasser sur le même compte : à rang
  // équivalent, le tirage préfère du neuf quand il y en a.
  for (const bande of bandesDeTirage(pool)) {
    const pick = tirerAuHasard(bande);
    if (pick) return pick;
  }

  // Pool épuisé pour ce compte : on repêche un contenu en D et on lui redonne
  // un passage. Le repêchage est par compte — inutile de réveiller un D que
  // personne ne peut poster (labels / application / UGC).
  if (ignorerTierlist) return null;
  return await repecherContenuD(
    supabase,
    idsTirables,
    etatParContenu,
    dejaCreesCetteSession,
    reglages.repechagePassages,
    construire,
  );
}

interface TierEtatLigne {
  contenu_id: string;
  tier: Tier;
  tier_cycle: number;
  passages_prevus: number;
  restants: number;
}

/**
 * Repêche un contenu en D (0 passage prévu) et lui rend un passage, pour
 * combler le pool quand il y a plus de créneaux que de passages à effectuer.
 *
 * Le `eq("passages_prevus", 0)` rend l'opération atomique : deux comptes
 * assignés en parallèle ne peuvent pas repêcher le même contenu.
 */
async function repecherContenuD(
  supabase: Supabase,
  contenuIds: string[],
  etatParContenu: Map<string, TierEtatLigne>,
  dejaCreesCetteSession: string[],
  passages: number,
  construire: (cid: string, e: TierEtatLigne | undefined, repeche: boolean) => Candidat | null,
): Promise<Candidat | null> {
  const dormants = contenuIds.filter((cid) => {
    if (dejaCreesCetteSession.includes(cid)) return false;
    const e = etatParContenu.get(cid);
    return e !== undefined && e.passages_prevus <= 0;
  });
  if (dormants.length === 0) return null;

  // Ordre aléatoire : le repêchage ne doit pas toujours réveiller les mêmes.
  for (let i = dormants.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [dormants[i], dormants[j]] = [dormants[j], dormants[i]];
  }

  for (const cid of dormants.slice(0, 10)) {
    const { data, error } = await supabase
      .from("contenus")
      .update({ passages_prevus: passages })
      .eq("id", cid)
      .eq("passages_prevus", 0)
      .select("id, tier, tier_cycle")
      .maybeSingle();
    if (error || !data) continue;
    const etat: TierEtatLigne = {
      contenu_id: cid,
      tier: estTier(data.tier) ? (data.tier as Tier) : "D",
      tier_cycle: Number(data.tier_cycle ?? 0),
      passages_prevus: passages,
      restants: passages,
    };
    etatParContenu.set(cid, etat);
    return construire(cid, etat, true);
  }
  return null;
}

/** Assigne tous les comptes actifs pour un jour. */
export type AssignationCompteResultat = {
  compteId: string;
  crees: number;
  passageIds?: string[];
  erreur?: string;
  raison?: string;
  quotaBaisse?: QuotaBaisse & { nom?: string };
  /** Créneaux repliés sur Sophia (multi-app) — Pilotage les affiche. */
  replis?: RepliCreneau[];
  /** Voir AssignationCompteDetail.nonServable. */
  nonServable?: boolean;
};

/** Comptes en process (warmup OK, pas UGC video) encore sous leur quota du jour. */
export async function listerComptesSousQuota(
  supabase: Supabase,
  jour: string,
  opts: { ignorerWarmup?: boolean } = {},
  // deno-lint-ignore no-explicit-any
): Promise<any[]> {
  // Lecture non bornée, LAISSÉE TELLE QUELLE — et c'est un choix, pas un oubli.
  //
  // La flotte compte 131 comptes actifs, très loin des 1000 lignes du plafond
  // PostgREST : la troncature n'est pas atteignable aujourd'hui. Et la paginer
  // coûterait ce qu'on refuse de payer ici : `lireTout` exige un `.order(ancre)`,
  // donc l'ordre de ce tableau passerait de l'ordre de tas à l'ordre des `id` —
  // or c'est exactement ce tableau que `assignerDrainLot` tranche en
  // `slice(0, DRAIN_BATCH)`. On changerait l'ordre dans lequel les créateurs
  // sont servis, c'est-à-dire de la politique, pour corriger une troncature qui
  // n'existe pas. Ce n'est pas le chantier.
  //
  // POUR LE PROCHAIN QUI PASSE, parce que l'échéance est réelle : à 1000 comptes
  // actifs, le garde-fou de complétude lèvera ici — avant la boucle par compte,
  // hors de son try/catch — et le drain entier s'arrêtera. La bonne sortie ce
  // jour-là n'est pas un `.limit()` (il masquerait la troncature) mais une
  // pagination keyset sur `id`, en vérifiant d'abord que l'ordre de service du
  // drain peut devenir déterministe. Le repère utile : à ~500 comptes, s'y mettre.
  const { data: comptesBruts, error } = await supabase
    .from("comptes")
    .select("*")
    .eq("is_active", true);
  if (error) throw error;

  const maintenant = Date.now();
  const comptes = (comptesBruts ?? []).filter((c) => {
    if (c.type_compte === "cm") return false;
    if (Boolean(c.ugc_ai_video)) return false;
    // Quota 0 (legacy) = toujours à traiter (plancher 1).
    if (opts.ignorerWarmup) return true;
    const ends = c.warmup_ends_at as string | null | undefined;
    if (!ends) return false;
    return new Date(ends).getTime() <= maintenant;
  });
  if (comptes.length === 0) return [];

  const ids = comptes.map((c) => c.id as string);
  const faits = new Map<string, number>();
  // Découpage du filtre ET pagination de la réponse : ce sont deux bornes
  // différentes et il faut les deux ici. `in(compte_id, …)` borne l'URL (la
  // panne 400 du 20/08) ; la relation est many-to-one — plusieurs posts par
  // compte et par jour —, donc un lot de 100 comptes peut rendre bien plus de
  // 100 lignes et c'est la RÉPONSE qui peut être rognée à `max-rows`.
  //
  // Aujourd'hui : 100 comptes × (quota ≤ 3 + rappels J+7) ≈ 400 lignes, sous le
  // plafond de 1000. On pagine quand même parce que `lireTout` sort sur page
  // courte : une page de 400 lignes pour 999 demandées, c'est UN aller-retour,
  // exactement comme avant. Ce qu'on retire, c'est l'échéance — le jour où le
  // plafond serait franchi, le garde-fou lèverait ICI, c'est-à-dire AVANT la
  // boucle par compte et hors de son try/catch : le drain entier s'arrêterait
  // et la flotte passerait la nuit sans post. Une lecture placée sur ce
  // chemin-là n'a pas le droit d'avoir une échéance.
  //
  // L'ancre est `posts.id` (uuid unique) : `compte_id` en aurait plusieurs par
  // valeur. L'ordre de lecture est sans effet, on ne fait que compter.
  for (const lot of decouperEnLots(ids, LOT_IDS)) {
    const posts = await lireTout<{ id: string; compte_id: string }>(
      `Posts du jour (${lot.length} compte(s))`,
      (curseur, taille) => {
        let q = supabase
          .from("posts")
          .select("id, compte_id")
          .in("compte_id", lot)
          .eq("date_publication_prevue", jour)
          .eq("est_test", false);
        if (curseur) q = q.gt("id", curseur.id);
        return q.order("id", { ascending: true }).limit(taille);
      },
      { ancre: (p) => p.id },
    );
    for (const p of posts) {
      const cid = p.compte_id as string;
      faits.set(cid, (faits.get(cid) ?? 0) + 1);
    }
  }

  return comptes.filter((c) => {
    const brut = Number(c.posts_par_jour ?? 1);
    const q = !Number.isFinite(brut) ? 1 : Math.min(3, Math.max(1, Math.round(brut)));
    return (faits.get(c.id as string) ?? 0) < q;
  });
}

/**
 * Drain : un lot de comptes sous-quota, puis auto-chaîne tant qu'il en reste.
 * Évite le timeout cron (280s) qui laissait 50+ comptes sans post.
 */
export async function assignerDrainLot(
  supabase: Supabase,
  jour: string,
  opts: AssignationOpts = {},
  exclus: string[] = [],
): Promise<{
  resultats: AssignationCompteResultat[];
  restants: number;
  traites: number;
  echecs: string[];
}> {
  const sousQuota = await listerComptesSousQuota(supabase, jour, {
    ignorerWarmup: Boolean(opts.ignorerWarmup),
  });
  // BLOCAGE EN TÊTE DE FILE — le lot est toujours pris en tête d'une liste sans
  // `order()`, donc dans l'ordre de tas de `comptes`. Un compte dont
  // `assignerCompteJour` lève n'écrit rien : il reste sous quota, sa ligne ne
  // bouge pas dans le tas, et il revient dans les 8 premiers à la génération
  // suivante. Huit comptes en échec suffisaient donc à retenir les 123 autres
  // pendant les 40 générations de la chaîne. Tant que l'échec restait rare
  // (l'ancienne sortie gracieuse baissait le quota, donc écrivait, donc faisait
  // avancer la file) ça ne se voyait pas ; le garde-fou de complétude, qui lève
  // sur une lecture douteuse, en fait un mode de panne ordinaire.
  //
  // La chaîne transporte donc les comptes déjà tentés en échec, et ils sortent
  // du calcul des restants : la file avance, et le drain s'arrête quand il ne
  // reste que des comptes qu'on a déjà tentés — leurs erreurs sont dans le
  // journal du run, pas noyées dans 40 générations identiques.
  const ecartes = new Set(exclus);
  const eligibles = ecartes.size > 0
    ? sousQuota.filter((c) => !ecartes.has(c.id as string))
    : sousQuota;
  const lot = eligibles.slice(0, DRAIN_BATCH);
  if (lot.length === 0) {
    return { resultats: [], restants: 0, traites: 0, echecs: [] };
  }
  const reglages = await chargerAssignationReglages(supabase);
  // Budget de cuisson des decks des autres applications pour CE lot (voir
  // BUDGET_DECKS_APPLICATION_MS) : la chaîne de la nuit ne doit jamais mourir
  // sur un modèle lent.
  opts = { ...opts, echeance: opts.echeance ?? Date.now() + BUDGET_DECKS_APPLICATION_MS };
  // Un mémo pour TOUT le lot : les comptes d'une même application partagent
  // largement leurs labels, donc le mapping label → contenus n'est lu qu'une
  // fois pour les 8 comptes du lot au lieu d'une fois par tentative de pioche.
  const memo = creerMemoAssignation();
  const resultats = await mapPool(lot, LARGEUR_ASSIGNATION, async (compte) => {
    const nom =
      (compte.persona_nom as string | null) ??
      (compte.handle_tiktok as string | null) ??
      String(compte.id).slice(0, 8);
    try {
      const detail = await assignerCompteJour(supabase, compte, jour, reglages, opts, memo);
      return {
        compteId: compte.id as string,
        crees: detail.ids.length,
        passageIds: detail.ids,
        raison: detail.raison,
        quotaBaisse: detail.quotaBaisse
          ? { ...detail.quotaBaisse, nom }
          : undefined,
        replis: detail.replis,
        nonServable: detail.nonServable,
      };
    } catch (e) {
      return {
        compteId: compte.id as string,
        crees: 0,
        erreur: e instanceof Error ? e.message : String(e),
      };
    }
  });
  return {
    resultats,
    restants: Math.max(0, eligibles.length - lot.length),
    traites: lot.length,
    // Un compte non servable (multi-app) sort de la chaîne comme un compte en
    // échec : il ne lève pas, ne baisse pas son quota, donc ne quitterait
    // jamais la tête de file. Les autres comptes à 0 créé gardent leur
    // comportement d'avant.
    echecs: resultats
      .filter((r) => r.erreur !== undefined || r.nonServable)
      .map((r) => r.compteId),
  };
}

/** Kick fire-and-forget du drain assignation (auto-chaîne côté Edge). */
export function kickAssignationDrain(
  request: Request,
  body: Record<string, unknown>,
): void {
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return;
  const secret = Deno.env.get("CRON_SECRET");
  const auth = request.headers.get("Authorization");
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (secret) headers["x-cron-secret"] = secret;
  else if (auth) headers.Authorization = auth;

  const target = `${url}/functions/v1/assignation`;
  const edge = (globalThis as {
    EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void };
  }).EdgeRuntime;

  const p = fetch(target, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...body, drain: true }),
  }).catch(() => null);
  if (edge?.waitUntil) edge.waitUntil(p);
}

export async function assignerTousComptes(
  supabase: Supabase,
  jour: string,
  compteId: string | null = null,
  opts: AssignationOpts | boolean = {},
): Promise<AssignationCompteResultat[]> {
  const o: AssignationOpts = typeof opts === "boolean" ? { forcer: opts } : (opts ?? {});
  const reglages = await chargerAssignationReglages(supabase);
  // Non bornée, pour les mêmes raisons que dans `listerComptesSousQuota` (131
  // comptes actifs, plafond à 1000, et paginer imposerait un ordre) — voir le
  // commentaire là-bas, y compris le repère des ~500 comptes.
  let query = supabase.from("comptes").select("*").eq("is_active", true);
  if (compteId) query = query.eq("id", compteId);
  const { data: comptesBruts, error } = await query;
  if (error) throw error;

  // Warmup : uniquement les comptes dont warmup_ends_at est passé (en process).
  // Mode test : on peut cibler un compte hors process (ignorerWarmup).
  // UGC AI VIDEO : hors pipeline slideshow (même en test ciblé on laisse
  // assignerCompteJour renvoyer la raison — sauf filtre batch minuit).
  const maintenant = Date.now();
  const comptes = (comptesBruts ?? []).filter((c) => {
    if (c.type_compte === "cm" && !compteId) return false;
    if (Boolean(c.ugc_ai_video) && !compteId) return false;
    if (o.ignorerWarmup) return true;
    const ends = c.warmup_ends_at as string | null | undefined;
    if (!ends) return false; // pas démarré → hors process
    return new Date(ends).getTime() <= maintenant;
  });

  // Même mémo pour toute la flotte de ce run : voir `assignerDrainLot`.
  const memo = creerMemoAssignation();
  return await mapPool(comptes, LARGEUR_ASSIGNATION, async (compte) => {
    const nom =
      (compte.persona_nom as string | null) ??
      (compte.handle_tiktok as string | null) ??
      String(compte.id).slice(0, 8);
    try {
      const detail = await assignerCompteJour(supabase, compte, jour, reglages, o, memo);
      return {
        compteId: compte.id as string,
        crees: detail.ids.length,
        passageIds: detail.ids,
        raison: detail.raison,
        quotaBaisse: detail.quotaBaisse
          ? { ...detail.quotaBaisse, nom }
          : undefined,
        replis: detail.replis,
        nonServable: detail.nonServable,
      };
    } catch (e) {
      return {
        compteId: compte.id as string,
        crees: 0,
        erreur: e instanceof Error ? e.message : String(e),
      };
    }
  });
}

export { DRAIN_MAX_CHAIN };

/**
 * Annule une assignation test : supprime posts `est_test` + passages liés
 * (+ médias UGC face-swap créés pour ces posts). Comme si rien n'avait existé.
 */
export async function annulerAssignationTest(
  supabase: Supabase,
  compteId: string,
  jour: string,
): Promise<{ posts: number; passages: number; medias: number }> {
  // Un compte, un jour, et seulement les posts `est_test` : quelques unités.
  // Mais RIEN ne les purge à part cette fonction — un admin qui enchaîne les
  // essais sans annuler les accumule. La lecture reste donc non bornée ici (le
  // garde-fou lèverait à 1000 posts de test sur un même jour, ce qui serait une
  // information en soi) ; ce sont les lectures DÉRIVÉES ci-dessous qui doivent
  // être découpées, parce qu'elles partent de cette liste.
  const { data: posts } = await supabase
    .from("posts")
    .select("id")
    .eq("compte_id", compteId)
    .eq("date_publication_prevue", jour)
    .eq("est_test", true);
  const postIds = (posts ?? []).map((p) => p.id as string);
  if (postIds.length === 0) {
    return { posts: 0, passages: 0, medias: 0 };
  }

  // `in(post_id, …)` sur une liste non bornée : au-delà de ~400 valeurs l'URL
  // PostgREST déborde et `verifierTailleIn` lève. Un passage par post au plus,
  // donc la réponse, elle, ne peut pas dépasser la taille du lot.
  const passages = await lireParLots<{ id: string }>(
    postIds,
    "Annulation test — passages liés",
    (lot) => supabase.from("passages").select("id").in("post_id", lot),
  );
  const passageIds = passages.map((p) => p.id);

  // Many-to-one : une dizaine de slides par post, donc 100 posts par lot
  // peuvent rendre un millier de lignes et se faire rogner à `max-rows`. Une
  // troncature ici laisserait des médias UGC orphelins en base après une
  // annulation qui se déclare complète — on pagine sur `post_slides.id`
  // (`post_id` n'est pas unique). Page courte = un seul aller-retour dans le
  // cas normal.
  const slides: Array<{ id: string; media_id: string | null }> = [];
  for (const lot of decouperEnLots(postIds, LOT_IDS)) {
    const page = await lireTout<{ id: string; media_id: string | null }>(
      `Annulation test — slides (${lot.length} post(s))`,
      (curseur, taille) => {
        let q = supabase
          .from("post_slides")
          .select("id, media_id")
          .in("post_id", lot)
          .not("media_id", "is", null);
        if (curseur) q = q.gt("id", curseur.id);
        return q.order("id", { ascending: true }).limit(taille);
      },
      { ancre: (s) => s.id },
    );
    slides.push(...page);
  }
  const mediaIds = [...new Set(slides.map((s) => s.media_id as string).filter(Boolean))];

  let mediasUgc: string[] = [];
  const cheminsUgc: string[] = [];
  if (mediaIds.length > 0) {
    // Un média par id : le découpage du filtre borne aussi la réponse.
    const medias = await lireParLots<{ id: string; storage_path: string | null }>(
      mediaIds,
      "Annulation test — médias UGC",
      (lot) =>
        supabase
          .from("media_library")
          .select("id, ugc_face_regen, storage_path")
          .in("id", lot)
          .eq("ugc_face_regen", true),
    );
    mediasUgc = medias.map((m) => m.id);
    for (const m of medias) {
      if (m.storage_path) cheminsUgc.push(m.storage_path);
    }
    if (cheminsUgc.length > 0) {
      await supabase.storage.from("medias").remove(cheminsUgc).catch(() => null);
    }
  }

  // Les suppressions passent par le même découpage : un `in(...)` trop long y
  // échouerait exactement comme en lecture, mais en laissant la base à moitié
  // nettoyée.
  for (const lot of decouperEnLots(passageIds, LOT_IDS)) {
    await supabase.from("passages").delete().in("id", lot);
  }
  for (const lot of decouperEnLots(postIds, LOT_IDS)) {
    await supabase.from("posts").delete().in("id", lot);
  }
  for (const lot of decouperEnLots(mediasUgc, LOT_IDS)) {
    await supabase.from("media_library").delete().in("id", lot);
  }

  return {
    posts: postIds.length,
    passages: passageIds.length,
    medias: mediasUgc.length,
  };
}

// ---------------------------------------------------------------------------
// Rappel J+7 — un passage qui perce repart sur le même compte
// ---------------------------------------------------------------------------

/**
 * Programme les rappels J+7 des passages au-delà du seuil de vues (50k).
 *
 * Le rappel rejoue l'EXACT même post sur le MÊME compte, hors de toute
 * assignation classique : il ne consomme pas de passage du budget tierlist et ne
 * compte pas dans le `m` de la requalification. Il occupe en revanche un créneau
 * du quota du jour — posé avant l'assignation, il lui prend sa place.
 */
export async function programmerRappelsJ7(
  supabase: Supabase,
  opts: { dryRun?: boolean } = {},
): Promise<RappelsResultat> {
  // Un rappel rejoue le même post, donc la même application. Sans 0256 : ni
  // lecture ni écriture de la colonne, le rappel est celui d'avant (Sophia par
  // défaut). Sonde illisible : même repli (un rappel n'est pas une raison de
  // perdre l'étape ; au pire un rappel Unswipe serait compté Sophia).
  const multiApp = await schemaMultiAppPretSinonSophia(supabase);
  return await programmerRappels(
    supabase,
    async ({ passageSource, jour }) => {
      const applicationId = multiApp ? passageSource.application_id : null;
      const slides = (passageSource.slides ?? []) as SlideLangue[];
      if (!Array.isArray(slides) || slides.length === 0) {
        throw new Error("Deck du passage source vide — rappel impossible");
      }
      // Le passage source peut dater d'avant la mention : on la repose ici.
      const hashtags = avecMentionPublicite(passageSource.hashtags ?? "", passageSource.langue);

      const { data: passage, error } = await supabase
        .from("passages")
        .insert({
          contenu_id: passageSource.contenu_id,
          compte_id: passageSource.compte_id,
          langue: passageSource.langue,
          date_publication_prevue: jour,
          statut: "assigne",
          slides,
          musique_url: passageSource.musique_url,
          musique_titre: passageSource.musique_titre,
          musique_plateforme: passageSource.musique_plateforme,
          hashtags,
          est_rappel: true,
          rappel_rang: passageSource.rappel_rang + 1,
          rappel_source_id: passageSource.id,
          tier_cycle: passageSource.tier_cycle,
          ...(applicationId ? { application_id: applicationId } : {}),
        })
        .select("id")
        .single();
      if (error || !passage) throw error ?? new Error("Création passage rappel échouée");

      try {
        await materialiserPostDepuisPassage(supabase, {
          passageId: passage.id,
          compteId: passageSource.compte_id,
          contenuId: passageSource.contenu_id,
          jour,
          slides,
          musique_url: passageSource.musique_url,
          musique_titre: passageSource.musique_titre,
          musique_plateforme: passageSource.musique_plateforme,
          hashtags,
          applicationId,
        });
      } catch (e) {
        await supabase.from("passages").delete().eq("id", passage.id);
        throw e;
      }
    },
    { ...opts, multiApp },
  );
}
