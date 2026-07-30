/**
 * Rattrapage ELO sur une fenêtre courte (défaut 4 jours Paris).
 *
 * 1) Relève stats TikTok des passages publiés (publie_url) — vues/likes…
 * 2) ELO langue : deltas ↑/↓ incrémentaux (signal = vues seules), idempotents
 *    via passages.elo_maj_at — contourne PAUSE_ELO_RUNTIME.
 * 3) ELO compte : moyenne pondérée récence des ≤10 derniers posts mesurés.
 */
import { scrapePost, scrapeStats, type ScrapedPost } from "./apify.ts";
import {
  chargerScoring,
  performanceNormalisee,
  performancePassage,
  type Supabase,
} from "./scoring.ts";
import { aujourdhuiParis } from "./supabase.ts";

export const RATTRAPAGE_JOURS_DEFAUT = 4;
const POSTS_RELEVES = 30;
/** Sensibilité ELO langue (plus fort que l'EWMA comptes 0.3). */
const LR_LANGUE = 0.4;
/** Plafond |Δ| par passage pour éviter les coups trop violents. */
const MAX_DELTA_LANGUE = 18;
const COMPTE_MAX_POSTS = 10;
const COMPTE_DECAY = 0.85;
/** Fenêtre (±h) pour matcher le « dernier post » profil vs date attendue. */
const COHERENCE_HEURES = 36;

export interface RattrapageOpts {
  compteId?: string | null;
  /** Nombre de jours Paris inclus (aujourd'hui inclus). Défaut 4. */
  jours?: number;
  /** Réapplique l'ELO même si elo_maj_at est déjà posé (recalcule depuis score actuel). */
  forcer?: boolean;
  dryRun?: boolean;
}

export interface RattrapageResultat {
  fenetre: { debut: string; fin: string; jours: number };
  stats: {
    comptes: number;
    releves: number;
    fallbackUrl: number;
    fallbackCoherence: number;
    erreurs: Array<{ compteId: string; erreur: string }>;
  };
  eloLangue: { appliques: number; ignores: number; deltas: number };
  eloCompte: { maj: number };
  dryRun: boolean;
}

function ajouterJoursParis(yyyyMmDd: string, delta: number): string {
  // Midi UTC évite les bascules DST autour de minuit.
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
}

function joursFenetreParis(jours: number): { debut: string; fin: string; dates: string[] } {
  const fin = aujourdhuiParis();
  const dates: string[] = [];
  for (let i = jours - 1; i >= 0; i--) {
    dates.push(ajouterJoursParis(fin, -i));
  }
  return { debut: dates[0]!, fin, dates };
}

function idDuLien(url: string): string {
  return url.match(/\/(?:photo|video)\/(\d+)/)?.[1] ?? url;
}

async function resoudreLien(url: string): Promise<string> {
  if (!/\/\/(?:vm|vt)\.tiktok\.com/i.test(url)) return url;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      },
    });
    return res.url || url;
  } catch {
    return url;
  }
}

