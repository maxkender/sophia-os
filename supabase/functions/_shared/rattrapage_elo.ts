/**
 * Rattrapage ELO sur une fenêtre courte (défaut 4 jours Paris).
 *
 * 1) Relève stats TikTok des passages publiés (publie_url) — vues/likes…
 * 2) ELO langue : deltas ↑/↓ incrémentaux (signal = vues seules), idempotents
 *    via passages.elo_maj_at — contourne PAUSE_ELO_RUNTIME.
 * 3) ELO compte : moyenne pondérée récence des ≤10 derniers posts mesurés.
 *
 * Renvoie aussi `logs` (trace) + `brief` (résumé UI).
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
/** Profil TikTok scrapé — garder bas pour rester sous le timeout Edge 150s / compte. */
const POSTS_RELEVES = 12;
/** Sensibilité ELO langue (plus fort que l'EWMA comptes 0.3). */
const LR_LANGUE = 0.4;
/** Plafond |Δ| par passage pour éviter les coups trop violents. */
const MAX_DELTA_LANGUE = 18;
const COMPTE_MAX_POSTS = 10;
const COMPTE_DECAY = 0.85;
/** Fenêtre (±h) pour matcher le « dernier post » profil vs date attendue. */
const COHERENCE_HEURES = 36;
/** Max d’entrées détaillées dans le brief (UI). */
const BRIEF_TOP = 12;
/** Pénalité ELO compte par jour actif sans publication (jours passés de la fenêtre). */
const ELO_PENALITE_NOPOST = 5;

export type LogLevel = "info" | "ok" | "warn" | "error";

export interface RattrapageLog {
  at: string;
  level: LogLevel;
  message: string;
  detail?: string;
}

export interface RattrapageOpts {
  compteId?: string | null;
  /** Nombre de jours Paris inclus (aujourd'hui inclus). Défaut 4. */
  jours?: number;
  /** Réapplique l'ELO même si elo_maj_at est déjà posé (recalcule depuis score actuel). */
  forcer?: boolean;
  dryRun?: boolean;
}

export interface EloLangueDetail {
  passageId: string;
  contenuId: string;
  compteId: string;
  handle: string | null;
  langue: string;
  date: string | null;
  vues: number;
  avant: number;
  apres: number;
  delta: number;
}

export interface EloCompteDetail {
  compteId: string;
  handle: string | null;
  avant: number;
  apres: number;
  posts: number;
  /** Jours passés (fenêtre) sans publication → −5 chacun. */
  joursSansPost?: number;
  penalite?: number;
}

export interface RattrapageBrief {
  resume: string;
  fenetre: string;
  passages: number;
  stats: {
    comptes: number;
    releves: number;
    sansMatch: number;
    fallbackUrl: number;
    fallbackCoherence: number;
    erreurs: number;
  };
  eloLangue: {
    appliques: number;
    ignores: number;
    deltaNet: number;
    hausses: number;
    baisses: number;
    top: EloLangueDetail[];
  };
  eloCompte: {
    maj: number;
    top: EloCompteDetail[];
  };
}

export interface RattrapageResultat {
  fenetre: { debut: string; fin: string; jours: number };
  stats: {
    comptes: number;
    releves: number;
    fallbackUrl: number;
    fallbackCoherence: number;
    sansMatch: number;
    erreurs: Array<{ compteId: string; handle?: string | null; erreur: string }>;
  };
  eloLangue: {
    appliques: number;
    ignores: number;
    deltas: number;
    hausses: number;
    baisses: number;
    details: EloLangueDetail[];
  };
  eloCompte: { maj: number; details: EloCompteDetail[] };
  brief: RattrapageBrief;
  logs: RattrapageLog[];
  dryRun: boolean;
}

