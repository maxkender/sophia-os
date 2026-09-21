/**
 * Persistance captions visuelles + label Hook (1ʳᵉ slide).
 */

import {
  capturerCaptionImage,
  type CaptionModele,
  type CaptionResultat,
  type CaptionStatut,
} from "./fal_caption.ts";
import { TAILLE_PAGE } from "./lots.ts";
import { messageErreur, serviceClient } from "./supabase.ts";

export type Supabase = ReturnType<typeof serviceClient>;

export const SLUG_HOOK = "hook";

export interface CaptionPersistee {
  mediaId: string;
  caption: string | null;
  statut: CaptionStatut;
  modele: CaptionModele;
  estHook: boolean;
  lignes: string[];
}

let hookLabelIdCache: string | null | undefined;

export async function idLabelHook(supabase: Supabase): Promise<string | null> {
  if (hookLabelIdCache !== undefined) return hookLabelIdCache;
  const { data, error } = await supabase
    .from("labels")
    .select("id")
    .eq("slug", SLUG_HOOK)
    .maybeSingle();
  if (error) {
    hookLabelIdCache = null;
    return null;
  }
  hookLabelIdCache = (data?.id as string | undefined) ?? null;
  return hookLabelIdCache;
}

export function mediaEstPremiereSlide(
  mediaId: string,
  slides: Array<{ position?: number | null; media_id?: string | null }> | null | undefined,
): boolean {
  if (!mediaId) return false;
  return (slides ?? []).some(
    (s) => s.media_id === mediaId && Number(s.position) === 1,
  );
}

/** `propre/{contenu}/1.jpg` ou `brut/{contenu}/1`. */
export function pathEstPremiereSlide(storagePath: string | null | undefined): boolean {
  return /(?:^|\/)(?:propre|brut)\/[^/]+\/1(?:\.|$)/.test(storagePath ?? "");
}

/** Attache le label Hook + flag `est_hook` (idempotent). */
export async function assurerHookMedia(
  supabase: Supabase,
  mediaId: string,
): Promise<boolean> {
  const labelId = await idLabelHook(supabase);
  const { error: errFlag } = await supabase
    .from("media_library")
    .update({ est_hook: true })
    .eq("id", mediaId);
  if (errFlag) throw errFlag;
  if (!labelId) return true;
  const { error } = await supabase.from("media_labels").upsert(
    { media_id: mediaId, label_id: labelId },
    { onConflict: "media_id,label_id" },
  );
  if (error) throw error;
  return true;
}

export async function estPremiereSlideDuContenu(
  supabase: Supabase,
  mediaId: string,
  contenuId?: string | null,
  storagePath?: string | null,
): Promise<boolean> {
  if (pathEstPremiereSlide(storagePath)) return true;
  if (contenuId) {
    const { data } = await supabase
      .from("contenus")
      .select("structure_slides")
      .eq("id", contenuId)
      .maybeSingle();
    return mediaEstPremiereSlide(
      mediaId,
      (data?.structure_slides ?? []) as Array<{ position?: number; media_id?: string }>,
    );
  }

  const { data: media } = await supabase
    .from("media_library")
    .select("id, contenu_id, storage_path")
    .eq("id", mediaId)
    .maybeSingle();
  if (!media) return false;
  if (pathEstPremiereSlide(media.storage_path as string | null)) return true;
  if (media.contenu_id) {
    return estPremiereSlideDuContenu(
      supabase,
      mediaId,
      media.contenu_id as string,
      media.storage_path as string | null,
    );
  }
  return false;
}

export async function persisterCaption(
  supabase: Supabase,
  mediaId: string,
  r: CaptionResultat,
): Promise<void> {
  const { error } = await supabase
    .from("media_library")
    .update({
      caption: r.caption,
      caption_statut: r.statut,
      caption_modele: r.modele,
      caption_le: new Date().toISOString(),
    })
    .eq("id", mediaId);
  if (error) throw error;
}

/**
 * Captionne un média déjà en bibliothèque (URL stockée — pas besoin de TikTok).
 * Applique aussi Hook si c'est la 1ʳᵉ slide.
 */
