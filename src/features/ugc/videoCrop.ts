/** Trim temporel — garder un segment [startSec, endSec] de la vidéo. */
export interface VideoTrim {
  startSec: number;
  endSec: number;
}

export function trimPlein(dureeSec: number): VideoTrim {
  const d = Math.max(0.1, dureeSec || 0.1);
  return { startSec: 0, endSec: d };
}

export function normaliserTrim(t: VideoTrim, dureeSec: number): VideoTrim {
  const d = Math.max(0.1, dureeSec || 0.1);
  let start = Math.min(Math.max(0, t.startSec), d - 0.05);
  let end = Math.min(Math.max(start + 0.05, t.endSec), d);
  if (end - start < 0.05) end = Math.min(d, start + 0.05);
  return { startSec: start, endSec: end };
}

/** Compat lecture anciens crops spatiaux / nouveaux trims. */
export function trimDepuisCrop(
  crop: unknown,
  dureeSec: number,
): VideoTrim {
  if (crop && typeof crop === "object") {
    const c = crop as Record<string, unknown>;
    if (typeof c.startSec === "number" && typeof c.endSec === "number") {
      return normaliserTrim(
        { startSec: c.startSec, endSec: c.endSec },
        dureeSec,
      );
    }
  }
  return trimPlein(dureeSec);
}

async function chargerVideo(videoUrl: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = videoUrl;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error("Impossible de charger la vidéo"));
  });
  return video;
}

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  video.currentTime = t;
  return new Promise<void>((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error("Seek échoué"));
  });
}

/**
 * 10ᵉ frame du segment gardé (relative au trim, pas à la source entière).
 */
export async function extraireFrameTrim(
  videoUrl: string,
  trim: VideoTrim,
  frameIndex = 10,
  fpsApprox = 30,
): Promise<Blob> {
  const video = await chargerVideo(videoUrl);
  const duree = video.duration || 1;
  const tNorm = normaliserTrim(trim, duree);
  const offset = (frameIndex - 1) / fpsApprox;
  const at = Math.min(tNorm.startSec + offset, tNorm.endSec - 0.02);
  await seek(video, Math.max(tNorm.startSec, at));

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 720;
  canvas.height = video.videoHeight || 1280;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob frame échoué"))),
      "image/jpeg",
      0.92,
    );
  });
  video.removeAttribute("src");
  video.load();
  return blob;
}

function choisirMimeRecorder(): string {
  const candidats = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const m of candidats) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) {
      return m;
    }
  }
  return "video/webm";
}

/**
 * Recode uniquement le segment [startSec, endSec] (durée), dimensions inchangées.
 */
export async function trimmerVideo(
  videoUrl: string,
  trim: VideoTrim,
  onProgress?: (detail: string) => void,
): Promise<{ blob: Blob; mime: string; ext: string }> {
  const video = await chargerVideo(videoUrl);
  const duree = video.duration || 1;
  const tNorm = normaliserTrim(trim, duree);

  const vw = video.videoWidth || 720;
  const vh = video.videoHeight || 1280;
  const canvas = document.createElement("canvas");
  canvas.width = vw;
  canvas.height = vh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");

  const fps = 30;
  const canvasStream = canvas.captureStream(fps);
  let combined: MediaStream = canvasStream;
  try {
    const media = (video as HTMLVideoElement & { captureStream?: () => MediaStream })
      .captureStream?.();
    const audioTracks = media?.getAudioTracks() ?? [];
    if (audioTracks.length > 0) {
      combined = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioTracks.map((track) => track.clone()),
      ]);
    }
  } catch {
    // pas d’audio
  }

  const mime = choisirMimeRecorder();
  const ext = mime.includes("mp4") ? "mp4" : "webm";
  const recorder = new MediaRecorder(combined, {
    mimeType: mime,
    videoBitsPerSecond: 4_000_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = () => reject(new Error("MediaRecorder erreur"));
  });

  onProgress?.(
    `Encodage trim ${tNorm.startSec.toFixed(1)}s → ${tNorm.endSec.toFixed(1)}s…`,
  );
  await seek(video, tNorm.startSec);

  recorder.start(200);
  await video.play();

  let raf = 0;
  const draw = () => {
    if (!video.paused && !video.ended && video.currentTime < tNorm.endSec) {
      ctx.drawImage(video, 0, 0, vw, vh);
      raf = requestAnimationFrame(draw);
    }
  };
  raf = requestAnimationFrame(draw);

  await new Promise<void>((resolve) => {
    const tick = () => {
      if (video.ended || video.currentTime >= tNorm.endSec - 0.02) {
        video.pause();
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });

  cancelAnimationFrame(raf);
  ctx.drawImage(video, 0, 0, vw, vh);
  recorder.stop();
  for (const track of combined.getTracks()) track.stop();

  const blob = await done;
  video.pause();
  video.removeAttribute("src");
  video.load();
  onProgress?.(
    `Trim prêt (${(tNorm.endSec - tNorm.startSec).toFixed(1)}s · ${Math.round(blob.size / 1024)} Ko)`,
  );
  return { blob, mime, ext };
}

/** @deprecated alias — trim durée */
export const cropperVideo = trimmerVideo;
export type CropRect = VideoTrim;
export const CROP_PLEIN = { startSec: 0, endSec: 1 } satisfies VideoTrim;
export const normaliserCrop = (c: VideoTrim, duree = 1) => normaliserTrim(c, duree);
export const extraireFrameCroppee = (
  url: string,
  crop: VideoTrim,
  frameIndex = 10,
) => extraireFrameTrim(url, crop, frameIndex);
