/**
 * Deck placé d'une application AUTRE que Sophia, par contenu × langue.
 *
 * Le deck Sophia ne passe jamais par ici : il reste dans
 * `contenu_langues.slides` (assurerDeckPourLangue, inchangé). Ce module écrit
 * dans `contenu_langue_decks`, à partir d'une base SANS placement :
 *
 *  - langue source : `slides_base` de la ligne source (OCR mis à l'abri avant
 *    la pub Sophia), ou ses `slides` tant qu'elles sont propres ;
 *  - autre langue : `slides_base` de la ligne cible, écrite ici par une
 *    traduction propre (même choix de prompt et de voix que Sophia).
 *
 * Il n'écrit JAMAIS `contenu_langues.slides` : c'est le deck Sophia publié.
 * Sur `contenu_langues`, il ne touche qu'à `slides_base` (base de la langue),
 * `hashtags` (s'ils manquent, générés sans pub) et à la création de la ligne,
 * exactement comme le chemin Sophia.
 *
 * Refus métier → résultat (`ineligible` / `echec`, mis en cache) ; seule une
 * lecture base en panne lève.
 */
import {
  citeConcurrent,
  motifConcurrentApplication,
  positionConcurrent,
  sansConcurrent,
} from "./concurrents.ts";
import {
  assurerSlidesBase,
  completerHashtags,
  LANGUES_CIBLES,
  type LigneLangue,
  type SlideLangue,
  type Supabase,
  traduireBaseDeck,
} from "./import_contenu.ts";
import { type ApplicationMoteur, ID_SOPHIA, SLUG_SOPHIA } from "./multi_app.ts";
import { schemaMultiAppPret } from "./applications_moteur.ts";
import { clePromptPlacement } from "./applications.ts";
import { baseDeTraduction, estDeckPret } from "./deck_langue.ts";
import { integrerApplication, MOT_SOPHIA } from "./placement_application.ts";
import { chargerPrompt, messageErreur } from "./supabase.ts";

/**
 * `cuit` : vrai quand ce résultat vient d'une cuisson (traduction / placement
 * tentés), faux quand il sort du cache. L'assignation ne compte comme « panne
 * systémique » que les échecs réellement cuits.
 */
export type DeckApplicationResultat =
  | { statut: "pret"; slides: SlideLangue[]; hashtags: string | null; cuit?: boolean }
  | { statut: "ineligible" | "echec"; raison: string; cuit?: boolean };

/** Raison d'un échec par manque de temps : jamais mise en cache (rien à voir avec le contenu). */
export const RAISON_BUDGET = "budget";

export interface OptionsDeckApplication {
  /**
   * Échéance (epoch ms) : passé ce moment, la cuisson s'arrête avant l'étape
   * coûteuse suivante (traduction, placement) et rend `echec` « budget », sans
   * le mettre en cache.
   */
  echeance?: number;
  /**
   * Test à blanc seulement (mode « contenus ») : ne pas servir le cache
   * `contenu_langue_decks`, recuire avec le prompt de placement ACTUEL. Absent
   * ou `false` (la nuit, l'assignation test) : comportement inchangé.
   */
  ignorerCache?: boolean;
}

/**
 * Un `echec` en cache n'est retenté qu'après ce délai. Un prompt manquant ou
 * un modèle muet ne se répare pas d'une minute à l'autre ; sans délai, chaque
 * nuit d'assignation repayait traduction + 4 essais de placement sur les mêmes
 * contenus. Un `ineligible` (base polluée) ne se retente jamais.
 */
export const DELAI_REESSAI_ECHEC_MS = 24 * 60 * 60 * 1000;

const COLONNES_LIGNE = "id, langue, slides, slides_base, hashtags";

type LigneCible = LigneLangue & { langue: string; hashtags?: string | null };

type Placement = {
  mode: string;
  variants: string[];
  bestIndex: number;
  chosenPosition: number;
  /** Slide qui citait un concurrent de l'application, imposée au placement. */
  positionImposee?: number;
  prompt_cle: string;
};

type Cuisson =
  | { statut: "pret"; slides: SlideLangue[]; placement: Placement; baseCible: SlideLangue[] }
  | { statut: "ineligible" | "echec"; raison: string; placement?: Partial<Placement> };

const horsDelai = (opts: OptionsDeckApplication) =>
  opts.echeance !== undefined && Date.now() > opts.echeance;

