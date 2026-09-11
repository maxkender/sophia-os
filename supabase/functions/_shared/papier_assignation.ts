/**
 * Assigne depuis la bibliothèque de masters FR.
 * Chaque CM tire au hasard un master pas encore utilisé dans sa langue.
 * La voix / vidéo de la langue se crée à la demande (pas au pipeline).
 */

import {
  captionDepuisLangue,
  estLanguePapierPrete,
  hashtagsDepuisLangue,
  piocherMasterInutilise,
} from "./papier_assignation_core.ts";
import { assurerLangueMaster } from "./papier_locales.ts";
import { aujourdhuiParis, serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

type LangueRow = {
  id: string;
  master_id: string;
  langue: string;
  title: string | null;
  hook: string | null;
  cta: string | null;
  hashtags: string | null;
  statut: string;
  video_url: string | null;
  video_path: string | null;
};

type MasterBiblio = {
  id: string;
  date_publication: string;
  video_url: string | null;
  application_id?: string | null;
};

export type PapierAssignOpts = {
  date?: string;
  masterId?: string;
  langueId?: string;
  fenetreJours?: number;
  compteId?: string;
  test?: boolean;
};

export type PapierAssignPost = {
  id: string;
  compte_id: string;
  langue: string;
  title: string | null;
  caption: string | null;
  hashtags: string | null;
  video_url: string;
  est_test: boolean;
  date_publication_prevue: string;
};

export type PapierAssignResultat = {
  ok: true;
  assigns: number;
  comptes: number;
  langues: number;
  dates: string[];
  detail: string;
  test?: boolean;
  posts?: PapierAssignPost[];
  besoinOriginal?: boolean;
  kicksLangue?: string[];
};

export async function assignerPapierComptes(
  supabase: Supabase,
  opts: PapierAssignOpts = {},
): Promise<PapierAssignResultat> {
  const jour = opts.date ?? aujourdhuiParis();
  const test = Boolean(opts.test);
  const masters = await chargerBibliotheque(supabase, opts.masterId);
  if (!masters.length) {
    return {
      ok: true,
      assigns: 0,
      comptes: 0,
      langues: 0,
      dates: [jour],
      detail: "bibliothèque vide — aucun master FR prêt",
      test,
      besoinOriginal: !test,
    };
  }

  const { data: postsConso, error: errP } = await supabase
    .from("papier_posts")
    .select("master_id, langue, compte_id, date_publication_prevue, est_test")
    .eq("est_test", false);
  if (errP) throw errP;
  const pris: Array<{
    master_id: string;
    langue: string;
    compte_id?: string;
    date_publication_prevue?: string;
    est_test?: boolean | null;
  }> = [...(postsConso ?? [])];

  let qComptes = supabase
    .from("comptes")
    .select("id, langue, type_compte, is_active, application_id, warmup_started_at, warmup_ends_at")
    .eq("type_compte", "cm");
  if (opts.compteId) qComptes = qComptes.eq("id", opts.compteId);
  else if (!test) qComptes = qComptes.eq("is_active", true);
  const { data: comptesBruts, error: errC } = await qComptes;
  if (errC) throw errC;
  const maintenant = Date.now();
  const comptes = (comptesBruts ?? []).filter((c) => {
    if (!test && c.is_active === false) return false;
    if (test) return true;
    if (!c.warmup_started_at || !c.warmup_ends_at) return false;
    return new Date(String(c.warmup_ends_at)).getTime() <= maintenant;
  });

  const rows: Array<Record<string, unknown>> = [];
  const kicksLangue: string[] = [];
  let besoinOriginal = false;

  for (const compte of comptes) {
    const dejaAuj = pris.some(
      (p) => p.compte_id === compte.id && p.date_publication_prevue === jour && !p.est_test,
    );
    if (dejaAuj && !test) continue;

    const mastersApp = masters.filter(
      (m) =>
        !compte.application_id ||
        !m.application_id ||
        m.application_id === compte.application_id,
    );
    const masterId = piocherMasterInutilise(mastersApp, pris, compte.langue);
    if (!masterId) {
      besoinOriginal = true;
      continue;
    }

    const langue = await assurerLangueMaster(supabase, masterId, compte.langue);
    pris.push({
      master_id: masterId,
      langue: compte.langue,
      compte_id: compte.id,
      date_publication_prevue: jour,
      est_test: false,
    });
    if (!estLanguePapierPrete(langue)) {
      kicksLangue.push(langue.id);
      continue;
    }

    rows.push({
      compte_id: compte.id,
      date_publication_prevue: jour,
      master_id: masterId,
      langue_id: langue.id,
      langue: langue.langue,
      title: langue.title,
      caption: captionDepuisLangue(langue),
      hashtags: hashtagsDepuisLangue(langue.hashtags),
      video_url: langue.video_url,
      video_path: langue.video_path,
      statut: "assigne",
      est_test: test,
      updated_at: new Date().toISOString(),
    });
  }

  let posts: PapierAssignPost[] = [];
  if (rows.length) {
    const { data: upserted, error: errU } = await supabase
      .from("papier_posts")
      .upsert(rows, { onConflict: "compte_id,date_publication_prevue,est_test" })
      .select(
        "id, compte_id, langue, title, caption, hashtags, video_url, est_test, date_publication_prevue",
      );
    if (errU) throw errU;
    posts = (upserted ?? []) as PapierAssignPost[];
  }

  return {
    ok: true,
    assigns: rows.length,
    comptes: new Set(rows.map((r) => r.compte_id as string)).size,
    langues: new Set(rows.map((r) => r.langue as string)).size,
    dates: [jour],
    test,
    posts,
    besoinOriginal: besoinOriginal && !test,
    kicksLangue,
    detail: rows.length
      ? `${rows.length} assignation(s) CM${test ? " (test)" : ""}`
      : kicksLangue.length
        ? "langue en cours d'assemblage (voix + karaoké)"
        : besoinOriginal
          ? "bibliothèque épuisée pour cette langue — original manquant"
          : "aucun compte CM à assigner",
  };
}

export async function supprimerPapierPostsTest(
  supabase: Supabase,
  opts: { compteId: string; date?: string },
): Promise<{ ok: true; supprimes: number }> {
  let q = supabase
    .from("papier_posts")
    .delete()
    .eq("est_test", true)
    .eq("compte_id", opts.compteId);
  if (opts.date) q = q.eq("date_publication_prevue", opts.date);
  const { data, error } = await q.select("id");
  if (error) throw error;
  return { ok: true, supprimes: (data ?? []).length };
}

/** Test : pioche un master, crée la ligne langue du compte, dit s'il faut kick. */
export async function preparerAssignationPapierTest(
  supabase: Supabase,
  opts: PapierAssignOpts,
): Promise<{
  masterId?: string;
  langue?: string;
  langueId?: string;
  ready: boolean;
  soigne: boolean;
}> {
  if (!opts.compteId) return { ready: false, soigne: false };
  const { data: compte, error } = await supabase
    .from("comptes")
    .select("langue")
    .eq("id", opts.compteId)
    .maybeSingle();
  if (error) throw error;
  const langue = String((compte as { langue?: string } | null)?.langue ?? "").trim();
  if (!langue) return { ready: false, soigne: false };

  const masters = await chargerBibliotheque(supabase, opts.masterId);
  const { data: posts } = await supabase
    .from("papier_posts")
    .select("master_id, langue, est_test")
    .eq("est_test", false);
  const masterId =
    piocherMasterInutilise(masters, posts ?? [], langue) ?? masters[0]?.id;
  if (!masterId) return { langue, ready: false, soigne: false };

  const row = await assurerLangueMaster(supabase, masterId, langue);
  return {
    masterId,
    langue,
    langueId: row.id,
    ready: estLanguePapierPrete(row),
    soigne: true,
  };
}

async function chargerBibliotheque(
  supabase: Supabase,
  masterId?: string,
): Promise<MasterBiblio[]> {
  let q = supabase
    .from("papier_masters")
    .select("id, date_publication, video_url, application_id")
    .eq("statut", "ready")
    .not("video_url", "is", null)
    .order("created_at", { ascending: true });
  if (masterId) q = q.eq("id", masterId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as MasterBiblio[];
}

export type { LangueRow };