function tokensTexte(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

/** Similarité Jaccard simple sur tokens ≥3 car. */
function similariteTexte(a: string, b: string): number {
  const A = tokensTexte(a);
  const B = tokensTexte(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

function texteAttenduSlides(slides: unknown): string {
  if (!Array.isArray(slides)) return "";
  return slides
    .map((s) => {
      if (!s || typeof s !== "object") return "";
      const o = s as Record<string, unknown>;
      return String(o.texte_overlay ?? o.texte ?? "");
    })
    .filter(Boolean)
    .join(" ");
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

type PassageFenetre = {
  id: string;
  contenu_id: string;
  compte_id: string;
  langue: string;
  publie_url: string | null;
  publie_at: string | null;
  date_publication_prevue: string | null;
  vues: number | null;
  likes: number | null;
  commentaires: number | null;
  partages: number | null;
  elo_maj_at: string | null;
  slides: unknown;
};

async function chargerPassagesFenetre(
  supabase: Supabase,
  dates: string[],
  compteId: string | null,
): Promise<PassageFenetre[]> {
  let q = supabase
    .from("passages")
    .select(
      "id, contenu_id, compte_id, langue, publie_url, publie_at, date_publication_prevue, vues, likes, commentaires, partages, elo_maj_at, slides",
    )
    .eq("statut", "publie")
    .in("date_publication_prevue", dates)
    .not("publie_url", "is", null);

  if (compteId) q = q.eq("compte_id", compteId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PassageFenetre[];
}

async function ecrireStats(
  supabase: Supabase,
  passageId: string,
  stats: ScrapedPost["stats"],
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  await supabase
    .from("passages")
    .update({
      vues: stats.vues,
      likes: stats.likes,
      commentaires: stats.commentaires,
      partages: stats.partages,
      stats_maj_at: new Date().toISOString(),
    })
    .eq("id", passageId);
}

/**
 * Relève les stats pour les passages de la fenêtre.
 * Ordre : match URL dans scrape profil → scrapePost(url) → dernier post
 * profil cohérent (date ±36h + texte).
 */
async function releverStatsFenetre(
  supabase: Supabase,
  passages: PassageFenetre[],
  dryRun: boolean,
): Promise<RattrapageResultat["stats"]> {
  const out: RattrapageResultat["stats"] = {
    comptes: 0,
    releves: 0,
    fallbackUrl: 0,
    fallbackCoherence: 0,
    erreurs: [],
  };

  const parCompte = new Map<string, PassageFenetre[]>();
  for (const p of passages) {
    const list = parCompte.get(p.compte_id) ?? [];
    list.push(p);
    parCompte.set(p.compte_id, list);
  }

  const compteIds = [...parCompte.keys()];
  if (compteIds.length === 0) return out;

  const { data: comptes, error } = await supabase
    .from("comptes")
    .select("id, handle_tiktok")
    .in("id", compteIds)
    .not("handle_tiktok", "is", null);
  if (error) throw error;

  out.comptes = (comptes ?? []).length;

  for (const compte of comptes ?? []) {
    const handle = compte.handle_tiktok as string;
    const liste = parCompte.get(compte.id) ?? [];
    try {
      const enLigne = await scrapeStats(handle, POSTS_RELEVES);
      const parId = new Map(enLigne.map((p) => [idDuLien(p.webVideoUrl), p]));

      for (const passage of liste) {
        if (!passage.publie_url) continue;
        const complet = await resoudreLien(passage.publie_url);
        let match = parId.get(idDuLien(complet)) ?? null;
        let via: "url" | "fallbackUrl" | "coherence" | null = match ? "url" : null;

        if (!match) {
          try {
            const seuls = await scrapePost(passage.publie_url);
            if (seuls[0]?.stats) {
              match = seuls[0];
              via = "fallbackUrl";
            }
          } catch {
            // on tente la cohérence ci-dessous
          }
        }

        if (!match) {
          const ancreMs = passage.publie_at
            ? Date.parse(passage.publie_at)
            : passage.date_publication_prevue
              ? Date.parse(`${passage.date_publication_prevue}T12:00:00Z`)
              : NaN;
          const attendu = texteAttenduSlides(passage.slides);
          let best: { post: ScrapedPost; score: number } | null = null;
          for (const post of enLigne) {
            if (post.createTime == null || !Number.isFinite(ancreMs)) continue;
            const postMs = post.createTime * 1000;
            if (Math.abs(postMs - ancreMs) > COHERENCE_HEURES * 3600_000) continue;
            const sim = similariteTexte(attendu, post.text);
            // Date seule si pas de texte exploitable ; sinon exige un peu de overlap.
            const score = attendu.trim() ? sim : 0.5;
            if (attendu.trim() && sim < 0.15) continue;
            if (!best || score > best.score) best = { post, score };
          }
          if (best) {
            match = best.post;
            via = "coherence";
          }
        }

        if (!match) continue;
        await ecrireStats(supabase, passage.id, match.stats, dryRun);
        passage.vues = match.stats.vues;
        passage.likes = match.stats.likes;
        passage.commentaires = match.stats.commentaires;
        passage.partages = match.stats.partages;
        out.releves += 1;
        if (via === "fallbackUrl") out.fallbackUrl += 1;
        if (via === "coherence") out.fallbackCoherence += 1;
      }
    } catch (e) {
      out.erreurs.push({
        compteId: compte.id,
        erreur: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return out;
}

async function appliquerEloLangue(
  supabase: Supabase,
  passages: PassageFenetre[],
  opts: { forcer: boolean; dryRun: boolean },
): Promise<RattrapageResultat["eloLangue"]> {
  const scoring = await chargerScoring(supabase);
  const out = { appliques: 0, ignores: 0, deltas: 0 };

  // Chronologique : publie_at puis date prévue puis id.
  const ordonnés = [...passages].sort((a, b) => {
    const ta = a.publie_at ?? `${a.date_publication_prevue ?? ""}T00:00:00Z`;
    const tb = b.publie_at ?? `${b.date_publication_prevue ?? ""}T00:00:00Z`;
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });

  const compteIds = [...new Set(ordonnés.map((p) => p.compte_id))];
  const { data: comptesRows } = await supabase
    .from("comptes")
    .select("id, score")
    .in("id", compteIds.length ? compteIds : ["00000000-0000-0000-0000-000000000000"]);
  const scoreCompte = new Map(
    (comptesRows ?? []).map((c) => [c.id as string, (c.score as number) ?? scoring.score_prior]),
  );

  // Cache des scores langue en mémoire pour chaîner les deltas du même run.
  const scoreLangue = new Map<string, { id: string; score: number; nb: number }>();

  for (const p of ordonnés) {
    if (p.vues == null) {
      out.ignores += 1;
      continue;
    }
    if (p.elo_maj_at && !opts.forcer) {
      out.ignores += 1;
      continue;
    }

    const key = `${p.contenu_id}::${p.langue}`;
    let cl = scoreLangue.get(key);
    if (!cl) {
      const { data: row } = await supabase
        .from("contenu_langues")
        .select("id, score, nb_passages")
        .eq("contenu_id", p.contenu_id)
        .eq("langue", p.langue)
        .maybeSingle();
      if (!row) {
        out.ignores += 1;
        continue;
      }
      cl = {
        id: row.id as string,
        score: (row.score as number) ?? scoring.score_prior,
        nb: (row.nb_passages as number) ?? 0,
      };
      scoreLangue.set(key, cl);
    }

    const perf = performanceNormalisee(
      performancePassage(p.vues),
      scoreCompte.get(p.compte_id) ?? scoring.score_prior,
      scoring.score_prior,
    );
    const brut = LR_LANGUE * (perf - cl.score);
    const delta = clamp(brut, -MAX_DELTA_LANGUE, MAX_DELTA_LANGUE);
    const next = clamp(cl.score + delta, 0, 100);
    const nb = opts.forcer && p.elo_maj_at ? cl.nb : cl.nb + 1;

    if (!opts.dryRun) {
      await supabase
        .from("contenu_langues")
        .update({
          score: next,
          nb_passages: nb,
          score_maj_at: new Date().toISOString(),
        })
        .eq("id", cl.id);
      await supabase
        .from("passages")
        .update({ elo_maj_at: new Date().toISOString() })
        .eq("id", p.id);
    }

    cl.score = next;
    cl.nb = nb;
    p.elo_maj_at = new Date().toISOString();
    out.appliques += 1;
    out.deltas += delta;
  }

  return out;
}

/**
 * ELO compte = moyenne pondérée (décroissance récence) des ≤10 derniers
 * passages publiés mesurés (vues seules → performancePassage).
 */
async function appliquerEloComptes(
  supabase: Supabase,
  compteIds: string[],
  dryRun: boolean,
): Promise<RattrapageResultat["eloCompte"]> {
  const scoring = await chargerScoring(supabase);
  let maj = 0;

  for (const cid of compteIds) {
    const { data: posts } = await supabase
      .from("passages")
      .select("vues, publie_at, date_publication_prevue, created_at")
      .eq("compte_id", cid)
      .eq("statut", "publie")
      .not("vues", "is", null)
      .limit(40);

    const mesurés = (posts ?? []).filter((p) => p.vues != null);
    if (mesurés.length === 0) continue;

    // Plus récent d'abord (publie_at → date prévue → created_at).
    mesurés.sort((a, b) => {
      const ta = (a.publie_at as string | null) ??
        (a.date_publication_prevue as string | null) ??
        (a.created_at as string | null) ??
        "";
      const tb = (b.publie_at as string | null) ??
        (b.date_publication_prevue as string | null) ??
        (b.created_at as string | null) ??
        "";
      return ta < tb ? 1 : ta > tb ? -1 : 0;
    });
    const top = mesurés.slice(0, COMPTE_MAX_POSTS);

    let sumW = 0;
    let sum = 0;
    top.forEach((p, i) => {
      const w = Math.pow(COMPTE_DECAY, i);
      const perf = performancePassage(p.vues as number);
      sumW += w;
      sum += w * perf;
    });
    const next = clamp(sum / sumW, 0, 100);
    // Garde-fou soft vers le prior si très peu de posts.
    const regularise =
      (scoring.regularisation_k * scoring.score_prior + top.length * next) /
      (scoring.regularisation_k + top.length);

    if (!dryRun) {
      await supabase
        .from("comptes")
        .update({ score: regularise, score_maj_at: new Date().toISOString() })
        .eq("id", cid);
    }
    maj += 1;
  }

  return { maj };
}

export async function rattrapageElo(
  supabase: Supabase,
  opts: RattrapageOpts = {},
): Promise<RattrapageResultat> {
  const jours = Math.max(1, Math.min(14, opts.jours ?? RATTRAPAGE_JOURS_DEFAUT));
  const dryRun = Boolean(opts.dryRun);
  const forcer = Boolean(opts.forcer);
  const { debut, fin, dates } = joursFenetreParis(jours);

  const passages = await chargerPassagesFenetre(supabase, dates, opts.compteId ?? null);
  const stats = await releverStatsFenetre(supabase, passages, dryRun);
  const eloLangue = await appliquerEloLangue(supabase, passages, { forcer, dryRun });

  const compteIds = [...new Set(passages.map((p) => p.compte_id))];
  const eloCompte = await appliquerEloComptes(supabase, compteIds, dryRun);

  return {
    fenetre: { debut, fin, jours },
    stats,
    eloLangue,
    eloCompte,
    dryRun,
  };
}
