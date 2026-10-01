/**
 * Un poster signale une photo « propre » qui porte encore du texte. Le pourquoi
 * est dans la migration 0255 ; ici, le comment.
 *
 * Trois règles portent toute la sûreté de l'opération, et sont testées à part
 * (`signalement_texte_test.ts`) :
 *
 *  - un post PUBLIÉ n'est jamais réécrit : sa slide doit rester ce qui a été
 *    posté ;
 *  - on propage par `media_id`, jamais par position. Le poster peut réordonner
 *    ses slides (`reordonnerSlides`), et une propagation par position frapperait
 *    une autre image que celle signalée — c'est la limite de
 *    `propagerMediaAuxPostsAssignes`, qu'on n'emploie donc pas ici ;
 *  - on n'introduit jamais de doublon : un post ou un contenu qui porte déjà le
 *    remplaçant garde la photo signalée. `texte_restant` la fait alors afficher
 *    comme non nettoyée, et un nouveau signalement lui trouvera un autre
 *    remplaçant.
 *
 * Le texte n'est pas touché : ni `texte_overlay`, ni les decks traduits
 * (`contenu_langues`), ni la table `corrections` (exemples de l'IA de placement
 * Sophia). Seul le `media_id` change.
 */

import {
  chargerBiblioLabel,
  requeteVisuel,
  tirerMediaParCritere,
  type MediaCaptionCandidat,
} from "./creation_manuelle.ts";
import { decouperEnLots, lireParLots } from "./lots.ts";
import { messageErreur, serviceClient } from "./supabase.ts";

export type Supabase = ReturnType<typeof serviceClient>;

/* -------------------------------------------------------------------------
 * Règles pures
 * ---------------------------------------------------------------------- */

export interface SlidePortante {
  id: string;
  post_id: string;
}

/**
 * Slides des AUTRES posts à basculer sur le remplaçant : ni post publié, ni
 * slide déjà traitée, ni post qui porte déjà le remplaçant. Un post qui porte
 * deux fois la photo signalée n'en voit qu'une remplacée, pour la même raison.
 */
export function slidesAPropager(args: {
  slides: SlidePortante[];
  postsPublies: Set<string>;
  mediasParPost: Map<string, Set<string>>;
  remplacant: string;
  dejaTraitees: Set<string>;
}): string[] {
  const servis = new Set<string>();
  const out: string[] = [];
  for (const s of args.slides) {
    if (args.dejaTraitees.has(s.id)) continue;
    if (args.postsPublies.has(s.post_id)) continue;
    if (args.mediasParPost.get(s.post_id)?.has(args.remplacant)) continue;
    if (servis.has(s.post_id)) continue;
    servis.add(s.post_id);
    out.push(s.id);
  }
  return out;
}

export interface SlideStructure {
  position: unknown;
  media_id?: string | null;
  critere?: string | null;
}

/**
 * Position de `structure_slides` à repointer sur le remplaçant : la première
 * qui porte la photo signalée, et aucune si le contenu porte déjà le
 * remplaçant. Les positions sont parfois des chaînes en JSONB.
 */
export function positionsAPatcher(
  structure: SlideStructure[],
  signale: string,
  remplacant: string,
): number[] {
  if (structure.some((s) => s.media_id === remplacant)) return [];
  const pos = structure
    .filter((s) => s.media_id === signale)
    .map((s) => Number(s.position))
    .filter((p) => Number.isFinite(p));
  return pos.slice(0, 1);
}

/**
 * Remplaçant au plus proche de l'image signalée : on cherche d'abord dans le
 * même rôle (accroche ou slide de contenu), avec la caption de l'image
 * signalée et le texte de la slide comme requête ; sinon dans l'autre rôle.
 */
