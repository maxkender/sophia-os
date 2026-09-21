import {
  resoudreVisuelsAssignation,
  type SlideStructureManuel,
} from "./creation_manuelle.ts";
import { assurerDeckPourLangue } from "./import_contenu.ts";
import { hashtagsPour } from "./hashtags_langue.ts";
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
 * ---------------------------------------------------------------------- */

/** Mémo porté explicitement pendant un run d'assignation. Voir le bloc ci-dessus. */
export interface MemoAssignation {
  /** clé labels → ids de contenus portant au moins un de ces labels. */
  labels: Map<string, Promise<string[]>>;
  /** clé labels+application+ugc → contenus prêts à être assignés. */
  pool: Map<string, Promise<ContenuCandidat[]>>;
  /** compte_id → application_id du compte. */
  application: Map<string, Promise<string | null>>;
}

export function creerMemoAssignation(): MemoAssignation {
  return { labels: new Map(), pool: new Map(), application: new Map() };
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

export interface AssignationCompteDetail {
  ids: string[];
  /** Motif si rien (ou pas assez) n'a pu être créé — pour l'UI admin. */
  raison?: string;
  /** Quota posts_par_jour baissé pour coller au pool disponible. */
  quotaBaisse?: QuotaBaisse;
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
  const { data: labelsCompte } = await supabase
    .from("compte_labels")
    .select("label_id, labels(nom)")
    .eq("compte_id", compte.id);
  const labelIds = (labelsCompte ?? []).map((l) => l.label_id as string);
  // deno-lint-ignore no-explicit-any
  const labelNoms = (labelsCompte ?? [])
    .map((l: any) => l.labels?.nom as string | undefined)
    .filter(Boolean) as string[];
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

  const crees: string[] = [];
  /** Contenu IDs déjà pris / exclus cette session (choisirContenu filtre dessus). */
  const contenusSession: string[] = [...(o.exclureContenus ?? [])];
  const maxTentatives = manquants + 8;

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
    const choisi = await choisirContenu(
      supabase,
      compte.id,
      langue,
      labelIds,
      jour,
      reglages,
      contenusSession,
      ugcAi,
      { ignorerTierlist, exclureTestsHisto: true },
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
    let slides: SlideLangue[];
    let hashtagsDeck = "";
    try {
      const deck = await assurerDeckPourLangue(supabase, choisi.contenuId, langue);
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
    log(`Passage ${crees.length}/${manquants} prêt`);
  }

  if (crees.length < manquants) {
    const diag = await diagnostiquerPoolVide(
      supabase,
      labelIds,
      labelNoms,
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
      return {
        ids: crees,
        quotaBaisse,
        raison: quotaBaisse
          ? `Lowered quota ${quotaBaisse.avant}→${quotaBaisse.apres} — pool trop mince / déjà assigné.`
          : undefined,
      };
    }
    if (crees.length === 0) {
      return { ids: [], raison: diag, quotaBaisse };
    }
    return {
      ids: crees,
      raison: `${crees.length}/${manquants} créé(s). ${diag}`,
      quotaBaisse,
    };
  }
  log(`Terminé : ${crees.length} passage(s)`);
  return { ids: crees };
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
 * Application du compte. Une colonne d'une ligne, relue à chaque tentative de
 * pioche alors qu'elle ne change pas pendant un run — d'où le mémo.
 */
async function applicationDuCompte(
  supabase: Supabase,
  compteId: string,
  memo?: MemoAssignation,
): Promise<string | null> {
  const lire = async () => {
    const { data } = await supabase
      .from("comptes")
      .select("application_id")
      .eq("id", compteId)
      .maybeSingle();
    return (data?.application_id as string | undefined) ?? null;
  };
  if (!memo) return await lire();
  return await memoiser(memo.application, compteId, lire);
}

/**
 * Pool des slideshows assignables : labels du compte ∩ prêts ∩ application ∩ UGC.
 *
 * Mémoïsé par (labels, application, ugc) — les TROIS, et pas seulement les
 * labels. `ugc_compatible` et `application_id` sont des filtres de cette
 * lecture : une clé qui les oublierait servirait le pool d'un créateur UGC à un
 * créateur classique, ce qui n'est plus une optimisation mais un changement
 * d'ensemble de candidats. La clé porte donc exactement ce que la requête filtre.
 *
 * Les messages d'erreur (« Slideshows du label », « Slideshows prêts ») sont
 * conservés au mot près : ils remontent tels quels dans les rapports de run.
 */
export async function poolContenusPrets(
  supabase: Supabase,
  labelIds: string[],
  args: { applicationId: string | null; ugcAi: boolean },
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
      (lot) => {
        let q = supabase
          .from("contenus")
          .select("id, musique_url, musique_titre, musique_plateforme, ugc_compatible")
          .eq("statut", "valide")
          .eq("import_statut", "done")
          .eq("ugc_compatible", args.ugcAi)
          .in("id", lot);
        if (args.applicationId) q = q.eq("application_id", args.applicationId);
        return q;
      },
    );
  };
  if (!memo) return await lire();
  const cle = `${cleLabels(labelIds)}::${args.applicationId ?? "-"}::${args.ugcAi ? "ugc" : "std"}`;
  // Copie du tableau, même raison que pour les ids de labels : l'appelant en
  // dérive `contenuIds` / `meta` et ne doit pas pouvoir abîmer l'entrée du mémo.
  return [...(await memoiser(memo.pool, cle, lire))];
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
): Promise<PassageHisto[]> {
  const hist: PassageHisto[] = [];
  for (const lot of decouperEnLots(contenuIds, LOT_IDS)) {
    const lignes = await lireTout<PassageHisto>(
      `Historique des passages (${lot.length} contenu(s))`,
      (curseur, taille) => {
        let q = supabase
          .from("passages")
          .select("id, contenu_id, date_publication_prevue, posts(est_test)")
          .eq("compte_id", compteId)
          .in("contenu_id", lot);
        if (curseur) q = q.gt("id", curseur.id);
        return q.order("id", { ascending: true }).limit(taille);
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
  opts: { ignorerTierlist?: boolean; exclureTestsHisto?: boolean } = {},
  memo?: MemoAssignation,
): Promise<Candidat | null> {
  const ignorerTierlist = Boolean(opts.ignorerTierlist);
  const applicationId = await applicationDuCompte(supabase, compteId, memo);
  // Labels du compte → contenus prêts. Invariant pendant le run : mémoïsé (voir
  // le bloc « Mémo de RUN »), au lieu d'être relu à chaque tentative de pioche.
  const contenus = await poolContenusPrets(supabase, labelIds, { applicationId, ugcAi }, memo);
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
  const hist = await lireHistoriquePassages(supabase, compteId, contenuIds);
  const derniere = new Map<string, string>();
  for (const h of hist) {
    if (opts.exclureTestsHisto && estPassageDeTest(h.posts)) continue;
    const d = h.date_publication_prevue ?? "";
    const prev = derniere.get(h.contenu_id);
    if (!prev || d > prev) derniere.set(h.contenu_id, d);
  }

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
  for (const cid of contenuIds) {
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
    contenuIds,
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
    echecs: resultats.filter((r) => r.erreur !== undefined).map((r) => r.compteId),
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
  return await programmerRappels(
    supabase,
    async ({ passageSource, jour }) => {
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
        });
      } catch (e) {
        await supabase.from("passages").delete().eq("id", passage.id);
        throw e;
      }
    },
    opts,
  );
}
