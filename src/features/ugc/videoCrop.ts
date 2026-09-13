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

/** Seuils identiques à `estTrimPlein` dans ugc-reactions (copie MP4 sans Fal). */
export function estTrimPlein(
  startSec: number,
  endSec: number,
  dureeSec: number | null,
): boolean {
  if (dureeSec == null || !(dureeSec > 0.1)) return false;
  return startSec <= 0.05 && endSec >= dureeSec - 0.08;
}

/** Source temporaire import — pas encore cropée. */
export function estCheminTmpFull(path: string | null | undefined): boolean {
  return /_tmp_full\.mp4$/i.test(String(path ?? "").trim());
}

export function cheminVideoCroppee(reactionId: string, ext = "mp4"): string {
  return `ugc/reactions/${reactionId}/video.${ext}`;
}

/** Args ffmpeg.wasm fallback : recode H.264 @ 30 fps (jamais `-c copy` — sinon écran noir hors keyframe). */
export function argsFfmpegTrimH264(
  startSec: number,
  endSec: number,
  withAudio: boolean,
): string[] {
  const duree = Math.max(0.05, endSec - startSec);
  return [
    "-ss",
    startSec.toFixed(3),
    "-i",
    "in.mp4",
    "-t",
    duree.toFixed(3),
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    ...(withAudio ? (["-c:a", "aac", "-ac", "2", "-b:a", "128k"] as const) : (["-an"] as const)),
    "-movflags",
    "+faststart",
    "out.mp4",
  ];
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
export function extraireOffsetFrame(frameIndex = 10, fpsApprox = 30): number {
  return (frameIndex - 1) / fpsApprox;
}

export async function extraireFrameTrim(
  videoUrl: string,
  trim: VideoTrim,
  frameIndex = 10,
  fpsApprox = 30,
): Promise<Blob> {
  const video = await chargerVideo(videoUrl);
  const duree = video.duration || 1;
  const tNorm = normaliserTrim(trim, duree);
  const offset = extraireOffsetFrame(frameIndex, fpsApprox);
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
 * Recode le segment en jouant la vidéo (captureStream, pas canvas).
 * Fallback si ffmpeg.wasm échoue.
 */
export async function trimmerVideoPlayback(
  videoUrl: string,
  trim: VideoTrim,
  onProgress?: (detail: string) => void,
): Promise<{ blob: Blob; mime: string; ext: string }> {
  const video = await chargerVideo(videoUrl);
  const duree = video.duration || 1;
  const tNorm = normaliserTrim(trim, duree);
  const capture = (
    video as HTMLVideoElement & { captureStream?: () => MediaStream }
  ).captureStream;
  if (typeof capture !== "function") {
    video.removeAttribute("src");
    video.load();
    return trimmerVideo(videoUrl, tNorm, onProgress);
  }

  const stream = capture.call(video);
  if (stream.getVideoTracks().length === 0) {
    for (const t of stream.getTracks()) t.stop();
    video.removeAttribute("src");
    video.load();
    return trimmerVideo(videoUrl, tNorm, onProgress);
  }

  const mime = choisirMimeRecorder();
  const ext = mime.includes("mp4") ? "mp4" : "webm";
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 8_000_000,
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
    `Enregistrement ${tNorm.startSec.toFixed(1)}s → ${tNorm.endSec.toFixed(1)}s…`,
  );
  await seek(video, tNorm.startSec);
  recorder.start(200);
  await video.play();
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (video.ended || video.currentTime >= tNorm.endSec) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  video.pause();
  if (recorder.state !== "inactive") recorder.stop();
  const blob = await done;
  for (const track of stream.getTracks()) track.stop();
  video.removeAttribute("src");
  video.load();
  if (blob.size < 1000) throw new Error("Trim playback : fichier trop petit");
  onProgress?.(
    `Trim prêt (${(tNorm.endSec - tNorm.startSec).toFixed(1)}s · ${Math.round(blob.size / 1024)} Ko)`,
  );
  return { blob, mime, ext };
}

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

type FfmpegInstance = {
  loaded: boolean;
  load: (opts: { coreURL: string; wasmURL: string }) => Promise<boolean>;
  writeFile: (name: string, data: Uint8Array) => Promise<boolean>;
  exec: (args: string[]) => Promise<number>;
  readFile: (name: string) => Promise<Uint8Array | string>;
  deleteFile: (name: string) => Promise<boolean>;
};

let ffmpegSingleton: FfmpegInstance | null = null;

async function chargerFfmpeg(
  onProgress?: (detail: string) => void,
): Promise<FfmpegInstance> {
  if (ffmpegSingleton?.loaded) return ffmpegSingleton;
  onProgress?.("Chargement du coupeur (une fois, ~30 Mo)…");
  const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
    import("@ffmpeg/ffmpeg"),
    import("@ffmpeg/util"),
  ]);
  const ffmpeg = new FFmpeg() as unknown as FfmpegInstance;
  const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpegSingleton = ffmpeg;
  return ffmpeg;
}

function octetsVersBlob(data: Uint8Array | string, mime: string): Blob {
  if (typeof data === "string") {
    return new Blob([data], { type: mime });
  }
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return new Blob([copy], { type: mime });
}

/**
 * Fallback navigateur (plus utilisé par l’admin) : recode H.264 @ 30 fps.
 * Le trim production passe par Fal lossless (`ugc-reactions`) pour garder le FPS source.
 */
export async function trimmerVideoLossless(
  videoUrl: string,
  trim: VideoTrim,
  dureeSec: number,
  onProgress?: (detail: string) => void,
): Promise<{ blob: Blob; mime: string; ext: string }> {
  const tNorm = normaliserTrim(trim, dureeSec);
  try {
    const { fetchFile } = await import("@ffmpeg/util");
    const ffmpeg = await chargerFfmpeg(onProgress);
    onProgress?.(
      `Trim H.264 ${tNorm.startSec.toFixed(1)}s → ${tNorm.endSec.toFixed(1)}s…`,
    );
    const input = await fetchFile(videoUrl);
    await ffmpeg.writeFile("in.mp4", input);
    try {
      const lancer = async (withAudio: boolean) => {
        const code = await ffmpeg.exec(
          argsFfmpegTrimH264(tNorm.startSec, tNorm.endSec, withAudio),
        );
        if (typeof code === "number" && code !== 0) {
          throw new Error(`ffmpeg trim code=${code}`);
        }
      };
      try {
        await lancer(true);
      } catch {
        await lancer(false);
      }
      const data = await ffmpeg.readFile("out.mp4");
      const blob = octetsVersBlob(data, "video/mp4");
      if (blob.size < 1000) {
        throw new Error("Trim H.264 : fichier trop petit");
      }
      onProgress?.(
        `Trim prêt (${(tNorm.endSec - tNorm.startSec).toFixed(1)}s · ${Math.round(blob.size / 1024)} Ko)`,
      );
      return { blob, mime: "video/mp4", ext: "mp4" };
    } finally {
      try {
        await ffmpeg.deleteFile("in.mp4");
      } catch {
        // ignore
      }
      try {
        await ffmpeg.deleteFile("out.mp4");
      } catch {
        // ignore
      }
    }
  } catch (e) {
    onProgress?.(
      `ffmpeg indisponible (${e instanceof Error ? e.message : "erreur"}) — fallback lecture…`,
    );
    return trimmerVideoPlayback(videoUrl, tNorm, onProgress);
  }
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