export function choisirRemplacant<T extends MediaCaptionCandidat>(
  hooks: T[],
  pool: T[],
  veutHook: boolean,
  requete: string,
  exclus: Set<string>,
  rng?: () => number,
): T | null {
  for (const source of veutHook ? [hooks, pool] : [pool, hooks]) {
    const tirage = tirerMediaParCritere(source, requete, exclus, rng);
    if (tirage.media) return tirage.media;
  }
  return null;
}

/* -------------------------------------------------------------------------
 * Orchestration
 * ---------------------------------------------------------------------- */

export type CodeRefus = "SLIDE_INTROUVABLE" | "INTERDIT" | "POST_PUBLIE" | "SANS_PHOTO";

export type ResultatSignalement =
  | {
    ok: true;
    /** La photo vient d'être exclue des pools par CE signalement. */
    signalee: boolean;
    remplacee: boolean;
    mediaId: string | null;
    url: string | null;
    slidesPropagees: number;
    contenusPropages: number;
  }
  | { ok: false; code: CodeRefus };

interface Candidat extends MediaCaptionCandidat {
  id: string;
  url: string;
}

export async function signalerTexte(
  supabase: Supabase,
  demande: { postSlideId: string; userId: string; role: string },
): Promise<ResultatSignalement> {
  const { data: slide, error: errS } = await supabase
    .from("post_slides")
    .select("id, post_id, media_id, texte_overlay")
    .eq("id", demande.postSlideId)
    .maybeSingle();
  if (errS) throw errS;
  if (!slide) return { ok: false, code: "SLIDE_INTROUVABLE" };

  const { data: post, error: errP } = await supabase
    .from("posts")
    .select("id, compte_id, publie_at")
    .eq("id", slide.post_id)
    .maybeSingle();
  if (errP) throw errP;
  if (!post) return { ok: false, code: "SLIDE_INTROUVABLE" };

  const { data: compte, error: errC } = await supabase
    .from("comptes")
    .select("poster_id, compte_reference_id")
    .eq("id", post.compte_id)
    .maybeSingle();
  if (errC) throw errC;

  if (demande.role !== "admin" && (!compte?.poster_id || compte.poster_id !== demande.userId)) {
    return { ok: false, code: "INTERDIT" };
  }
  if (post.publie_at) return { ok: false, code: "POST_PUBLIE" };
  if (!slide.media_id) return { ok: false, code: "SANS_PHOTO" };

  const signale = slide.media_id as string;
  const { data: media, error: errM } = await supabase
    .from("media_library")
    .select("id, storage_path, texte_restant, est_hook, caption")
    .eq("id", signale)
    .maybeSingle();
  if (errM) throw errM;
  if (!media) return { ok: false, code: "SANS_PHOTO" };

  // 1. Exclure la photo des pools AVANT de chercher un remplaçant : si la
  //    suite échoue, elle n'est au moins plus servie. Un brut ou une photo déjà
  //    exclue n'a rien à signaler — on lui cherche seulement un remplaçant.
  let signalee = false;
  let signalementId: string | null = null;
  const dejaExclue = Boolean(media.texte_restant) ||
    !String(media.storage_path ?? "").startsWith("propre/");
  if (!dejaExclue) {
    const { data: bascule, error: errB } = await supabase
      .from("media_library")
      .update({ texte_restant: true })
      .eq("id", signale)
      .eq("texte_restant", false)
      .select("id");
    if (errB) throw errB;
    signalee = (bascule ?? []).length > 0;
    if (signalee) {
      const { data: ligne, error: errL } = await supabase
        .from("signalements_texte")
        .insert({
          media_id: signale,
          post_id: post.id,
          post_slide_id: slide.id,
          signale_par: demande.userId === "cron" ? null : demande.userId,
        })
        .select("id")
        .single();
      if (errL) throw errL;
      signalementId = ligne.id as string;
    }
  }

  // 2. Le contenu source du post, s'il y en a un (posts v-next).
  const { data: passage, error: errPa } = await supabase
    .from("passages")
    .select("contenu_id")
    .eq("post_id", post.id)
    .limit(1)
    .maybeSingle();
  if (errPa) throw errPa;
  const contenuId = (passage?.contenu_id as string | null | undefined) ?? null;

  let structure: SlideStructure[] = [];
  let labelId: string | null = null;
  if (contenuId) {
    const { data: contenu, error: errCo } = await supabase
      .from("contenus")
      .select("structure_slides")
      .eq("id", contenuId)
      .maybeSingle();
    if (errCo) throw errCo;
    structure = (contenu?.structure_slides ?? []) as SlideStructure[];
    // Même label que la résolution d'assignation (`resoudreVisuelsAssignation`).
    const { data: liens, error: errLa } = await supabase
      .from("contenu_labels")
      .select("label_id")
      .eq("contenu_id", contenuId)
      .limit(1);
    if (errLa) throw errLa;
    labelId = (liens?.[0]?.label_id as string | undefined) ?? null;
  }

  const { data: slidesDuPost, error: errSp } = await supabase
    .from("post_slides")
    .select("media_id")
    .eq("post_id", post.id)
    .limit(100);
  if (errSp) throw errSp;
  const exclus = new Set<string>([signale]);
  for (const s of slidesDuPost ?? []) if (s.media_id) exclus.add(s.media_id as string);
  for (const s of structure) if (s.media_id) exclus.add(s.media_id);

  // 3. Le remplaçant.
  const requete = requeteVisuel(
    structure.find((s) => s.media_id === signale)?.critere ?? null,
    [media.caption, slide.texte_overlay].filter(Boolean).join(" "),
  );
  const veutHook = Boolean(media.est_hook);
  let remplacant: Candidat | null = null;
  if (labelId) {
    const hooks = await chargerBiblioLabel(supabase, labelId, { hookSeulement: true });
    const pool = await chargerBiblioLabel(supabase, labelId, { exclureHook: true });
    remplacant = choisirRemplacant(hooks, pool, veutHook, requete, exclus);
  }
  if (!remplacant && compte?.compte_reference_id) {
    // Post sans contenu (legacy) ou label à sec : même source TikTok.
    const { data: biblio, error: errBi } = await supabase
      .from("media_library")
      .select("id, url, caption, est_hook")
      .eq("compte_reference_id", compte.compte_reference_id)
      .like("storage_path", "propre/%")
      .eq("texte_restant", false)
      .order("used_count", { ascending: true })
      .limit(200);
    if (errBi) throw errBi;
    const tous = (biblio ?? []) as Array<Candidat & { est_hook: boolean }>;
    remplacant = choisirRemplacant(
      tous.filter((m) => m.est_hook),
      tous.filter((m) => !m.est_hook),
      veutHook,
      requete,
      exclus,
    );
  }

  if (!remplacant) {
    return {
      ok: true,
      signalee,
      remplacee: false,
      mediaId: null,
      url: null,
      slidesPropagees: 0,
      contenusPropages: 0,
    };
  }

  // 4. La slide du poster. Gardée sur `media_id` : si elle a changé entre-temps
  //    (admin, autre onglet), on ne l'écrase pas.
  const { error: errU } = await supabase
    .from("post_slides")
    .update({ media_id: remplacant.id })
    .eq("id", slide.id)
    .eq("media_id", signale);
  if (errU) throw errU;

  // 5. Propagation, au mieux : un échec ici laisse la photo signalée ailleurs,
  //    où elle s'affiche comme non nettoyée — jamais une photo écrite servie
  //    comme propre.
  let slidesPropagees = 0;
  let contenusPropages = 0;
  try {
    slidesPropagees = await propagerAuxPosts(supabase, signale, remplacant.id, post.id, slide.id);
  } catch (e) {
    console.warn(`[signaler-texte] propagation posts ${signale}: ${messageErreur(e)}`);
  }
  try {
    contenusPropages = await propagerAuxContenus(supabase, signale, remplacant.id);
  } catch (e) {
    console.warn(`[signaler-texte] propagation contenus ${signale}: ${messageErreur(e)}`);
  }

  if (signalementId) {
    const { error: errF } = await supabase
      .from("signalements_texte")
      .update({
        remplace_par: remplacant.id,
        slides_propagees: slidesPropagees,
        contenus_propages: contenusPropages,
      })
      .eq("id", signalementId);
    if (errF) console.warn(`[signaler-texte] suivi ${signalementId}: ${errF.message}`);
  }

  return {
    ok: true,
    signalee,
    remplacee: true,
    mediaId: remplacant.id,
    url: remplacant.url,
    slidesPropagees,
    contenusPropages,
  };
}