export async function captionnerMedia(
  supabase: Supabase,
  mediaId: string,
  opts: { forcer?: boolean; imageUrl?: string | null } = {},
): Promise<CaptionPersistee> {
  const { data: media, error } = await supabase
    .from("media_library")
    .select("id, url, caption_statut, contenu_id, est_hook, storage_path")
    .eq("id", mediaId)
    .maybeSingle();
  if (error) throw error;
  if (!media) throw new Error("média introuvable");

  const lignes: string[] = [];
  let caption = null as string | null;
  let statut: CaptionStatut = "aucune";
  let modele: CaptionModele = "none";

  const deja = media.caption_statut as CaptionStatut | null;
  if (deja && !opts.forcer) {
    lignes.push(`déjà captionné (${deja}) — skip modèle`);
    const { data: frais } = await supabase
      .from("media_library")
      .select("caption, caption_statut, caption_modele, est_hook")
      .eq("id", mediaId)
      .single();
    caption = (frais?.caption as string | null) ?? null;
    statut = (frais?.caption_statut as CaptionStatut) ?? deja;
    modele = (frais?.caption_modele as CaptionModele) ?? "none";
  } else {
    const url = (opts.imageUrl || (media.url as string) || "").trim();
    lignes.push(`url=${url.slice(0, 72)}${url.length > 72 ? "…" : ""}`);
    const r = await capturerCaptionImage(url);
    lignes.push(...r.lignes);
    await persisterCaption(supabase, mediaId, r);
    caption = r.caption;
    statut = r.statut;
    modele = r.modele;
  }

  let estHook = Boolean(media.est_hook);
  try {
    const premiere = await estPremiereSlideDuContenu(
      supabase,
      mediaId,
      media.contenu_id as string | null,
      media.storage_path as string | null,
    );
    if (premiere) {
      await assurerHookMedia(supabase, mediaId);
      estHook = true;
      lignes.push("label Hook (1ʳᵉ slide)");
    }
  } catch (e) {
    lignes.push(`warn hook: ${messageErreur(e)}`);
  }

  return { mediaId, caption, statut, modele, estHook, lignes };
}

/** Slides d'un contenu dont le media n'a pas encore de `caption_statut`. */
export async function slidesSansCaption(
  supabase: Supabase,
  slides: Array<{ position: number; media_id: string | null; raw_url?: string | null }>,
): Promise<Array<{ position: number; media_id: string; raw_url?: string | null }>> {
  const ids = slides
    .map((s) => s.media_id)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];
  // `ids` = les slides D'UN slideshow (8 à 20), filtre sur la clé primaire :
  // ni l'URL ni la réponse ne peuvent déborder. L'erreur, elle, se relit — lue
  // comme « aucune caption faite », elle relance le modèle sur des visuels déjà
  // captionnés, et le drain tourne en rond en brûlant du Fal.
  const { data, error } = await supabase
    .from("media_library")
    .select("id, caption_statut")
    .in("id", ids);
  if (error) throw new Error(`Slides déjà captionnées : ${messageErreur(error)}`);
  const faits = new Set(
    (data ?? [])
      .filter((m) => m.caption_statut != null)
      .map((m) => m.id as string),
  );
  return slides
    .filter((s): s is { position: number; media_id: string; raw_url?: string | null } =>
      Boolean(s.media_id) && !faits.has(s.media_id as string),
    );
}

/**
 * Taille d'une page du rattrapage. DÉRIVÉE du plafond PostgREST, jamais
 * recopiée : elle valait 1000, c'est-à-dire `max-rows` PILE. Le jour où le
 * plafond serveur baisserait, la condition de sortie « page plus courte que
 * demandé » serait vraie dès le premier tour et la boucle s'arrêterait en
 * silence, en se croyant complète. `TAILLE_PAGE` est strictement sous le
 * plafond, donc une page pleine est une vraie page pleine.
 */
const PAGE_RATTRAPAGE = TAILLE_PAGE;
/** Un clic = tout le stock propre sans caption. */
export const LIMITE_RATTRAPAGE_DEFAUT = 20_000;

