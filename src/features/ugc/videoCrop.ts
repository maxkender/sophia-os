/** Crop normalisé (0–1) relatif à la vidéo source. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CROP_PLEIN: CropRect = { x: 0, y: 0, w: 1, h: 1 };

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function normaliserCrop(c: CropRect): CropRect {
  const x = clamp01(c.x);
  const y = clamp01(c.y);
  const w = Math.max(0.05, Math.min(1 - x, c.w));
  const h = Math.max(0.05, Math.min(1 - y, c.h));
  return { x, y, w, h };
}

/** Extrait la Nᵉ frame (1-based, défaut 10) en JPEG. */
export async function extraireFrame(
  videoUrl: string,
  frameIndex = 10,
  fpsApprox = 30,
): Promise<Blob> {
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

  const t = Math.min(
    Math.max(0, (frameIndex - 1) / fpsApprox),
    Math.max(0, (video.duration || 1) - 0.05),
  );
  video.currentTime = t;
  await new Promise<void>((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error("Seek frame échoué"));
  });

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

/** Extrait la 10ᵉ frame déjà cropée (même crop que la vidéo finale). */
export async function extraireFrameCroppee(
  videoUrl: string,
  crop: CropRect,
  frameIndex = 10,
  fpsApprox = 30,
): Promise<Blob> {
  const c = normaliserCrop(crop);
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

  const vw = video.videoWidth || 720;
  const vh = video.videoHeight || 1280;
  const sx = Math.round(c.x * vw);
  const sy = Math.round(c.y * vh);
  const sw = Math.max(2, Math.round(c.w * vw));
  const sh = Math.max(2, Math.round(c.h * vh));

  const t = Math.min(
    Math.max(0, (frameIndex - 1) / fpsApprox),
    Math.max(0, (video.duration || 1) - 0.05),
  );
  video.currentTime = t;
  await new Promise<void>((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error("Seek frame échoué"));
  });

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

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
 * Recode la vidéo en ne gardant que la zone crop (canvas + MediaRecorder).
 * Sortie webm/mp4 selon le navigateur.
 */
export async function cropperVideo(
  videoUrl: string,
  crop: CropRect,
  onProgress?: (detail: string) => void,
): Promise<{ blob: Blob; mime: string; ext: string }> {
  const c = normaliserCrop(crop);
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

  const vw = video.videoWidth || 720;
  const vh = video.videoHeight || 1280;
  const sx = Math.round(c.x * vw);
  const sy = Math.round(c.y * vh);
  const sw = Math.max(2, Math.round(c.w * vw));
  const sh = Math.max(2, Math.round(c.h * vh));

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
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
        ...audioTracks.map((t) => t.clone()),
      ]);
    }
  } catch {
    // pas d’audio — ok
  }

  const mime = choisirMimeRecorder();
  const ext = mime.includes("mp4") ? "mp4" : "webm";
  const recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = () => reject(new Error("MediaRecorder erreur"));
  });

  onProgress?.("Encodage du crop…");
  video.currentTime = 0;
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });

  recorder.start(200);
  await video.play();

  let raf = 0;
  const draw = () => {
    if (!video.paused && !video.ended) {
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
      raf = requestAnimationFrame(draw);
    }
  };
  raf = requestAnimationFrame(draw);

  await new Promise<void>((resolve) => {
    video.onended = () => resolve();
  });
  cancelAnimationFrame(raf);
  // dernière frame
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

  recorder.stop();
  for (const t of combined.getTracks()) t.stop();

  const blob = await done;
  video.pause();
  video.removeAttribute("src");
  video.load();
  onProgress?.(`Crop prêt (${Math.round(blob.size / 1024)} Ko)`);
  return { blob, mime, ext };
}
