/**
 * File d'imports v-next en arrière-plan : logs complets, jobs parallèles,
 * la page Sources ne bloque pas.
 */

import {
  importerContenuDepuisLien,
  lancerImportContenu,
  scraperSourceVersContenus,
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
      log(jobId, "info", "Démarrage import lien…", opts.url);
      const cree = await importerContenuDepuisLien(
        opts.url,
        opts.compteReferenceId,
        opts.labelIds,
      );
      if (cree.reused) {
        log(jobId, "warn", "TikTok déjà connu — reprise du pipeline", cree.contenuId);
      } else {
        log(jobId, "ok", "Contenu créé", cree.contenuId);
      }
      if (cree.etape) {
        log(jobId, "info", `Premier pas : ${cree.etape}`);
      }
      await drainContenuAvecLogs(jobId, cree.contenuId);
      const snap = await snapshotContenu(cree.contenuId);
      if (snap?.statut === "valide" && snap.import_statut === "done") {
        log(jobId, "ok", "Import terminé — contenu prêt", detailSnap(snap));
        fin(jobId, "ok");
      } else if (snap?.import_etape === "elo_insuffisant" || snap?.statut === "rejete") {
        log(jobId, "warn", "Import rejeté", snap ? detailSnap(snap) : undefined);
        fin(jobId, "ok");
      } else {
        log(jobId, "warn", "Import interrompu / incomplet", snap ? detailSnap(snap) : undefined);
        fin(jobId, "echec");
      }
    } catch (e) {
      log(jobId, "error", "Échec import", (e as Error).message);
      fin(jobId, "echec");
    }
  })();
  return jobId;
}

/**
 * Scrape un compte puis drain chaque contenu créé — contenus en parallèle
 * (pool borné). Plusieurs jobs compte peuvent tourner en même temps.
 */
export function demarrerImportCompte(opts: {
  compteReferenceId: string;
  handle: string;
  largeur?: number;
}): string {
  const jobId = newJob(`@${opts.handle.replace(/^@/, "")}`);
  void (async () => {
    try {
      log(jobId, "info", "Scrape de tous les TikToks du compte…");
      const r = await scraperSourceVersContenus(opts.compteReferenceId);
      log(
        jobId,
        "ok",
        `Scrape OK — ${r.crees} nouveaux contenus` +
          (r.scrapes != null ? ` (${r.scrapes} posts photo vus)` : ""),
        r.ids.length ? `ids: ${r.ids.map((id) => id.slice(0, 8)).join(", ")}` : undefined,
      );
      if (r.ids.length === 0) {
        log(jobId, "warn", "Aucun nouveau contenu à traiter");
        fin(jobId, "ok");
        return;
      }
      log(
        jobId,
        "info",
        `Pipeline (OCR → pertinence → ELO → clean → trad → Sophia) sur ${r.ids.length} contenus en parallèle…`,
      );
      await executerEnLot(
        r.ids,
        (contenuId) =>
          drainContenuAvecLogs(jobId, contenuId, `[${contenuId.slice(0, 8)}]`),
        { largeur: opts.largeur ?? 3 },
      );
      log(jobId, "ok", "Tous les contenus du compte ont été drainés");
      fin(jobId, "ok");
    } catch (e) {
      log(jobId, "error", "Échec scrape / import compte", (e as Error).message);
      fin(jobId, "echec");
    }
  })();
  return jobId;
}

export function clearImportJobsTermines() {
  jobs = jobs.filter((j) => j.statut === "encours");
  emit();
}
