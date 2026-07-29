/**
 * File d'imports v-next en arrière-plan : logs complets, jobs parallèles,
 * la page Sources ne bloque pas.
 *
 * Compte : liste les URLs → 1 agent scrapePost + pipeline par slideshow,
 * en parallèle (pool borné).
 */

import {
  importerContenuDepuisLien,
  lancerImportContenu,
  listerSlideshowsCompte,
} from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";
import { executerEnLot } from "@/lib/lot";

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
}

type Listener = () => void;

let jobs: ImportJob[] = [];
const listeners = new Set<Listener>();

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
}

function newJob(titre: string): string {
  const id = crypto.randomUUID();
  upsertJob({
    id,
    titre,
    statut: "encours",
    logs: [],
    startedAt: Date.now(),
  });
  return id;
}

function tagUrl(url: string): string {
  const id = url.match(/\/(?:photo|video)\/(\d+)/)?.[1];
  return id ? id.slice(-8) : url.slice(-12);
}

interface SnapLangue {
  langue: string;
  score: number;
  nb_passages: number;
  slides_count: number;
  a_sophia: boolean;
}

interface SnapContenu {
  id: string;
  titre: string;
  statut: string;
  import_statut: string;
  import_etape: string | null;
  import_erreur: string | null;
  pertinence_score: number | null;
  pertinence_raison: string | null;
  vues_source: number | null;
  langue_source: string;
  slides_propres: number;
  slides_total: number;
  langues: SnapLangue[];
}

async function snapshotContenu(contenuId: string): Promise<SnapContenu | null> {
  const { data: c } = await supabase
    .from("contenus")
    .select(
      "id, titre, statut, import_statut, import_etape, import_erreur, pertinence_score, pertinence_raison, vues_source, langue_source, structure_slides",
    )
    .eq("id", contenuId)
    .maybeSingle();
  if (!c) return null;
  const { data: langues } = await supabase
    .from("contenu_langues")
    .select("langue, score, nb_passages, slides")
    .eq("contenu_id", contenuId)
    .order("score", { ascending: false });
  const slides = (c.structure_slides ?? []) as Array<{ media_id?: string | null }>;
  return {
    id: c.id,
    titre: c.titre ?? "",
    statut: c.statut,
    import_statut: c.import_statut,
    import_etape: c.import_etape,
    import_erreur: c.import_erreur,
    pertinence_score: c.pertinence_score,
    pertinence_raison: c.pertinence_raison,
    vues_source: c.vues_source,
    langue_source: c.langue_source,
    slides_propres: slides.filter((s) => s.media_id).length,
    slides_total: slides.length,
    langues: (langues ?? []).map((l) => {
      const s = (l.slides ?? []) as Array<{
        texte_overlay?: string | null;
        position_sophia?: boolean;
      }>;
      return {
        langue: l.langue,
        score: l.score,
        nb_passages: l.nb_passages,
        slides_count: s.filter((x) => x.texte_overlay).length,
        a_sophia: s.some((x) => x.position_sophia),
      };
    }),
  };
}

function detailSnap(snap: SnapContenu): string {
  const parts: string[] = [
    `statut=${snap.statut}`,
    `import=${snap.import_statut}/${snap.import_etape ?? "—"}`,
    `vues=${snap.vues_source ?? "—"}`,
    `pertinence=${snap.pertinence_score ?? "—"}`,
    `visuels propres ${snap.slides_propres}/${snap.slides_total}`,
  ];
  if (snap.pertinence_raison) parts.push(`raison: ${snap.pertinence_raison}`);
  if (snap.import_erreur) parts.push(`erreur: ${snap.import_erreur}`);
  if (snap.langues.length > 0) {
    parts.push(
      "ELO: " +
        snap.langues
          .map(
            (l) =>
              `${l.langue}=${l.score.toFixed(1)} (slides=${l.slides_count}${l.a_sophia ? ", sophia" : ""})`,
          )
          .join(", "),
    );
  }
  return parts.join(" · ");
}

const ETAPES_TERMINALES = new Set([
  "done",
  "rejete",
  "elo_insuffisant",
  "failed",
]);

/** Drain un contenu jusqu'à done / rejet, en loguant chaque étape. */
export async function drainContenuAvecLogs(
  jobId: string,
  contenuId: string,
  prefix = "",
): Promise<void> {
  const p = prefix ? `${prefix} ` : "";
  const MAX = 40;
  for (let i = 0; i < MAX; i += 1) {
    const r = await lancerImportContenu(contenuId);
    if (r.idle && !r.etape) {
      log(jobId, "warn", `${p}file vide / idle`);
      break;
    }
    const snap = await snapshotContenu(contenuId);
    const etape = r.etape ?? snap?.import_etape ?? "?";
    const level: ImportLogLevel =
      etape === "done"
        ? "ok"
        : etape === "rejete" || etape === "elo_insuffisant" || etape === "failed"
          ? "warn"
          : "info";
    log(
      jobId,
      level,
      `${p}étape « ${etape} »`,
      snap ? detailSnap(snap) : undefined,
    );
    if (ETAPES_TERMINALES.has(etape) || snap?.import_statut === "done") break;
  }
}