/**
 * Pourquoi une base ne peut PAS porter une autre application, ou `null`.
 *
 * Une slide marquée `position_sophia` = la pub Sophia a écrasé le texte
 * d'origine (517 lignes sources polluées avant `slides_base`) : on ne peut
 * pas la retirer, et poser Unswipe à côté ferait un post à deux pubs. Un texte
 * qui cite Sophia hors marquage (source qui parlait déjà de l'appli, deck
 * remanié à la main) a le même effet.
 */
export function motifBasePolluee(base: readonly SlideLangue[]): string | null {
  if (base.some((s) => s.position_sophia)) return "base polluée par une pub Sophia";
  if (base.some((s) => MOT_SOPHIA.test(s.texte_overlay ?? ""))) return "base qui cite Sophia";
  return null;
}

const aDuTexte = (deck: readonly SlideLangue[]) =>
  deck.length > 0 && deck.some((s) => (s.texte_overlay ?? "").trim());

/**
 * Pourquoi une base ne peut pas porter le placement d'une application dont les
 * concurrents répondent à `motif`, ou `null`.
 *
 * La slide qui cite un concurrent (`positionImposee`) est REMPLACÉE par la pub.
 * Toute AUTRE mention devrait être nettoyée, et le nettoyage ne tient pas sur
 * le texte d'OCR : `retirerConcurrent` découpe sur les retours à la ligne, donc
 * une phrase coupée sur deux lignes n'est retirée qu'à moitié (« (i use »
 * reste), et une carte App Store incrustée (« unscroll: the curated internet /
 * content worth your time / Open ») laisse « content worth your time / Open ».
 * Mesuré sur le stock (2026-10-08) : un seul contenu a deux slides
 * concurrentes, aucune couverture n'en cite. Plutôt qu'un deck illisible, le
 * contenu est refusé pour CETTE application — Sophia continue de le servir :
 *
 *  - la couverture cite un concurrent (jamais imposée : elle porte l'accroche,
 *    nettoyée elle partait vide) ;
 *  - une autre slide que la slide imposée cite un concurrent ;
 *  - la slide imposée est la seule à porter du texte (le deck ne serait que la
 *    pub).
 */
export function motifConcurrenceRefusee(
  base: readonly SlideLangue[],
  positionImposee: number | undefined,
  motif: RegExp,
): string | null {
  const premiere = Math.min(...base.map((s) => s.position));
  const autres = base.filter((s) => s.position !== positionImposee);
  const citantes = autres.filter((s) => citeConcurrent(s.texte_overlay, motif));
  if (citantes.some((s) => s.position <= 1 || s.position === premiere)) {
    return "couverture qui cite un concurrent de l'application";
  }
  if (citantes.length > 0) return "plusieurs slides citent un concurrent de l'application";
  if (positionImposee !== undefined && !aDuTexte(autres)) {
    return "aucun texte hors de la slide concurrente";
  }
  return null;
}

/**
 * Deck final : la base, avec la slide choisie remplacée par `variante` et
 * marquée `position_sophia` (le drapeau générique « slide pub », même forme
 * que `SlideLangue`). `null` si un garde-fou tombe.
 */
export function construireDeckPlace(
  base: readonly SlideLangue[],
  position: number,
  variante: string,
): SlideLangue[] | null {
  const deck = base.map((s) => ({
    position: s.position,
    texte_overlay: s.position === position ? variante : s.texte_overlay,
    position_sophia: s.position === position,
  }));
  const pubs = deck.filter((s) => s.position_sophia);
  if (pubs.length !== 1) return null;
  const premiere = Math.min(...deck.map((s) => s.position));
  // Jamais la couverture : le placement doit tomber en fin de deck.
  if (pubs[0].position === premiere || pubs[0].position <= 1) return null;
  if (deck.some((s) => MOT_SOPHIA.test(s.texte_overlay ?? ""))) return null;
  return deck;
}

/**
 * Ligne `contenu_langues` de (contenu, langue), créée si besoin comme le fait
 * le chemin Sophia. `null` = langue hors langues cibles.
 */
