/**
 * Imports v-next : enqueue serveur + suivi par polling.
 * Le scrape et le pipeline tournent côté Edge (workers cron + auto-chaîne) —
 * fermer l'onglet / changer de page n'arrête plus l'import.
 */

import {
  contenusEloDuBatch,
  enqueueImportCompte,
  enqueueImportUrls,
  statsImportBatch,
} from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

export type ImportLogLevel = "info" | "ok" | "warn" | "error";

export interface ImportLogLine {
  at: number;
  level: ImportLogLevel;
  message: string;
  detail?: string;
}

export type ImportJobStatut = "encours" | "ok" | "echec";

export interface ImportJob {
  id: string;
  titre: string;
  statut: ImportJobStatut;
  logs: ImportLogLine[];
  startedAt: number;
  endedAt?: number;
  batchId?: string;
}

type Listener = () => void;

let jobs: ImportJob[] = [];
const listeners = new Set<Listener>();
const polls = new Map<string, ReturnType<typeof setInterval>>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeImportJobs(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getImportJobs(): ImportJob[] {
  return jobs;
}

function upsertJob(job: ImportJob) {
  const i = jobs.findIndex((j) => j.id === job.id);
  if (i >= 0) jobs = [...jobs.slice(0, i), job, ...jobs.slice(i + 1)];
  else jobs = [job, ...jobs].slice(0, 20);
  emit();
}

function log(jobId: string, level: ImportLogLevel, message: string, detail?: string) {
  const cur = jobs.find((j) => j.id === jobId);
  if (!cur) return;
  upsertJob({
    ...cur,
    logs: [...cur.logs, { at: Date.now(), level, message, detail }],
  });
}

function fin(jobId: string, statut: ImportJobStatut) {
  const cur = jobs.find((j) => j.id === jobId);
  if (!cur) return;
  upsertJob({ ...cur, statut, endedAt: Date.now() });
  const t = polls.get(jobId);
  if (t) {
    clearInterval(t);
    polls.delete(jobId);
  }
}

function newJob(titre: string, batchId?: string): string {
  const id = crypto.randomUUID();
  upsertJob({
    id,
    titre,
    statut: "encours",
    logs: [],
    startedAt: Date.now(),
    batchId,
  });
  return id;
}

function startPolling(jobId: string, batchId: string) {
  let lastKey = "";
  const eloVus = new Set<string>();
  const tick = async () => {
    try {
      const job = jobs.find((j) => j.id === jobId);
      if (job && Date.now() - job.startedAt > 8 * 60_000) {
        const s0 = await statsImportBatch(batchId);
        if (s0.done === 0 && s0.failed === 0 && s0.pending + s0.running <= 1) {
          log(
            jobId,
            "error",
            "Listing trop long (8 min) — Apify n’a rien enfilé",
            `batch=${batchId}`,
          );
          fin(jobId, "echec");
          return;
        }
      }
      const s = await statsImportBatch(batchId);
      const key = `${s.pending}-${s.running}-${s.done}-${s.failed}-${s.contenusPending}-${s.contenusDone}`;
      if (key !== lastKey) {
        lastKey = key;
        log(
          jobId,
          "info",
          `Serveur · file ${s.done + s.failed}/${s.total} scrapés` +
            ` · pipeline ${s.contenusDone} prêts / ${s.contenusPending} en cours` +
            (s.failed ? ` · ${s.failed} échecs scrape` : ""),
          `pending=${s.pending} running=${s.running} done=${s.done} failed=${s.failed}`,
        );
      }

      // Rapport ELO dès qu'il est persisté (rejeté ou accepté).
      const eloRows = await contenusEloDuBatch(batchId).catch(() => []);
      for (const row of eloRows) {
        if (!row.elo || eloVus.has(row.contenuId)) continue;
        eloVus.add(row.contenuId);
        const sousSeuil = row.importEtape === "elo_insuffisant";
        log(
          jobId,
          sousSeuil ? "warn" : "ok",
          sousSeuil
            ? `ELO sous seuil — ${row.postUrl}`
            : `calcul ELO — ${row.postUrl}`,
          row.elo.texte,
        );
      }

      const fileVide = s.pending === 0 && s.running === 0;
      const pipelineVide = s.contenusPending === 0;
      if (fileVide && pipelineVide && s.total > 0) {
        const { data: rows } = await supabase
          .from("import_file")
          .select("contenu_id, statut, erreur, post_url")
          .eq("batch_id", batchId);
        const ok = (rows ?? []).filter((r) => r.statut === "done").length;
        const fail = (rows ?? []).filter((r) => r.statut === "failed").length;
        for (const r of rows ?? []) {
          if (r.statut === "failed") {
            const listing = String(r.post_url ?? "").startsWith("listing://");
            log(
              jobId,
              listing ? "error" : "warn",
              listing ? "Listing Apify échoué" : "scrape échoué",
              listing ? (r.erreur ?? "") : `${r.post_url}\n${r.erreur ?? ""}`,
            );
          }
        }
        const sousElo = eloRows.filter((r) => r.importEtape === "elo_insuffisant").length;
        log(
          jobId,
          fail > 0 && ok === 0 ? "error" : fail > 0 || sousElo > 0 ? "warn" : "ok",
          `Terminé (serveur) — ${ok} scrapés, ${fail} échecs scrape` +
            (sousElo ? `, ${sousElo} ELO sous seuil` : "") +
            `, ${s.contenusDone} contenus traités`,
        );
        fin(jobId, fail > 0 && ok === 0 ? "echec" : "ok");
      }
    } catch (e) {
      log(jobId, "warn", "Polling stats…", (e as Error).message);
    }
  };
  void tick();
  const handle = setInterval(() => void tick(), 4000);
  polls.set(jobId, handle);
}

/** Lance l'import d'un lien TikTok — enqueue serveur, drain autonome. */
export function demarrerImportLien(opts: {
  url: string;
  compteReferenceId: string | null;
  labelIds: string[];
  /** Langue d'origine du TikTok (requis pour le boost ELO). */
  langue: string;
  titre?: string;
}): string {
  const jobId = newJob(opts.titre ?? opts.url);
  void (async () => {
    try {
      log(
        jobId,
        "info",
        `Enqueue serveur (langue=${opts.langue}) — tu peux quitter la page…`,
        opts.url,
      );
      const r = await enqueueImportUrls({
        urls: [opts.url],
        compteReferenceId: opts.compteReferenceId,
        labelIds: opts.labelIds,
        langue: opts.langue,
      });
      const cur = jobs.find((j) => j.id === jobId);
      if (cur) upsertJob({ ...cur, batchId: r.batchId });
      log(
        jobId,
        "ok",
        `Enfilé — batch ${r.batchId.slice(0, 8)}… · workers kickés`,
        `enqueued=${r.enqueued} skipped=${r.skipped} · langue=${opts.langue}`,
      );
      startPolling(jobId, r.batchId);
    } catch (e) {
      log(jobId, "error", "Échec enqueue", (e as Error).message);
      fin(jobId, "echec");
    }
  })();
  return jobId;
}

/**
 * Import d'un compte : listing + enqueue de toutes les URLs côté serveur.
 * Parallélisation = 12 workers cron/min + auto-chaîne Edge.
 */
export function demarrerImportCompte(opts: {
  compteReferenceId: string;
  handle: string;
  /** Langue d'origine des TikToks de ce compte. */
  langue: string;
  /** Ignoré — la largeur est côté serveur (workers). */
  largeur?: number;
}): string {
  const jobId = newJob(`@${opts.handle.replace(/^@/, "")}`);
  void (async () => {
    try {
      log(
        jobId,
        "info",
        `Listing + enqueue (langue=${opts.langue}) — logs live, fermeture OK…`,
        `@${opts.handle.replace(/^@/, "")}`,
      );
      const r = await enqueueImportCompte(
        opts.compteReferenceId,
        undefined,
        opts.langue,
        (msg) => {
          const level = /échec|ÉCHEC|erreur|ATTENTION/i.test(msg)
            ? "warn"
            : /File créée/i.test(msg)
              ? "ok"
              : "info";
          log(jobId, level, msg);
        },
      );
      const cur = jobs.find((j) => j.id === jobId);
      if (cur) upsertJob({ ...cur, batchId: r.batchId });
      log(
        jobId,
        "ok",
        r.listing
          ? `Listing Apify enfilé (worker) — suivi de la file…`
          : `File créée — ${r.enqueued} URLs enqueued` +
              (r.skipped ? ` (${r.skipped} déjà en file)` : "") +
              (r.connus ? ` · ${r.connus} déjà connus (re-pipeline)` : ""),
        `batch=${r.batchId} · total profil=${r.total} · source=${r.source} · langue=${opts.langue}`,
      );
      if (r.enqueued === 0 && r.skipped === 0 && r.total === 0) {
        log(jobId, "warn", "Aucun slideshow à importer");
        fin(jobId, "ok");
        return;
      }
      startPolling(jobId, r.batchId);
    } catch (e) {
      const raw = (e as Error).message;
      log(jobId, "error", "Échec import compte", raw);
      fin(jobId, "echec");
    }
  })();
  return jobId;
}

export function clearImportJobsTermines() {
  jobs = jobs.filter((j) => j.statut === "encours");
  emit();
}