class Journal {
  readonly lines: RattrapageLog[] = [];
  push(level: LogLevel, message: string, detail?: string) {
    const at = new Date().toISOString();
    this.lines.push({ at, level, message, detail });
    const prefix = level === "error" ? "ERR" : level === "warn" ? "WRN" : level === "ok" ? "OK" : "INF";
    console.log(`[rattrapage-elo] ${prefix} ${message}${detail ? ` — ${detail}` : ""}`);
  }
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

/** Compte en process = warmup terminé (ends_at ≤ now). Hors process → pas d'ELO compte. */
function compteEnProcessus(c: {
  warmup_started_at?: string | null;
  warmup_ends_at?: string | null;
}): boolean {
  if (!c.warmup_started_at || !c.warmup_ends_at) return false;
  return new Date(c.warmup_ends_at).getTime() <= Date.now();
}

/** Était déjà actif (warmup fini) au jour Paris `jour` (YYYY-MM-DD). */
function etaitActifAuJour(
  c: { warmup_ends_at?: string | null },
  jour: string,
): boolean {
  if (!c.warmup_ends_at) return false;
  // Compare en date Paris : fin warmup ≤ fin de ce jour.
  const endsParis = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(
    new Date(c.warmup_ends_at),
  );
  return endsParis <= jour;
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

function fmt(n: number, digits = 1): string {
  return (Math.round(n * 10 ** digits) / 10 ** digits).toFixed(digits);
}

function signe(n: number): string {
  if (n > 0) return `+${fmt(n)}`;
  return fmt(n);
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
  handles: Map<string, string | null>,
  journal: Journal,
): Promise<RattrapageResultat["stats"]> {
  const out: RattrapageResultat["stats"] = {
    comptes: 0,
    releves: 0,
    fallbackUrl: 0,
    fallbackCoherence: 0,
    sansMatch: 0,
    erreurs: [],
  };

  const parCompte = new Map<string, PassageFenetre[]>();
  for (const p of passages) {
    const list = parCompte.get(p.compte_id) ?? [];
    list.push(p);
    parCompte.set(p.compte_id, list);
  }

  const compteIds = [...parCompte.keys()];
  if (compteIds.length === 0) {
    journal.push("warn", "Aucun passage publié avec publie_url dans la fenêtre");
    return out;
  }

  const { data: comptes, error } = await supabase
    .from("comptes")
    .select("id, handle_tiktok")
    .in("id", compteIds)
    .not("handle_tiktok", "is", null);
  if (error) throw error;

  for (const c of comptes ?? []) {
    handles.set(c.id as string, (c.handle_tiktok as string) ?? null);
  }

  out.comptes = (comptes ?? []).length;
  journal.push(
    "info",
    `Stats — ${out.comptes} compte(s), ${passages.length} passage(s)`,
  );

  for (const compte of comptes ?? []) {
    const handle = compte.handle_tiktok as string;
    const liste = parCompte.get(compte.id) ?? [];
    let relevesCompte = 0;
    let sansMatchCompte = 0;
    try {
      journal.push("info", `@${handle} — scrape profil (${liste.length} passage(s))`);
      const enLigne = await scrapeStats(handle, POSTS_RELEVES);
      const parId = new Map(enLigne.map((p) => [idDuLien(p.webVideoUrl), p]));
      journal.push("info", `@${handle} — ${enLigne.length} post(s) TikTok scrapés`);

      // Total profil → compte_metrics (alimente le snapshot Pilotage j0−j1).
      if (!dryRun && enLigne.length > 0) {
        const somme = (f: (s: ScrapedPost["stats"]) => number) =>
          enLigne.reduce((n, p) => n + (f(p.stats) || 0), 0);
        await supabase.from("compte_metrics").insert({
          compte_id: compte.id,
          vues: somme((s) => s.vues),
          likes: somme((s) => s.likes),
          commentaires: somme((s) => s.commentaires),
          partages: somme((s) => s.partages),
          nb_posts: enLigne.length,
        });
      }

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
          } catch (e) {
            journal.push(
              "warn",
              `@${handle} — scrapePost échoué`,
              e instanceof Error ? e.message : String(e),
            );
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
            const score = attendu.trim() ? sim : 0.5;
            if (attendu.trim() && sim < 0.15) continue;
            if (!best || score > best.score) best = { post, score };
          }
          if (best) {
            match = best.post;
            via = "coherence";
          }
        }

        if (!match) {
          sansMatchCompte += 1;
          out.sansMatch += 1;
          journal.push(
            "warn",
            `@${handle} — pas de match stats`,
            `${passage.date_publication_prevue ?? "?"} · ${passage.id.slice(0, 8)}`,
          );
          continue;
        }

        await ecrireStats(supabase, passage.id, match.stats, dryRun);
        passage.vues = match.stats.vues;
        passage.likes = match.stats.likes;
        passage.commentaires = match.stats.commentaires;
        passage.partages = match.stats.partages;
        out.releves += 1;
        relevesCompte += 1;
        if (via === "fallbackUrl") out.fallbackUrl += 1;
        if (via === "coherence") out.fallbackCoherence += 1;
        journal.push(
          "ok",
          `@${handle} · ${passage.date_publication_prevue ?? "?"} → ${match.stats.vues} vues`,
          via === "url" ? "match URL" : via === "fallbackUrl" ? "fallback scrapePost" : "fallback cohérence",
        );
      }

      journal.push(
        relevesCompte > 0 ? "ok" : "warn",
        `@${handle} — ${relevesCompte}/${liste.length} relevé(s)` +
          (sansMatchCompte ? `, ${sansMatchCompte} sans match` : ""),
      );
    } catch (e) {
      const erreur = e instanceof Error ? e.message : String(e);
      out.erreurs.push({ compteId: compte.id, handle, erreur });
      journal.push("error", `@${handle} — erreur scrape`, erreur);
    }
  }

  return out;
}