async function assurerLigneLangue(
  supabase: Supabase,
  contenuId: string,
  langue: string,
): Promise<LigneCible | null> {
  const lire = async (): Promise<LigneCible | null> => {
    const { data, error } = await supabase
      .from("contenu_langues")
      .select(COLONNES_LIGNE)
      .eq("contenu_id", contenuId)
      .eq("langue", langue)
      .maybeSingle();
    if (error) throw new Error(`contenu_langues ${langue} : ${messageErreur(error)}`);
    return (data ?? null) as LigneCible | null;
  };

  const existante = await lire();
  if (existante) return existante;
  if (!(LANGUES_CIBLES as readonly string[]).includes(langue)) return null;

  const { data: creee, error } = await supabase
    .from("contenu_langues")
    .insert({
      contenu_id: contenuId,
      langue,
      slides: [] as SlideLangue[],
      nb_passages: 0,
    })
    .select(COLONNES_LIGNE)
    .single();
  if (creee) return creee as LigneCible;
  // Course avec l'assignation Sophia (ou un autre run) : la ligne vient d'être
  // créée par quelqu'un d'autre. On relit au lieu d'échouer.
  if ((error as { code?: string } | null)?.code === "23505") {
    const relue = await lire();
    if (relue) return relue;
  }
  throw new Error(`Création ligne langue ${langue} échouée : ${messageErreur(error)}`);
}

async function enregistrer(
  supabase: Supabase,
  ligne: LigneCible,
  contenuId: string,
  langue: string,
  app: ApplicationMoteur,
  cuisson: Cuisson,
): Promise<void> {
  const { error } = await supabase.from("contenu_langue_decks").upsert(
    {
      contenu_langue_id: ligne.id,
      contenu_id: contenuId,
      langue,
      application_id: app.id,
      variante: app.slug,
      statut: cuisson.statut,
      raison: cuisson.statut === "pret" ? null : cuisson.raison,
      slides: cuisson.statut === "pret" ? cuisson.slides : [],
      placement: cuisson.placement ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "contenu_langue_id,variante" },
  );
  // Le cache est une économie, pas une condition : un deck prêt reste servi.
  if (error) {
    console.warn(
      `[deck ${app.slug}] cache ${contenuId}/${langue} non écrit : ${messageErreur(error)}`,
    );
  }
}

/** Légende : celle de la ligne, sinon générée depuis une base SANS pub. */
async function hashtagsDe(
  supabase: Supabase,
  ligne: LigneCible,
  baseSansPub: SlideLangue[],
  titre: string | null,
  langue: string,
): Promise<string | null> {
  const existants = (ligne.hashtags ?? "").trim();
  if (existants) return existants;
  // Les hashtags de la ligne sont partagés avec le deck Sophia : jamais
  // générés depuis un deck qui porte la pub d'une autre application.
  const tags = await completerHashtags(supabase, ligne.id, baseSansPub, titre, langue);
  return tags || null;
}

