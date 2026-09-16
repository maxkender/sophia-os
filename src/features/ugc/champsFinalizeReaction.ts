import type { VideoTrim } from "./videoCrop";

/** Corps `finalize` — crop + `_tmp_full` : l’edge coupe via Fal (jamais un recode client). */
export function champsFinalizeReaction(input: {
  id: string;
  titre?: string;
  crop: VideoTrim;
  videoSourcePath: string | null | undefined;
  videoSourceUrl: string | null | undefined;
  firstFramePath: string;
  firstFrameUrl: string;
  videoText?: string;
  dureeMs?: number;
  labelId: string;
}): Record<string, unknown> {
  const startSec = Number(input.crop.startSec);
  const endSec = Number(input.crop.endSec);
  const videoPath = String(input.videoSourcePath ?? "").trim();
  const videoUrl = String(input.videoSourceUrl ?? "").trim();
  return {
    id: input.id,
    titre: input.titre,
    crop: { startSec, endSec },
    ...(videoPath ? { videoPath } : {}),
    ...(videoUrl ? { videoUrl } : {}),
    firstFramePath: input.firstFramePath,
    firstFrameUrl: input.firstFrameUrl,
    ...(input.videoText !== undefined ? { videoText: input.videoText } : {}),
    ...(input.dureeMs != null ? { dureeMs: input.dureeMs } : {}),
    labelId: input.labelId,
  };
}
