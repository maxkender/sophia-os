/** Contrôle des screen recordings collés sur les remarques génériques. */

export const TAILLE_MAX_VIDEO_REMARQUE = 30 * 1024 * 1024;
export const DUREE_MAX_VIDEO_REMARQUE_S = 20;

export type ErreurVideoRemarque = "type" | "taille" | "duree";

const EXT_OK = /\.(mp4|webm|mov|m4v)$/i;

export function extensionVideo(file: { name: string; type: string }): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && ["mp4", "webm", "mov", "m4v"].includes(fromName)) return fromName;
  if (file.type.includes("webm")) return "webm";
  if (file.type.includes("quicktime")) return "mov";
  return "mp4";
}

export function controlerFichierVideo(file: File): Exclude<ErreurVideoRemarque, "duree"> | null {
  if (!file.type.startsWith("video/") && !EXT_OK.test(file.name)) return "type";
  if (file.size > TAILLE_MAX_VIDEO_REMARQUE) return "taille";
  return null;
}

export function lireDureeVideo(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const d = el.duration;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("metadata"));
    };
    el.src = url;
  });
}

export async function controlerVideoRemarque(file: File): Promise<ErreurVideoRemarque | null> {
  const base = controlerFichierVideo(file);
  if (base) return base;
  try {
    const duree = await lireDureeVideo(file);
    if (Number.isFinite(duree) && duree > DUREE_MAX_VIDEO_REMARQUE_S) return "duree";
  } catch {
    // Type + taille suffisent si le navigateur ne lit pas la durée.
  }
  return null;
}

export function premierFichierVideo(files: FileList | null | undefined): File | null {
  if (!files?.length) return null;
  return Array.from(files).find((f) => f.type.startsWith("video/") || EXT_OK.test(f.name)) ?? null;
}