async function appliquerEloLangue(
  supabase: Supabase,
  passages: PassageFenetre[],
  opts: { forcer: boolean; dryRun: boolean },
  handles: Map<string, string | null>,
  journal: Journal,
): Promise<RattrapageResultat["eloLangue"]> {
  const scoring = await chargerScoring(supabase);
  const out: RattrapageResultat["eloLangue"] = {
    appliques: 0,
    ignores: 0,
    deltas: 0,
    hausses: 0,
    baisses: 0,
    details: [],
  };

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

  const scoreLangue = new Map<string, { id: string; score: number; nb: number }>();
  journal.push("info", `ELO langue — ${ordonnés.length} passage(s) à examiner`);

  for (const p of ordonnés) {
    if (p.vues == null) {
      out.ignores += 1;
      journal.push(
        "warn",
        `ELO langue ignoré (pas de vues)`,
        `${p.date_publication_prevue ?? "?"} · ${p.langue} · ${p.id.slice(0, 8)}`,
      );
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
        journal.push(
          "warn",
          `ELO langue — pas de contenu_langues`,
          `${p.contenu_id.slice(0, 8)} · ${p.langue}`,
        );
        continue;
      }
      cl = {
        id: row.id as string,
        score: (row.score as number) ?? scoring.score_prior,
        nb: (row.nb_passages as number) ?? 0,
      };
      scoreLangue.set(key, cl);
    }

    const avant = cl.score;
    const perf = performanceNormalisee(
      performancePassage(p.vues, scoring.elo_vues_plafond),
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
    if (delta > 0.05) out.hausses += 1;
    else if (delta < -0.05) out.baisses += 1;

    const detail: EloLangueDetail = {
      passageId: p.id,
      contenuId: p.contenu_id,
      compteId: p.compte_id,
      handle: handles.get(p.compte_id) ?? null,
      langue: p.langue,
      date: p.date_publication_prevue,
      vues: p.vues,
      avant,
      apres: next,
      delta,
    };
    out.details.push(detail);

    const handle = detail.handle ? `@${detail.handle}` : p.compte_id.slice(0, 8);
    journal.push(
      delta >= 0 ? "ok" : "warn",
      `ELO ${p.langue.toUpperCase()} ${handle} ${signe(delta)} → ${fmt(next)}`,
      `${p.date_publication_prevue ?? "?"} · ${p.vues} vues · ${fmt(avant)} → ${fmt(next)}`,
    );
  }

  journal.push(
    "info",
    `ELO langue — ${out.appliques} appliqué(s), ${out.ignores} ignoré(s), Δnet ${signe(out.deltas)} (${out.hausses}↑ ${out.baisses}↓)`,
  );

  return out;
}

