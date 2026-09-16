/**
 * Source du trim reaction.
 *
 * Jamais un recode navigateur (ffmpeg.wasm / canvas ~15 fps) si on a
 * crop + URL de l’original `_tmp_full` — Fal fait un stream copy lossless.
 */
export type PlanTrimReaction = "fal_source" | "client_legacy" | "impossible";

export function planTrimReaction(input: {
  crop: unknown;
  sourceUrl: string;
  videoPathClient: string;
  videoUrlClient: string;
}): PlanTrimReaction {
  const aCrop = Boolean(input.crop);
  const aSource = Boolean(String(input.sourceUrl ?? "").trim());
  if (aCrop && aSource) return "fal_source";
  const path = String(input.videoPathClient ?? "").trim();
  const url = String(input.videoUrlClient ?? "").trim();
  if (path && url) return "client_legacy";
  return "impossible";
}