/** Un agent = scrapePost (Apify) + pipeline complet pour UN slideshow. */
async function agentSlideshow(opts: {
  jobId: string;
  url: string;
  compteReferenceId: string | null;
  labelIds: string[];
}): Promise<"ok" | "rejete" | "echec"> {
  const tag = `[${tagUrl(opts.url)}]`;
  log(opts.jobId, "info", `${tag} agent scrape démarré`, opts.url);
  try {
    const cree = await importerContenuDepuisLien(
      opts.url,
      opts.compteReferenceId,
      opts.labelIds,
    );
    if (cree.reused) {
      log(
        opts.jobId,
        "warn",
        `${tag} déjà connu — reprise pipeline`,
        cree.contenuId,
      );
    } else {
      log(
        opts.jobId,
        "ok",
        `${tag} scrape OK — contenu créé`,
        `${cree.contenuId}${cree.etape ? ` · premier pas=${cree.etape}` : ""}`,
      );
    }
    if (cree.etape) {
      const snap = await snapshotContenu(cree.contenuId);
      log(
        opts.jobId,
        "info",
        `${tag} étape « ${cree.etape} »`,
        snap ? detailSnap(snap) : undefined,
      );
      if (ETAPES_TERMINALES.has(cree.etape)) {
        // importerContenuDepuisLien a déjà avancé un pas terminal
      } else {
        await drainContenuAvecLogs(opts.jobId, cree.contenuId, tag);
      }
    } else {
      await drainContenuAvecLogs(opts.jobId, cree.contenuId, tag);
    }

    const snap = await snapshotContenu(cree.contenuId);
    if (snap?.statut === "valide" && snap.import_statut === "done") {
      log(opts.jobId, "ok", `${tag} terminé — prêt`, detailSnap(snap));
      return "ok";
    }
    if (snap?.import_etape === "elo_insuffisant" || snap?.statut === "rejete") {
      log(opts.jobId, "warn", `${tag} rejeté`, snap ? detailSnap(snap) : undefined);
      return "rejete";
    }
    log(
      opts.jobId,
      "warn",
      `${tag} incomplet`,
      snap ? detailSnap(snap) : undefined,
    );
    return "echec";
  } catch (e) {
    log(opts.jobId, "error", `${tag} échec agent`, (e as Error).message);
    return "echec";
  }
}

/** Lance l'import d'un lien TikTok en arrière-plan (ne bloque pas l'UI). */
export function demarrerImportLien(opts: {
  url: string;
  compteReferenceId: string | null;
  labelIds: string[];
  titre?: string;
}): string {
  const jobId = newJob(opts.titre ?? opts.url);
  void (async () => {
    try {
      log(jobId, "info", "Démarrage import lien (1 agent)…", opts.url);
      const statut = await agentSlideshow({
        jobId,
        url: opts.url,
        compteReferenceId: opts.compteReferenceId,
        labelIds: opts.labelIds,
      });
      fin(jobId, statut === "echec" ? "echec" : "ok");
    } catch (e) {
      log(jobId, "error", "Échec import", (e as Error).message);
      fin(jobId, "echec");
    }
  })();
  return jobId;
}

/**
 * Import d'un compte : liste les slideshows, puis 1 agent scrape+pipeline
 * par URL, en parallèle. Plusieurs jobs compte peuvent coexister.
 */
export function demarrerImportCompte(opts: {
  compteReferenceId: string;
  handle: string;
  /** Nombre d'agents slideshow simultanés (défaut 6). */
  largeur?: number;
}): string {
  const jobId = newJob(`@${opts.handle.replace(/^@/, "")}`);
  const largeur = opts.largeur ?? 6;
  void (async () => {
    try {
      log(
        jobId,
        "info",
        "Listing des slideshows du compte (sans scrape lourd)…",
        `@${opts.handle.replace(/^@/, "")}`,
      );
      const listed = await listerSlideshowsCompte(opts.compteReferenceId);
      log(
        jobId,
        "ok",
        `Liste OK — ${listed.urls.length} inédits / ${listed.total} photo(s) vues` +
          (listed.connus > 0 ? ` (${listed.connus} déjà connus)` : ""),
        `source=${listed.source}`,
      );

      if (listed.urls.length === 0) {
        log(jobId, "warn", "Aucun slideshow inédit à importer");
        fin(jobId, "ok");
        return;
      }

      log(
        jobId,
        "info",
        `Lancement de ${listed.urls.length} agent(s) — 1 scrape Apify + pipeline par slideshow (parallèle ×${Math.min(largeur, listed.urls.length)})`,
      );
      for (const url of listed.urls) {
        log(jobId, "info", `file d'attente agent [${tagUrl(url)}]`, url);
      }

      let ok = 0;
      let rejetes = 0;
      let echecs = 0;
      await executerEnLot(
        listed.urls,
        async (url) => {
          const r = await agentSlideshow({
            jobId,
            url,
            compteReferenceId: opts.compteReferenceId,
            labelIds: [],
          });
          if (r === "ok") ok += 1;
          else if (r === "rejete") rejetes += 1;
          else echecs += 1;
        },
        {
          largeur,
          onProgres: (fait, total) => {
            log(
              jobId,
              "info",
              `Progression agents ${fait}/${total}`,
              `ok=${ok} · rejetés=${rejetes} · échecs=${echecs}`,
            );
          },
        },
      );

      log(
        jobId,
        echecs > 0 ? "warn" : "ok",
        `Compte terminé — ${ok} prêts, ${rejetes} rejetés, ${echecs} échecs / ${listed.urls.length}`,
      );
      fin(jobId, echecs > 0 && ok === 0 ? "echec" : "ok");
    } catch (e) {
      log(jobId, "error", "Échec import compte", (e as Error).message);
      fin(jobId, "echec");
    }
  })();
  return jobId;
}

export function clearImportJobsTermines() {
  jobs = jobs.filter((j) => j.statut === "encours");
  emit();
}
