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
import { etatDepuisRun, type MajSourcesRun } from "@/features/moteur/majSequentielle";
import { handleTiktokDepuisSaisie } from "@/features/moteur/oubliSource";
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
const polls = new Map<string, ReturnType<typeof setTimeout>>();

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
    clearTimeout(t);
    polls.delete(jobId);
  }
}

/**
 * Le listing d'un profil retient une invocation Edge pendant tout l'appel Apify
 * (plusieurs dizaines de secondes). « Mettre à jour les sources » en lançait un
 * par compte d'un coup : au-delà de la concurrence Edge, les appels repartaient
 * en « Failed to send a request to the Edge Function », sur tous les comptes.
 * Le scrape derrière reste parallèle — il est drainé par les workers cron.
 */
const LISTINGS_SIMULTANES = 2;
let listingsEnCours = 0;
const fileListings: Array<() => void> = [];

async function prendreCreneauListing(): Promise<() => void> {
  if (listingsEnCours >= LISTINGS_SIMULTANES) {
    await new Promise<void>((resolve) => fileListings.push(resolve));
  }
  listingsEnCours += 1;
  let rendu = false;
  return () => {
    if (rendu) return;
    rendu = true;
    listingsEnCours -= 1;
    fileListings.shift()?.();
  };
}

export function listingsEnAttente(): number {
  return fileListings.length;
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

/** Rythme du suivi : réactif au début, plus calme sur un gros batch. */
function delaiPoll(depuisMs: number): number {
  if (depuisMs < 60_000) return 4_000;
  if (depuisMs < 5 * 60_000) return 8_000;
  return 20_000;
}

const ECHECS_AVANT_ABANDON = 8;

function startPolling(jobId: string, batchId: string) {
  let lastKey = "";
  let echecs = 0;
  const debut = Date.now();
  const eloVus = new Set<string>();

  // Enchaînement par setTimeout et non setInterval : un tick lent empilait les
  // suivants, ce qui ajoutait de la charge au moment où tout ramait déjà.
  const planifier = () => {
    const attente = delaiPoll(Date.now() - debut) * (echecs > 0 ? Math.min(echecs, 4) : 1);
    polls.set(
      jobId,
      setTimeout(() => void tick(), attente),
    );
  };

  const tick = async () => {
    try {
      const s = await statsImportBatch(batchId);
      echecs = 0;
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
            log(jobId, "warn", `scrape échoué`, `${r.post_url}\n${r.erreur ?? ""}`);
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
        return;
      }
    } catch (e) {
      echecs += 1;
      if (echecs >= ECHECS_AVANT_ABANDON) {
        log(
          jobId,
          "warn",
          `Suivi interrompu après ${echecs} échecs de lecture — l'import continue côté serveur`,
          `Rouvre la page pour reprendre le suivi.\n${(e as Error).message}`,
        );
        fin(jobId, "ok");
        return;
      }
      // Une seule ligne, pas une par tentative : avant, l'échec se répétait
      // toutes les 4 s sur chaque compte et noyait les vrais messages.
      if (echecs === 1) {
        log(
          jobId,
          "warn",
          "Lecture de la progression indisponible — nouvelle tentative",
          (e as Error).message,
        );
      }
    }
    planifier();
  };
  void tick();
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
      if (r.invalides?.length) {
        log(
          jobId,
          "error",
          "Lien refusé — ce n'est pas l'URL d'un slideshow",
          `Colle l'URL d'un post (…/photo/… ou …/video/…), pas celle d'un profil.\n${r.invalides.join("\n")}`,
        );
        fin(jobId, "echec");
        return;
      }
      log(
        jobId,
        "ok",
        `Enfilé — batch ${r.batchId.slice(0, 8)}…`,
        `enfilées=${r.enqueued} · déjà en file=${r.skipped} · langue=${opts.langue}`,
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
  /** Uniquement les TikToks publiés depuis le dernier import (pas les anciens). */
  nouveauxSeulement?: boolean;
}): string {
  const handle = handleTiktokDepuisSaisie(opts.handle);
  const prefixe = opts.nouveauxSeulement ? "MAJ @" : "@";
  const jobId = newJob(`${prefixe}${handle}`);
  void (async () => {
    let rendreCreneau: (() => void) | null = null;
    try {
      log(
        jobId,
        "info",
        opts.nouveauxSeulement
          ? `Mise à jour — rattrapage des slideshows manquants (langue=${opts.langue})…`
          : `Listing + enqueue (langue=${opts.langue}) — fermeture OK…`,
        `@${handle}`,
      );
      if (listingsEnCours >= LISTINGS_SIMULTANES) {
        log(jobId, "info", `En attente d'un créneau de listing (${listingsEnAttente() + 1} en file)`);
      }
      rendreCreneau = await prendreCreneauListing();
      const r = await enqueueImportCompte(
        opts.compteReferenceId,
        undefined,
        opts.langue,
        { nouveauxSeulement: opts.nouveauxSeulement },
      );
      const cur = jobs.find((j) => j.id === jobId);
      if (cur) upsertJob({ ...cur, batchId: r.batchId });
      const detail = [
        `profil=${r.total} slideshow(s) · déjà en stock=${r.connus} · manquants=${r.manquants}`,
        `dont publiés depuis le dernier import=${r.nouveaux}`,
        `batch=${r.batchId} · source=${r.source} · langue=${opts.langue}`,
        ...(r.invalides ? [`écartées (pas des URLs de post)=${r.invalides}`] : []),
        ...(r.diagnostic ?? []),
      ].join("\n");

      if (r.total === 0) {
        // Le profil n'a rien rendu : handle invalide, page TikTok bloquée ou
        // Apify en échec. Le détail dit lequel — c'est ce qui manquait avant.
        log(jobId, "error", "Aucun slideshow trouvé sur le profil", detail);
        fin(jobId, "echec");
        return;
      }

      if (opts.nouveauxSeulement) {
        log(
          jobId,
          r.enqueued > 0 ? "ok" : "info",
          r.enqueued > 0
            ? `Mise à jour — ${r.enqueued} slideshow(s) manquant(s) enfilé(s)`
            : `Rien à rattraper — les ${r.total} slideshows du profil sont déjà en stock`,
          detail,
        );
      } else {
        log(
          jobId,
          "ok",
          `File créée — ${r.enqueued} URL(s) enfilée(s)` +
            (r.skipped ? ` (${r.skipped} déjà en file)` : "") +
            (r.connus ? ` · ${r.connus} déjà connus (re-pipeline)` : ""),
          detail,
        );
      }

      if (r.enqueued === 0) {
        fin(jobId, "ok");
        return;
      }
      startPolling(jobId, r.batchId);
    } catch (e) {
      log(jobId, "error", "Échec import compte", (e as Error).message);
      fin(jobId, "echec");
    } finally {
      rendreCreneau?.();
    }
  })();
  return jobId;
}