async function cuire(
  supabase: Supabase,
  contenu: {
    id: string;
    titre: string | null;
    langue_source: string | null;
    compte_reference_id: string | null;
  },
  ligne: LigneCible,
  langue: string,
  app: ApplicationMoteur,
  opts: OptionsDeckApplication = {},
): Promise<Cuisson> {
  const langueSource = contenu.langue_source ?? "fr";

  // 1. Base source sans placement — sauvegardée au passage comme le fait Sophia.
  const { data: clSource, error: errSource } = await supabase
    .from("contenu_langues")
    .select("id, slides, slides_base")
    .eq("contenu_id", contenu.id)
    .eq("langue", langueSource)
    .maybeSingle();
  if (errSource) throw new Error(`contenu_langues ${langueSource} : ${messageErreur(errSource)}`);
  const ligneSource = (clSource ?? null) as LigneLangue | null;
  if (!ligneSource) return { statut: "echec", raison: `ligne langue source ${langueSource} absente` };
  await assurerSlidesBase(supabase, ligneSource);
  const base = baseDeTraduction(ligneSource) as SlideLangue[];
  const pollution = motifBasePolluee(base);
  if (pollution) return { statut: "ineligible", raison: pollution };
  if (!aDuTexte(base)) return { statut: "echec", raison: "base source sans texte" };
  // Applis concurrentes de CETTE application (concurrents.ts) : un refus se lit
  // sur la base source, avant de payer une traduction ou un placement.
  const motif = motifConcurrentApplication(app.slug);
  const refusSource = motifConcurrenceRefusee(base, positionConcurrent(base, motif), motif);
  if (refusSource) return { statut: "ineligible", raison: refusSource };

  // 2. Prompt de placement AVANT toute traduction : sans lui, rien ne sert de
  //    payer Gemini. Jamais de repli sur le texte Sophia.
  const cle = clePromptPlacement(app.slug);
  const masterPrompt = ((await chargerPrompt(supabase, cle)) ?? "").trim();
  if (!masterPrompt) {
    return { statut: "echec", raison: `prompt ${cle} manquant`, placement: { prompt_cle: cle } };
  }

  // 3. Base dans la langue cible.
  let baseCible: SlideLangue[];
  if (langue === langueSource) {
    baseCible = base.map((s) => ({ ...s }));
  } else if ((ligne.slides_base ?? []).length > 0) {
    baseCible = [...(ligne.slides_base as SlideLangue[])];
  } else {
    if (horsDelai(opts)) return { statut: "echec", raison: RAISON_BUDGET };
    let traduction: Awaited<ReturnType<typeof traduireBaseDeck>>;
    try {
      traduction = await traduireBaseDeck(supabase, contenu, base, langue);
    } catch (error) {
      return { statut: "echec", raison: `traduction ${langue} : ${messageErreur(error)}` };
    }
    // Même règle que Sophia : une traduction vide ne se persiste pas.
    if (traduction.traduits === 0) return { statut: "echec", raison: `traduction ${langue} vide` };
    baseCible = traduction.slides;
    const pollutionTraduite = motifBasePolluee(baseCible);
    if (pollutionTraduite) return { statut: "ineligible", raison: `traduction : ${pollutionTraduite}` };

    // `slides_base` SEULEMENT : `slides` reste au deck Sophia de cette langue.
    const maj: Record<string, unknown> = { slides_base: baseCible };
    const avaitHashtags = Boolean((ligne.hashtags ?? "").trim());
    if (!avaitHashtags && traduction.hashtags) maj.hashtags = traduction.hashtags;
    const { error: errMaj } = await supabase.from("contenu_langues").update(maj).eq("id", ligne.id);
    if (errMaj) {
      console.warn(`[deck ${app.slug}] base ${langue} non sauvegardée : ${messageErreur(errMaj)}`);
    } else {
      ligne.slides_base = baseCible;
      if (maj.hashtags) ligne.hashtags = traduction.hashtags;
    }
  }
  // La slide qui cite un concurrent est la position imposée du placement, comme
  // pour Sophia. Positions identiques entre langues : la base source rattrape
  // une traduction qui aurait perdu le nom de la marque. Elle reste telle quelle
  // dans la base envoyée au modèle, qui doit voir son texte pour la remplacer
  // entièrement ; aucune autre slide ne cite de concurrent (refus sinon, voir
  // `motifConcurrenceRefusee`) : il n'y a rien à nettoyer ailleurs.
  const positionImposee = positionConcurrent(baseCible, motif) ?? positionConcurrent(base, motif);
  const refusCible = motifConcurrenceRefusee(baseCible, positionImposee, motif);
  if (refusCible) return { statut: "ineligible", raison: `base ${langue} : ${refusCible}` };
  const pollutionCible = motifBasePolluee(baseCible);
  if (pollutionCible) return { statut: "ineligible", raison: `base ${langue} : ${pollutionCible}` };
  if (!aDuTexte(baseCible)) return { statut: "echec", raison: `base ${langue} sans texte` };

  // 4. Placement.
  if (horsDelai(opts)) return { statut: "echec", raison: RAISON_BUDGET };
  const placement = await integrerApplication({
    masterPrompt,
    slides: baseCible.map((s) => ({ position: s.position, text: s.texte_overlay ?? "" })),
    caption: contenu.titre ?? "",
    langue,
    application: { slug: app.slug, nom: app.nom },
    positionImposee,
  }, { echeance: opts.echeance });
  if (!placement) {
    return {
      statut: "echec",
      raison: "placement impossible",
      placement: { positionImposee, prompt_cle: cle },
    };
  }

  // 5. Deck final : la variante préférée d'abord, les autres en secours.
  const ordre = [
    placement.bestIndex,
    ...placement.variants.map((_, i) => i).filter((i) => i !== placement.bestIndex),
  ];
  for (const index of ordre) {
    const deck = construireDeckPlace(baseCible, placement.chosenPosition, placement.variants[index]);
    if (!deck) continue;
    return {
      statut: "pret",
      // Par sécurité : aucune mention de concurrent ne part, même si la slide
      // imposée n'a pas été celle remplacée.
      slides: sansConcurrent(deck, motif).slides,
      // Base des hashtags : sans pub ET sans la slide concurrente gardée pour le modèle.
      baseCible: sansConcurrent(baseCible, motif).slides,
      placement: {
        mode: placement.mode,
        variants: placement.variants,
        bestIndex: index,
        chosenPosition: placement.chosenPosition,
        positionImposee,
        prompt_cle: cle,
      },
    };
  }
  return {
    statut: "echec",
    raison: "deck placé refusé par les garde-fous",
    placement: { ...placement, positionImposee, prompt_cle: cle },
  };
}