/**
 * Jours passés de la fenêtre où le compte était actif mais n'a pas publié.
 * Aujourd'hui exclu (créneau encore ouvert).
 */
async function joursSansPublication(
  supabase: Supabase,
  compteId: string,
  joursPasses: string[],
  compte: { warmup_ends_at?: string | null },
): Promise<number> {
  const joursEligibles = joursPasses.filter((j) => etaitActifAuJour(compte, j));
  if (joursEligibles.length === 0) return 0;

  const { data } = await supabase
    .from("passages")
    .select("date_publication_prevue, publie_at, publie_url, statut")
    .eq("compte_id", compteId)
    .in("date_publication_prevue", joursEligibles);

  const postes = new Set<string>();
  for (const p of data ?? []) {
    const jour = p.date_publication_prevue as string | null;
    if (!jour) continue;
    const publie =
      p.statut === "publie" ||
      Boolean(p.publie_url) ||
      Boolean(p.publie_at);
    if (publie) postes.add(jour);
  }

  return joursEligibles.filter((j) => !postes.has(j)).length;
}

/**
 * ELO compte = moyenne pondérée (décroissance récence) des ≤10 derniers
 * passages publiés mesurés (vues seules → performancePassage),
 * puis −5 par jour actif sans publication (idempotent sur la fenêtre).
 * Comptes en warmup : ignorés (score inchangé).
 */
async function appliquerEloComptes(
  supabase: Supabase,
  compteIds: string[],
  datesFenetre: string[],
  dryRun: boolean,
  handles: Map<string, string | null>,
  journal: Journal,
): Promise<RattrapageResultat["eloCompte"]> {
  const scoring = await chargerScoring(supabase);
  const details: EloCompteDetail[] = [];
  const auj = aujourdhuiParis();
  const joursPasses = datesFenetre.filter((d) => d < auj);

  journal.push("info", `ELO compte — ${compteIds.length} compte(s)`);

  for (const cid of compteIds) {
    const { data: rowAvant } = await supabase
      .from("comptes")
      .select("score, handle_tiktok, warmup_started_at, warmup_ends_at")
      .eq("id", cid)
      .maybeSingle();
    if (!rowAvant) continue;

    const avant = (rowAvant.score as number | null) ?? scoring.score_prior;
    if (rowAvant.handle_tiktok) {
      handles.set(cid, rowAvant.handle_tiktok as string);
    }
    const handle = handles.get(cid) ?? null;
    const label = handle ? `@${handle}` : cid.slice(0, 8);

    // Warmup / pas encore en process → ne pas toucher l'ELO compte.
    if (
      !compteEnProcessus({
        warmup_started_at: rowAvant.warmup_started_at as string | null,
        warmup_ends_at: rowAvant.warmup_ends_at as string | null,
      })
    ) {
      journal.push("info", `ELO compte — skip warmup ${label}`);
      continue;
    }

    // Les DERNIERS posts mesurés d'abord (order serveur — pas un limit aveugle).
    const { data: posts } = await supabase
      .from("passages")
      .select("vues, publie_at, date_publication_prevue, created_at")
      .eq("compte_id", cid)
      .eq("statut", "publie")
      .not("vues", "is", null)
      .order("date_publication_prevue", { ascending: false, nullsFirst: false })
      .order("publie_at", { ascending: false, nullsFirst: false })
      .limit(COMPTE_MAX_POSTS);

    const mesurés = (posts ?? []).filter((p) => p.vues != null);
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

    let base: number;
    if (top.length === 0) {
      // Pas de posts mesurés : ancre sur le prior (idempotent) puis pénalités.
      base = scoring.score_prior;
    } else {
      let sumW = 0;
      let sum = 0;
      top.forEach((p, i) => {
        const w = Math.pow(COMPTE_DECAY, i);
        const perf = performancePassage(p.vues as number, scoring.elo_vues_plafond);
        sumW += w;
        sum += w * perf;
      });
      const next = clamp(sum / sumW, 0, 100);
      // k ELO import (défaut 1) — PAS regularisation_k=5 qui collait le score à 50.
      const k = Math.max(0.1, scoring.elo_regularisation_k);
      base = (k * scoring.score_prior + top.length * next) / (k + top.length);
    }

    const joursSans = await joursSansPublication(
      supabase,
      cid,
      joursPasses,
      { warmup_ends_at: rowAvant.warmup_ends_at as string | null },
    );
    const penalite = joursSans * ELO_PENALITE_NOPOST;
    const apres = clamp(base - penalite, 0, 100);

    if (top.length === 0 && joursSans === 0) {
      journal.push("warn", `ELO compte — aucun post mesuré, pas de pénalité`, label);
      continue;
    }

    if (!dryRun) {
      await supabase
        .from("comptes")
        .update({ score: apres, score_maj_at: new Date().toISOString() })
        .eq("id", cid);
    }

    details.push({
      compteId: cid,
      handle,
      avant,
      apres,
      posts: top.length,
      joursSansPost: joursSans,
      penalite,
    });
    journal.push(
      apres >= avant ? "ok" : "warn",
      `ELO compte ${label} ${signe(apres - avant)} → ${fmt(apres)}`,
      `${fmt(avant)} → ${fmt(apres)} · ${top.length} post(s)` +
        (joursSans > 0
          ? ` · −${penalite} (${joursSans}j sans post × ${ELO_PENALITE_NOPOST})`
          : ""),
    );
  }

  journal.push("info", `ELO compte — ${details.length} mis à jour`);
  return { maj: details.length, details };
}