export async function listerMediasARattraper(
  supabase: Supabase,
  opts: { limit?: number } = {},
): Promise<{ id: string; url: string; motif: "caption" | "hook" }[]> {
  const limit = Math.min(LIMITE_RATTRAPAGE_DEFAUT, Math.max(1, opts.limit ?? 400));
  const out: { id: string; url: string; motif: "caption" | "hook" }[] = [];
  const vus = new Set<string>();

  // Pagination KEYSET, et non plus `.range(offset, fin)`.
  //
  // L'ancien tri `created_at` seul n'est pas un ordre TOTAL : `created_at` n'est
  // pas unique (un import écrit des dizaines de lignes dans la même
  // milliseconde), donc PostgREST est libre de rendre les ex aequo dans un
  // ordre différent d'une page à l'autre. Combiné à un offset, qui suppose en
  // plus un tas immobile alors que ce balayage tourne pendant que le drain
  // ÉCRIT `caption_statut` sur les lignes qu'il vient de lire, des médias
  // étaient sautés — jamais captionnés, et invisibles au rattrapage suivant
  // puisqu'il refaisait le même saut. En prime, `offset` dans l'URL faisait
  // passer la requête pour bornée auprès du garde-fou de complétude.
  //
  // L'ancre est le couple (created_at, id) : on garde l'ordre métier (les plus
  // vieux médias d'abord, c'est ce que l'admin attend d'un rattrapage) et on le
  // rend total en départageant les ex aequo par la clé primaire. Le filtre de
  // reprise dit littéralement « strictement après le dernier vu ».
  let curseur: { created_at: string; id: string } | null = null;
  while (out.length < limit) {
    const taille = Math.min(PAGE_RATTRAPAGE, limit - out.length);
    let q = supabase
      .from("media_library")
      .select("id, url, created_at")
      .like("storage_path", "propre/%")
      .is("caption_statut", null);
    if (curseur) {
      q = q.or(
        `created_at.gt.${curseur.created_at},` +
          `and(created_at.eq.${curseur.created_at},id.gt.${curseur.id})`,
      );
    }
    const { data: sansCaption, error } = await q
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(taille);
    if (error) throw new Error(`Rattrapage captions — stock propre : ${messageErreur(error)}`);
    if (!sansCaption?.length) break;
    for (const m of sansCaption) {
      vus.add(m.id as string);
      out.push({ id: m.id as string, url: m.url as string, motif: "caption" });
    }
    const dernier = sansCaption[sansCaption.length - 1];
    const suivant = {
      created_at: String(dernier.created_at),
      id: String(dernier.id),
    };
    // Curseur qui ne bouge pas = on relirait la même page à l'infini. Même
    // règle que `lireTout` : on lève plutôt que de tourner en rond.
    if (curseur && suivant.created_at === curseur.created_at && suivant.id === curseur.id) {
      throw new Error(
        `Rattrapage captions : le curseur n'avance pas (${suivant.created_at}/${suivant.id}).`,
      );
    }
    curseur = suivant;
    // Deux sorties, et deux seulement : le quota de l'appelant est atteint, ou
    // la page revient VIDE au tour suivant. Pas de sortie sur page COURTE. Une
    // page courte ne prouve la fin que si l'on croit le serveur sur parole
    // quant à son plafond — et c'est précisément cette croyance qui a fait
    // s'arrêter les deux paginateurs historiques en se disant complets. Le
    // `limit` demandé ici est pourtant strictement sous le plafond, donc le
    // raccourci serait sans doute correct ; il coûte un aller-retour de
    // l'admettre, et ce fichier n'est pas l'endroit où économiser une
    // vérification sur cette famille de bugs.
  }

  if (out.length >= limit) return out;

  // Hooks manquants : 1ʳᵉ slide sans est_hook (déjà captionnée ou non).
  const restant = limit - out.length;
  const { data: contenus, error: errContenus } = await supabase
    .from("contenus")
    .select("structure_slides")
    .eq("statut", "valide")
    .order("created_at", { ascending: false })
    .limit(300);
  if (errContenus) {
    throw new Error(`Rattrapage captions — slideshows récents : ${messageErreur(errContenus)}`);
  }
  const hookIds: string[] = [];
  for (const c of contenus ?? []) {
    for (const s of (c.structure_slides ?? []) as Array<{
      position?: number;
      media_id?: string;
    }>) {
      if (Number(s.position) === 1 && s.media_id && !vus.has(s.media_id)) {
        hookIds.push(s.media_id);
      }
    }
  }
  const uniques = [...new Set(hookIds)].slice(0, restant);
  if (uniques.length === 0) return out;

  // `uniques` vient des 300 slideshows ci-dessus, 1ʳᵉ slide seulement : au plus
  // 300 ids, donc sous le seuil du garde-fou `in(...)`, et le filtre portant sur
  // la clé primaire la réponse ne peut pas être plus longue que le filtre.
  const { data: hooks, error: errHooks } = await supabase
    .from("media_library")
    .select("id, url, est_hook")
    .in("id", uniques)
    .eq("est_hook", false);
  if (errHooks) {
    throw new Error(`Rattrapage captions — hooks manquants : ${messageErreur(errHooks)}`);
  }
  for (const m of hooks ?? []) {
    out.push({ id: m.id as string, url: m.url as string, motif: "hook" });
  }
  return out;
}

export const CAPTION_DRAIN_PAR_WORKER = 4;

export interface CaptionRattrapageStatut {
  id: string;
  statut: "running" | "done" | "failed";
  total: number;
  fait: number;
  ok: number;
  aucune: number;
  hooks: number;
  echecs: number;
  logs: string[];
  started_at: string;
  updated_at: string;
}

