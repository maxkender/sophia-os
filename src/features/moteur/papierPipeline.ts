/** Étapes visibles de la pipeline papier (master + FR). */

export const PAPIER_PIPELINE_ETAPES = [
  "topic",
  "script",
  "images",
  "clips",
  "voice",
  "render",
  "karaoke",
] as const;

export type PapierPipelineEtape = (typeof PAPIER_PIPELINE_ETAPES)[number];
export type PapierPipelineMode = "auto" | "manuel";
/** Étapes créatives : l'admin valide chacune en mode manuel. */
export type PapierPipelineHold = "topic" | "script" | "images" | null;
export type PapierPipelineEtat = "pending" | "active" | "hold" | "done" | "failed" | "stopped";
export type PapierPartieRegen = "topic" | "script" | "images";

export function normaliserPipelineMode(v: unknown): PapierPipelineMode {
  return v === "manuel" ? "manuel" : "auto";
}

export function normaliserPipelineHold(v: unknown): PapierPipelineHold {
  return v === "topic" || v === "script" || v === "images" ? v : null;
}

export function normaliserPartieRegen(v: unknown): PapierPartieRegen {
  if (v === "script" || v === "images" || v === "topic") return v;
  return "script";
}

export function etapeActivePipeline(opts: {
  statut: string;
  etape?: string | null;
  hold?: PapierPipelineHold;
  videoUrl?: string | null;
  langueStatut?: string | null;
}): PapierPipelineEtape {
  if (opts.videoUrl) return "karaoke";
  if (opts.hold === "topic") return "topic";
  if (opts.hold === "script") return "script";
  if (opts.hold === "images") return "images";
  const langue = opts.langueStatut ?? "";
  if (langue === "karaoke") return "karaoke";
  if (langue === "render" || langue === "mix") return "render";
  if (langue === "voice" || langue === "translating") return "voice";
  if (opts.statut === "clips") return "clips";
  if (opts.statut === "images") return "images";
  if (opts.statut === "scripting") {
    return opts.etape === "topic" ? "topic" : "script";
  }
  if (opts.statut === "queued") return "topic";
  if (opts.statut === "ready") return "karaoke";
  return "topic";
}

export function etatEtapePipeline(
  etape: PapierPipelineEtape,
  opts: {
    active: PapierPipelineEtape;
    statut: string;
    hold?: PapierPipelineHold;
  },
): PapierPipelineEtat {
  if (opts.statut === "stopped") {
    const i = PAPIER_PIPELINE_ETAPES.indexOf(etape);
    const a = PAPIER_PIPELINE_ETAPES.indexOf(opts.active);
    if (i < a) return "done";
    if (i === a) return "stopped";
    return "pending";
  }
  if (opts.statut === "failed") {
    const i = PAPIER_PIPELINE_ETAPES.indexOf(etape);
    const a = PAPIER_PIPELINE_ETAPES.indexOf(opts.active);
    if (i < a) return "done";
    if (i === a) return "failed";
    return "pending";
  }
  if (opts.statut === "ready") return "done";
  const i = PAPIER_PIPELINE_ETAPES.indexOf(etape);
  const a = PAPIER_PIPELINE_ETAPES.indexOf(opts.active);
  if (i < a) return "done";
  if (i > a) return "pending";
  if (opts.hold === etape) return "hold";
  return "active";
}

export function doitAttendreValidation(opts: {
  mode: PapierPipelineMode;
  hold: PapierPipelineHold;
}): boolean {
  return opts.mode === "manuel" && opts.hold != null;
}

/** Après validation d'un hold, l'étape suivante à produire. */
export function etapeApresValidation(hold: PapierPipelineHold): {
  statut: string;
  etape: string;
} {
  if (hold === "topic") return { statut: "scripting", etape: "script" };
  if (hold === "script") return { statut: "images", etape: "images" };
  if (hold === "images") return { statut: "clips", etape: "clips" };
  return { statut: "queued", etape: "topic" };
}