/** Une photo de contenu sert une dizaine de posts au plus ; la borne est large. */
const MAX_SLIDES_PORTANTES = 500;
/** 50 posts × ~12 slides restent sous le plafond `max-rows` de PostgREST. */
const LOT_POSTS = 50;

async function propagerAuxPosts(
  supabase: Supabase,
  signale: string,
  remplacant: string,
  postSignale: string,
  slideSignalee: string,
): Promise<number> {
  const { data: portantes, error } = await supabase
    .from("post_slides")
    .select("id, post_id")
    .eq("media_id", signale)
    .limit(MAX_SLIDES_PORTANTES);
  if (error) throw error;
  const slides = (portantes ?? []) as SlidePortante[];
  if (slides.length === 0) return 0;

  const postIds = [...new Set(slides.map((s) => s.post_id))];
  const posts = await lireParLots<{ id: string; publie_at: string | null }>(
    postIds,
    "Posts portant la photo signalée",
    (lot) => supabase.from("posts").select("id, publie_at").in("id", lot),
  );
  const postsPublies = new Set(posts.filter((p) => p.publie_at).map((p) => p.id));

  const mediasParPost = new Map<string, Set<string>>();
  for (const lot of decouperEnLots(postIds, LOT_POSTS)) {
    const { data, error: errL } = await supabase
      .from("post_slides")
      .select("post_id, media_id")
      .in("post_id", lot);
    if (errL) throw errL;
    for (const s of data ?? []) {
      const set = mediasParPost.get(s.post_id as string) ?? new Set<string>();
      if (s.media_id) set.add(s.media_id as string);
      mediasParPost.set(s.post_id as string, set);
    }
  }
  // Le post signalé porte déjà le remplaçant, même si la lecture a précédé
  // l'écriture.
  mediasParPost.set(postSignale, (mediasParPost.get(postSignale) ?? new Set()).add(remplacant));

  const cibles = slidesAPropager({
    slides,
    postsPublies,
    mediasParPost,
    remplacant,
    dejaTraitees: new Set([slideSignalee]),
  });
  let n = 0;
  for (const lot of decouperEnLots(cibles, LOT_POSTS)) {
    const { data, error: errU } = await supabase
      .from("post_slides")
      .update({ media_id: remplacant })
      .in("id", lot)
      .eq("media_id", signale)
      .select("id");
    if (errU) throw errU;
    n += (data ?? []).length;
  }
  return n;
}

async function propagerAuxContenus(
  supabase: Supabase,
  signale: string,
  remplacant: string,
): Promise<number> {
  const { data: contenus, error } = await supabase
    .from("contenus")
    .select("id, structure_slides")
    .filter("structure_slides", "cs", JSON.stringify([{ media_id: signale }]))
    .limit(200);
  if (error) throw error;

  let n = 0;
  for (const c of contenus ?? []) {
    const structure = (c.structure_slides ?? []) as SlideStructure[];
    for (const position of positionsAPatcher(structure, signale, remplacant)) {
      const { data: fait, error: errR } = await supabase.rpc("patch_contenu_slide_media", {
        p_contenu_id: c.id,
        p_position: position,
        p_media_id: remplacant,
        p_clear_tentatives: false,
      });
      if (errR) throw errR;
      if (fait) n += 1;
    }
  }
  return n;
}