function construireBrief(
  fenetre: { debut: string; fin: string; jours: number },
  passages: number,
  stats: RattrapageResultat["stats"],
  eloLangue: RattrapageResultat["eloLangue"],
  eloCompte: RattrapageResultat["eloCompte"],
  dryRun: boolean,
): RattrapageBrief {
  const topLangue = [...eloLangue.details]
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, BRIEF_TOP);
  const topCompte = [...eloCompte.details]
    .sort((a, b) => Math.abs(b.apres - b.avant) - Math.abs(a.apres - a.avant))
    .slice(0, BRIEF_TOP);

  const resume =
    `${dryRun ? "[dry-run] " : ""}` +
    `${fenetre.debut}→${fenetre.fin} · ${stats.releves} stats · ` +
    `${eloLangue.appliques} ELO langue (${eloLangue.hausses}↑ ${eloLangue.baisses}↓, Δ ${signe(eloLangue.deltas)}) · ` +
    `${eloCompte.maj} ELO compte` +
    (stats.sansMatch ? ` · ${stats.sansMatch} sans match` : "") +
    (stats.erreurs.length ? ` · ${stats.erreurs.length} erreur(s)` : "");

  return {
    resume,
    fenetre: `${fenetre.debut} → ${fenetre.fin} (${fenetre.jours}j)`,
    passages,
    stats: {
      comptes: stats.comptes,
      releves: stats.releves,
      sansMatch: stats.sansMatch,
      fallbackUrl: stats.fallbackUrl,
      fallbackCoherence: stats.fallbackCoherence,
      erreurs: stats.erreurs.length,
    },
    eloLangue: {
      appliques: eloLangue.appliques,
      ignores: eloLangue.ignores,
      deltaNet: eloLangue.deltas,
      hausses: eloLangue.hausses,
      baisses: eloLangue.baisses,
      top: topLangue,
    },
    eloCompte: {
      maj: eloCompte.maj,
      top: topCompte,
    },
  };
}

/**
 * Figé le total des vues (dernier compte_metrics par compte actif) pour le
 * jour Paris courant. vues_delta = total − total de la veille.
 */