/**
 * Assure (cache ou cuisson) le deck de `app` pour (contenu, langue).
 * Ne lève pas pour un refus métier : renvoie `ineligible` / `echec`, que
 * l'assignation traite comme « prends un autre contenu ou replie sur Sophia ».
 * Lève seulement sur une panne d'infrastructure (lecture base impossible).
 */
export async function assurerDeckApplication(
  supabase: Supabase,
  contenuId: string,
  langue: string,
  app: ApplicationMoteur,
  opts: OptionsDeckApplication = {},
): Promise<DeckApplicationResultat> {
  if (app.id === ID_SOPHIA || app.slug === SLUG_SOPHIA) {
    // Erreur de programmation : le deck Sophia vit dans contenu_langues.slides.
    throw new Error("assurerDeckApplication appelé pour Sophia : utiliser assurerDeckPourLangue");
  }
  if (!(await schemaMultiAppPret(supabase))) {
    return { statut: "echec", raison: "schéma multi-app absent" };
  }

  const { data: contenu, error: errContenu } = await supabase
    .from("contenus")
    .select("id, titre, langue_source, compte_reference_id, structure_slides")
    .eq("id", contenuId)
    .maybeSingle();
  if (errContenu) throw new Error(`contenus : ${messageErreur(errContenu)}`);
  if (!contenu) return { statut: "echec", raison: "contenu introuvable" };

  const ligne = await assurerLigneLangue(supabase, contenuId, langue);
  if (!ligne) return { statut: "echec", raison: `langue ${langue} hors langues cibles` };

  const { data: cache, error: errCache } = await supabase
    .from("contenu_langue_decks")
    .select("statut, raison, slides, updated_at")
    .eq("contenu_langue_id", ligne.id)
    .eq("variante", app.slug)
    .maybeSingle();
  if (errCache) throw new Error(`contenu_langue_decks : ${messageErreur(errCache)}`);

  if (cache && !opts.ignorerCache) {
    const slides = (cache.slides ?? []) as SlideLangue[];
    // Un deck en cache qui cite un concurrent de l'application (motif élargi
    // depuis) est recuit plutôt que servi.
    const sansMention = !sansConcurrent(slides, motifConcurrentApplication(app.slug)).modifie;
    if (cache.statut === "pret" && estDeckPret(slides) && sansMention) {
      const hashtags = await hashtagsDe(
        supabase,
        ligne,
        slides.filter((s) => !s.position_sophia),
        contenu.titre,
        langue,
      );
      return { statut: "pret", slides, hashtags };
    }
    if (cache.statut === "ineligible") {
      return { statut: "ineligible", raison: cache.raison ?? "inéligible" };
    }
    if (cache.statut === "echec") {
      const depuis = Date.now() - Date.parse(cache.updated_at ?? "");
      if (Number.isFinite(depuis) && depuis < DELAI_REESSAI_ECHEC_MS) {
        return { statut: "echec", raison: cache.raison ?? "échec" };
      }
    }
  }

  const cuisson = await cuire(supabase, contenu, ligne, langue, app, opts);
  // Un arrêt « budget » ne dit rien du contenu : pas de cache, on recuira.
  const parBudget = cuisson.statut === "echec" && cuisson.raison === RAISON_BUDGET;
  if (!parBudget) await enregistrer(supabase, ligne, contenuId, langue, app, cuisson);
  if (cuisson.statut !== "pret") {
    return { statut: cuisson.statut, raison: cuisson.raison, cuit: !parBudget };
  }

  const hashtags = await hashtagsDe(supabase, ligne, cuisson.baseCible, contenu.titre, langue);
  return { statut: "pret", slides: cuisson.slides, hashtags, cuit: true };
}