export function clearImportJobsTermines() {
  jobs = jobs.filter((j) => j.statut === "encours");
  emit();
}

/** Avancement de la séquence, lu depuis Postgres (survit à la navigation). */
export type MajSourcesEtat = ReturnType<typeof etatDepuisRun>;

let majJobId: string | null = null;

function niveauVersLog(niveau: string): ImportLogLevel {
  if (niveau === "error") return "error";
  if (niveau === "ok") return "ok";
  if (niveau === "warn") return "warn";
  return "info";
}

/**
 * Reconstruit le job du panneau à partir de l'état persisté. Revenir sur la
 * page reprend les logs là où le serveur les a laissés.
 */
export function syncMajJobDepuisRun(run: MajSourcesRun | null): MajSourcesEtat {
  const etat = etatDepuisRun(run);
  if (!run) return etat;
  // Page rouverte après coup : on ne recrée pas un job terminé.
  if (run.statut !== "running" && !majJobId) return etat;

  const titre = `Mise à jour séquentielle — ${run.comptes.length} source(s)`;
  let job = majJobId ? jobs.find((j) => j.id === majJobId) : undefined;
  if (!job) {
    majJobId = newJob(titre);
    job = jobs.find((j) => j.id === majJobId);
  }
  if (!job) return etat;

  const logs: ImportLogLine[] = (run.journal ?? []).map((l) => ({
    at: Date.parse(l.at) || Date.now(),
    level: niveauVersLog(l.niveau),
    message: l.message,
    detail: l.detail,
  }));
  const statut: ImportJobStatut =
    run.statut === "running" ? "encours" : run.statut === "bloquee" ? "echec" : "ok";
  upsertJob({
    ...job,
    titre,
    logs,
    statut,
    endedAt: statut === "encours" ? undefined : (job.endedAt ?? Date.now()),
  });
  return etat;
}