export async function snapshotVuesGlobales(
  supabase: Supabase,
  journal?: Journal,
): Promise<{ jour: string; vues_totales: number; vues_delta: number | null; nb_comptes: number }> {
  const jour = aujourdhuiParis();
  const { data: comptes, error } = await supabase
    .from("comptes")
    .select("id")
    .eq("is_active", true);
  if (error) throw error;

  let vuesTotales = 0;
  let nb = 0;
  for (const c of comptes ?? []) {
    const { data: m } = await supabase
      .from("compte_metrics")
      .select("vues")
      .eq("compte_id", c.id)
      .order("collecte_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (m?.vues != null) {
      vuesTotales += Number(m.vues);
      nb += 1;
    }
  }

  const veille = (() => {
    const d = new Date(`${jour}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
  })();

  const { data: prev } = await supabase
    .from("vues_globales_jour")
    .select("vues_totales")
    .eq("jour", veille)
    .maybeSingle();

  const vuesDelta = prev?.vues_totales != null
    ? vuesTotales - Number(prev.vues_totales)
    : null;

  await supabase.from("vues_globales_jour").upsert(
    {
      jour,
      vues_totales: vuesTotales,
      vues_delta: vuesDelta,
      nb_comptes: nb,
    },
    { onConflict: "jour" },
  );

  journal?.push(
    "ok",
    `Snapshot vues ${jour}`,
    `total ${vuesTotales} · Δ ${vuesDelta ?? "n/a"} · ${nb} compte(s)`,
  );

  return { jour, vues_totales: vuesTotales, vues_delta: vuesDelta, nb_comptes: nb };
}

export async function rattrapageElo(
  supabase: Supabase,
  opts: RattrapageOpts & { snapshot?: boolean } = {},
): Promise<RattrapageResultat & { snapshot?: Awaited<ReturnType<typeof snapshotVuesGlobales>> }> {
  const journal = new Journal();

  // Mode snapshot seul (fin de run live / cron).
  if (opts.snapshot && !opts.compteId) {
    const snap = await snapshotVuesGlobales(supabase, journal);
    const { debut, fin, dates } = joursFenetreParis(RATTRAPAGE_JOURS_DEFAUT);
    return {
      fenetre: { debut, fin, jours: dates.length },
      stats: {
        comptes: 0,
        releves: 0,
        fallbackUrl: 0,
        fallbackCoherence: 0,
        sansMatch: 0,
        erreurs: [],
      },
      eloLangue: {
        appliques: 0,
        ignores: 0,
        deltas: 0,
        hausses: 0,
        baisses: 0,
        details: [],
      },
      eloCompte: { maj: 0, details: [] },
      brief: construireBrief(
        { debut, fin, jours: dates.length },
        0,
        {
          comptes: 0,
          releves: 0,
          fallbackUrl: 0,
          fallbackCoherence: 0,
          sansMatch: 0,
          erreurs: [],
        },
        {
          appliques: 0,
          ignores: 0,
          deltas: 0,
          hausses: 0,
          baisses: 0,
          details: [],
        },
        { maj: 0, details: [] },
        false,
      ),
      logs: journal.lines,
      dryRun: false,
      snapshot: snap,
    };
  }

  const jours = Math.max(1, Math.min(14, opts.jours ?? RATTRAPAGE_JOURS_DEFAUT));
  const dryRun = Boolean(opts.dryRun);
  const forcer = Boolean(opts.forcer);
  const { debut, fin, dates } = joursFenetreParis(jours);
  const handles = new Map<string, string | null>();

  journal.push(
    "info",
    `Démarrage rattrapage ELO${dryRun ? " (dry-run)" : ""}${forcer ? " (forcer)" : ""}`,
    `fenêtre ${debut} → ${fin} (${jours}j)` +
      (opts.compteId ? ` · compte ${opts.compteId.slice(0, 8)}` : " · tous comptes"),
  );

  const passages = await chargerPassagesFenetre(supabase, dates, opts.compteId ?? null);
  journal.push("info", `${passages.length} passage(s) publiés avec lien dans la fenêtre`);

  // Compte isolé sans passage dans la fenêtre : scraper quand même pour metrics + ELO compte.
  if (opts.compteId && passages.length === 0) {
    const { data: c } = await supabase
      .from("comptes")
      .select("id, handle_tiktok")
      .eq("id", opts.compteId)
      .maybeSingle();
    if (c?.handle_tiktok && !dryRun) {
      try {
        const enLigne = await scrapeStats(c.handle_tiktok as string, POSTS_RELEVES);
        const somme = (f: (s: ScrapedPost["stats"]) => number) =>
          enLigne.reduce((n, p) => n + (f(p.stats) || 0), 0);
        await supabase.from("compte_metrics").insert({
          compte_id: c.id,
          vues: somme((s) => s.vues),
          likes: somme((s) => s.likes),
          commentaires: somme((s) => s.commentaires),
          partages: somme((s) => s.partages),
          nb_posts: enLigne.length,
        });
        journal.push("ok", `@${c.handle_tiktok} — metrics profil (${enLigne.length} posts)`);
      } catch (e) {
        journal.push(
          "error",
          `@${c.handle_tiktok} — scrape metrics`,
          e instanceof Error ? e.message : String(e),
        );
      }
    }
  }

  // Warmup : ne pas toucher ELO compte (ni langue pour ce compte isolé).
  if (opts.compteId) {
    const { data: cWarm } = await supabase
      .from("comptes")
      .select("id, handle_tiktok, warmup_started_at, warmup_ends_at")
      .eq("id", opts.compteId)
      .maybeSingle();
    if (
      cWarm &&
      !compteEnProcessus({
        warmup_started_at: cWarm.warmup_started_at as string | null,
        warmup_ends_at: cWarm.warmup_ends_at as string | null,
      })
    ) {
      const h = (cWarm.handle_tiktok as string | null) ?? opts.compteId.slice(0, 8);
      journal.push("info", `Skip warmup — ELO inchangé`, h.startsWith("@") ? h : `@${h}`);
      const vide = {
        comptes: 0,
        releves: 0,
        fallbackUrl: 0,
        fallbackCoherence: 0,
        sansMatch: 0,
        erreurs: [] as RattrapageResultat["stats"]["erreurs"],
      };
      const eloVide = {
        appliques: 0,
        ignores: 0,
        deltas: 0,
        hausses: 0,
        baisses: 0,
        details: [] as EloLangueDetail[],
      };
      const compteVide = { maj: 0, details: [] as EloCompteDetail[] };
      const brief = construireBrief({ debut, fin, jours }, 0, vide, eloVide, compteVide, dryRun);
      journal.push("ok", "Terminé (warmup)", brief.resume);
      return {
        fenetre: { debut, fin, jours },
        stats: vide,
        eloLangue: eloVide,
        eloCompte: compteVide,
        brief,
        logs: journal.lines,
        dryRun,
      };
    }
  }

  const stats = await releverStatsFenetre(supabase, passages, dryRun, handles, journal);
  const eloLangue = await appliquerEloLangue(supabase, passages, { forcer, dryRun }, handles, journal);

  // ELO compte : tous les actifs en process (pénalité no-post même sans passage publié).
  let compteIds: string[];
  if (opts.compteId) {
    compteIds = [opts.compteId];
  } else {
    const { data: actifs } = await supabase
      .from("comptes")
      .select("id, warmup_started_at, warmup_ends_at")
      .eq("is_active", true);
    compteIds = (actifs ?? [])
      .filter((c) =>
        compteEnProcessus({
          warmup_started_at: c.warmup_started_at as string | null,
          warmup_ends_at: c.warmup_ends_at as string | null,
        }),
      )
      .map((c) => c.id as string);
  }
  const eloCompte = await appliquerEloComptes(
    supabase,
    compteIds,
    dates,
    dryRun,
    handles,
    journal,
  );

  let snapshot: Awaited<ReturnType<typeof snapshotVuesGlobales>> | undefined;
  // Snapshot global seulement sur un run « tous comptes » (pas un compte isolé).
  if (!dryRun && !opts.compteId) {
    snapshot = await snapshotVuesGlobales(supabase, journal);
  }

  const brief = construireBrief(
    { debut, fin, jours },
    passages.length,
    stats,
    eloLangue,
    eloCompte,
    dryRun,
  );
  journal.push("ok", "Terminé", brief.resume);

  return {
    fenetre: { debut, fin, jours },
    stats,
    eloLangue,
    eloCompte,
    brief,
    logs: journal.lines,
    dryRun,
    snapshot,
  };
}