function rowRun(r: Record<string, unknown>): CaptionRattrapageStatut {
  return {
    id: r.id as string,
    statut: r.statut as CaptionRattrapageStatut["statut"],
    total: Number(r.total ?? 0),
    fait: Number(r.fait ?? 0),
    ok: Number(r.ok ?? 0),
    aucune: Number(r.aucune ?? 0),
    hooks: Number(r.hooks ?? 0),
    echecs: Number(r.echecs ?? 0),
    logs: Array.isArray(r.logs) ? (r.logs as string[]) : [],
    started_at: String(r.started_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export async function lireRattrapageCaption(
  supabase: Supabase,
): Promise<CaptionRattrapageStatut | null> {
  const { data, error } = await supabase
    .from("caption_rattrapage_runs")
    .select("id, statut, total, fait, ok, aucune, hooks, echecs, logs, started_at, updated_at")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return rowRun(data as Record<string, unknown>);
}

export async function demarrerRattrapageCaption(
  supabase: Supabase,
): Promise<CaptionRattrapageStatut> {
  const courant = await lireRattrapageCaption(supabase);
  if (courant?.statut === "running") return courant;

  const medias = await listerMediasARattraper(supabase, {
    limit: LIMITE_RATTRAPAGE_DEFAUT,
  });
  if (medias.length === 0) {
    const { data, error } = await supabase
      .from("caption_rattrapage_runs")
      .insert({
        statut: "done",
        total: 0,
        finished_at: new Date().toISOString(),
        logs: ["Rien à rattraper — toutes les photos ont déjà une caption (ou un statut)."],
      })
      .select("id, statut, total, fait, ok, aucune, hooks, echecs, logs, started_at, updated_at")
      .single();
    if (error || !data) throw error ?? new Error("création run vide échouée");
    return rowRun(data as Record<string, unknown>);
  }

  const { data: run, error } = await supabase
    .from("caption_rattrapage_runs")
    .insert({
      statut: "running",
      total: medias.length,
        logs: [
          `Rattrapage captions sur ${medias.length} photo(s) — 6 workers × 4 en parallèle / min. Tu peux fermer, les logs restent ici.`,
        ],
    })
    .select("id, statut, total, fait, ok, aucune, hooks, echecs, logs, started_at, updated_at")
    .single();
  if (error || !run) throw error ?? new Error("création run échouée");

  const rows = medias.map((m) => ({
    run_id: run.id as string,
    media_id: m.id,
    motif: m.motif,
    statut: "pending",
  }));
  const TAILLE = 400;
  for (let i = 0; i < rows.length; i += TAILLE) {
    const { error: errF } = await supabase
      .from("caption_rattrapage_file")
      .insert(rows.slice(i, i + TAILLE));
    if (errF) throw errF;
  }
  return rowRun(run as Record<string, unknown>);
}

function ligneResultatCaption(r: CaptionPersistee): string {
  const extra = r.estHook ? " · Hook" : "";
  if (r.statut === "ok") {
    return `✓ ${r.mediaId.slice(0, 8)} — ${r.caption ?? ""}${extra}`;
  }
  return `· ${r.mediaId.slice(0, 8)} — Pas de caption reconnue${extra}`;
}

export async function drainRattrapageCaption(
  supabase: Supabase,
  opts: { n?: number } = {},
): Promise<{ traites: number; run: CaptionRattrapageStatut | null }> {
  const n = Math.min(12, Math.max(1, opts.n ?? CAPTION_DRAIN_PAR_WORKER));
  const { data: claims, error } = await supabase.rpc("claim_caption_rattrapage", { p_n: n });
  if (error) throw error;
  const lots = (claims ?? []) as Array<{
    id: string;
    run_id: string;
    media_id: string;
    motif: string;
  }>;
  if (lots.length === 0) {
    return { traites: 0, run: await lireRattrapageCaption(supabase) };
  }

  await Promise.all(
    lots.map(async (item) => {
      try {
        const r = await captionnerMedia(supabase, item.media_id, { forcer: false });
        await supabase
          .from("caption_rattrapage_file")
          .update({ statut: "done", lease_until: null })
          .eq("id", item.id);
        await supabase.rpc("appendre_log_caption_rattrapage", {
          p_run_id: item.run_id,
          p_ligne: ligneResultatCaption(r),
          p_ok: r.statut === "ok" ? 1 : 0,
          p_aucune: r.statut === "ok" ? 0 : 1,
          p_hooks: r.estHook ? 1 : 0,
          p_echecs: 0,
        });
      } catch (e) {
        await supabase
          .from("caption_rattrapage_file")
          .update({ statut: "failed", lease_until: null })
          .eq("id", item.id);
        await supabase.rpc("appendre_log_caption_rattrapage", {
          p_run_id: item.run_id,
          p_ligne: `✗ ${item.media_id.slice(0, 8)} — ${messageErreur(e)}`,
          p_ok: 0,
          p_aucune: 0,
          p_hooks: 0,
          p_echecs: 1,
        });
      }
    }),
  );

  return { traites: lots.length, run: await lireRattrapageCaption(supabase) };
}
