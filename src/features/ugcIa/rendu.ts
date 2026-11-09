// UGC IA : le rendu vidéo dans le navigateur (0665). Les vidéos sont lues et
// dessinées image par image sur un canevas 9:16, éventuellement accélérées,
// avec un calque par-dessus (le bandeau), et le canevas est enregistré
// (MediaRecorder). La vidéo produite est muette et ne garde rien des fichiers
// d'origine (ni C2PA ni balises d'outils IA) : seulement des pixels. La
// fonction `ugc-ia` la réencode ensuite en MP4 H.264.
//
// Le rendu dure le temps de la vidéo produite : l'onglet doit rester visible
// (un onglet masqué n'est plus dessiné).

import type { DemoUgcIa, GenerationUgcIa } from "./api";

/** La taille des vidéos rendues (9:16), celle que réencode la fonction. */
export const RENDU_LARGEUR = 720;
export const RENDU_HAUTEUR = 1280;
/** Vitesses proposées pour une démo (mêmes que la fonction). */
export const VITESSES_DEMO = [1, 1.25, 1.5, 2] as const;
export const PASSAGES_MAX = 20;

export interface Passage {
  debut: number;
  fin: number;
}

/** Un morceau de vidéo à rendre : de `debut` à `fin` (null : jusqu'au bout), à cette vitesse. */
export interface SegmentRendu {
  url: string;
  debut: number;
  fin: number | null;
  vitesse: number;
}

/** Placer une image dans le cadre sans la déformer (bandes noires si besoin). */
export function placerContain(sw: number, sh: number, dw: number, dh: number): { x: number; y: number; w: number; h: number } {
  if (!(sw > 0 && sh > 0)) return { x: 0, y: 0, w: dw, h: dh };
  const s = Math.min(dw / sw, dh / sh);
  const w = sw * s;
  const h = sh * s;
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h };
}

/** Durée des passages gardés, à la vitesse choisie (au dixième). */
export function dureePassages(passages: readonly Passage[], vitesse: number): number {
  return Math.round((passages.reduce((s, p) => s + Math.max(0, p.fin - p.debut), 0) / vitesse) * 10) / 10;
}

/** Ce qui ne va pas dans les passages (clé i18n), ou null. Mêmes règles que la fonction. */
export function erreurPassages(passages: readonly Passage[], duree: number | null): string | null {
  if (passages.length === 0) return "aucun";
  if (passages.length > PASSAGES_MAX) return "trop";
  for (const p of passages) {
    if (!Number.isFinite(p.debut) || !Number.isFinite(p.fin) || p.debut < 0) return "invalide";
    if (p.fin - p.debut < 0.2) return "ordre";
    if (duree != null && p.fin > duree + 0.05) return "auDela";
  }
  return null;
}

/** Un nouveau passage à partir du temps de lecture : 3 s, sans dépasser la vidéo. */
export function nouveauPassage(temps: number, duree: number | null): Passage {
  const r = (x: number) => Math.round(x * 10) / 10;
  let debut = r(Math.max(0, temps));
  const fin = duree != null ? r(Math.min(duree, debut + 3)) : r(debut + 3);
  if (fin - debut < 0.2) debut = r(Math.max(0, fin - 3));
  return { debut, fin };
}

/** Déplace le passage `de` à la place `vers` (glisser-déposer). */
export function deplacerVers<T>(liste: readonly T[], de: number, vers: number): T[] {
  if (de === vers || de < 0 || vers < 0 || de >= liste.length || vers >= liste.length) return [...liste];
  const copie = [...liste];
  const [x] = copie.splice(de, 1);
  copie.splice(vers, 0, x);
  return copie;
}

/** Le format d'enregistrement : MP4 (H.264) si le navigateur sait, sinon WebM. */
export function choisirFormat(estSupporte: (mime: string) => boolean): string | null {
  const candidats = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidats.find((m) => estSupporte(m)) ?? null;
}

export function extensionDe(mime: string): "mp4" | "webm" {
  return mime.startsWith("video/mp4") ? "mp4" : "webm";
}

/** Durée totale des segments une fois rendus (les fins inconnues prises dans `durees`). */
export function dureeSegments(segments: readonly SegmentRendu[], durees: ReadonlyMap<string, number>): number {
  return segments.reduce((s, seg) => {
    const fin = seg.fin ?? durees.get(seg.url) ?? seg.debut;
    return s + Math.max(0, fin - seg.debut) / seg.vitesse;
  }, 0);
}

function attendre(video: HTMLVideoElement, evenement: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ok = () => {
      nettoyer();
      resolve();
    };
    const ko = () => {
      nettoyer();
      reject(new Error(`Vidéo illisible : ${video.currentSrc || video.src}`));
    };
    const nettoyer = () => {
      video.removeEventListener(evenement, ok);
      video.removeEventListener("error", ko);
    };
    video.addEventListener(evenement, ok, { once: true });
    video.addEventListener("error", ko, { once: true });
  });
}

async function chargerVideo(url: string): Promise<HTMLVideoElement> {
  const v = document.createElement("video");
  // Sans CORS, le canevas serait « sali » et ne pourrait pas être enregistré.
  v.crossOrigin = "anonymous";
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  const pret = attendre(v, "loadedmetadata");
  v.src = url;
  await pret;
  return v;
}

async function chercher(v: HTMLVideoElement, temps: number): Promise<void> {
  if (Math.abs(v.currentTime - temps) < 0.01 && v.readyState >= 2) return;
  const fait = attendre(v, "seeked");
  v.currentTime = temps;
  await fait;
}

export interface OptionsRendu {
  segments: SegmentRendu[];
  /** Posé par-dessus toute la vidéo (le bandeau), à la taille du rendu. */
  calque?: CanvasImageSource | null;
  largeur?: number;
  hauteur?: number;
  onProgres?: (fraction: number) => void;
}

/**
 * Rend les segments bout à bout, muets, sur un canevas 9:16, avec le calque
 * par-dessus, et rend la vidéo enregistrée. Dure le temps de la vidéo.
 */
export async function rendreVideo(o: OptionsRendu): Promise<{ blob: Blob; mime: string }> {
  const largeur = o.largeur ?? RENDU_LARGEUR;
  const hauteur = o.hauteur ?? RENDU_HAUTEUR;
  if (typeof MediaRecorder === "undefined") throw new Error("Ce navigateur ne sait pas enregistrer de vidéo (essaie Chrome).");
  const mime = choisirFormat((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error("Ce navigateur ne sait pas enregistrer de vidéo (essaie Chrome).");

  const lecteurs = new Map<string, HTMLVideoElement>();
  for (const seg of o.segments) if (!lecteurs.has(seg.url)) lecteurs.set(seg.url, await chargerVideo(seg.url));
  const durees = new Map([...lecteurs].map(([url, v]) => [url, v.duration]));
  const total = Math.max(0.1, dureeSegments(o.segments, durees));

  const canevas = document.createElement("canvas");
  canevas.width = largeur;
  canevas.height = hauteur;
  const ctx = canevas.getContext("2d");
  if (!ctx) throw new Error("Ce navigateur ne sait pas dessiner la vidéo");
  const dessiner = (v: HTMLVideoElement) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, largeur, hauteur);
    const p = placerContain(v.videoWidth, v.videoHeight, largeur, hauteur);
    ctx.drawImage(v, p.x, p.y, p.w, p.h);
    if (o.calque) ctx.drawImage(o.calque, 0, 0, largeur, hauteur);
  };

  const flux = canevas.captureStream(30);
  const enregistreur = new MediaRecorder(flux, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const morceaux: Blob[] = [];
  enregistreur.ondataavailable = (e) => {
    if (e.data.size > 0) morceaux.push(e.data);
  };
  const arrete = new Promise<void>((resolve) => {
    enregistreur.onstop = () => resolve();
  });

  let fait = 0;
  let masque = false;
  const surVisibilite = () => {
    if (document.visibilityState === "hidden") masque = true;
  };
  document.addEventListener("visibilitychange", surVisibilite);
  try {
    dessiner(lecteurs.get(o.segments[0].url)!);
    enregistreur.start(250);
    enregistreur.pause();
    for (const seg of o.segments) {
      const v = lecteurs.get(seg.url)!;
      const fin = Math.min(seg.fin ?? v.duration, v.duration);
      await chercher(v, seg.debut);
      v.playbackRate = seg.vitesse;
      dessiner(v);
      enregistreur.resume();
      await v.play();
      await new Promise<void>((resolve, reject) => {
        const image = () => {
          if (masque) {
            v.pause();
            reject(new Error("Rendu interrompu : garde l'onglet visible pendant le rendu."));
            return;
          }
          dessiner(v);
          o.onProgres?.(Math.min(1, (fait + Math.max(0, v.currentTime - seg.debut) / seg.vitesse) / total));
          if (v.currentTime >= fin - 0.02 || v.ended) {
            v.pause();
            resolve();
            return;
          }
          requestAnimationFrame(image);
        };
        requestAnimationFrame(image);
      });
      enregistreur.pause();
      fait += Math.max(0, fin - seg.debut) / seg.vitesse;
    }
    enregistreur.resume();
    enregistreur.stop();
    await arrete;
  } finally {
    document.removeEventListener("visibilitychange", surVisibilite);
    for (const v of lecteurs.values()) {
      v.pause();
      v.removeAttribute("src");
      v.load();
    }
    flux.getTracks().forEach((t) => t.stop());
  }
  o.onProgres?.(1);
  return { blob: new Blob(morceaux, { type: mime.split(";")[0] }), mime };
}

/** Charge une image (le bandeau en data URL) pour la poser en calque. */
export function chargerImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bandeau illisible"));
    img.src = src;
  });
}

/** La durée d'un fichier vidéo choisi sur l'ordinateur (null si illisible). */
export function dureeFichier(fichier: File): Promise<number | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(fichier);
    const fin = (d: number | null) => {
      URL.revokeObjectURL(url);
      resolve(d);
    };
    v.preload = "metadata";
    v.onloadedmetadata = () => fin(Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null);
    v.onerror = () => fin(null);
    v.src = url;
  });
}

/** Les morceaux de la démo à coller : la démo montée, sinon ses passages, sinon toute la vidéo brute. */
export function segmentsDemo(d: DemoUgcIa): SegmentRendu[] {
  if (d.video_url) return [{ url: d.video_url, debut: 0, fin: null, vitesse: 1 }];
  if (d.passages.length > 0) return d.passages.map((p) => ({ url: d.brut_url, debut: p.debut, fin: p.fin, vitesse: d.vitesse || 1 }));
  return [{ url: d.brut_url, debut: 0, fin: null, vitesse: 1 }];
}

/** La réaction sans bandeau : l'original de Genjutsu, recadré comme dans son montage. */
export function segmentReaction(g: GenerationUgcIa): SegmentRendu {
  return { url: g.video_brute_url ?? g.video_url ?? "", debut: g.montage_debut_s ?? 0, fin: g.montage_fin_s ?? null, vitesse: 1 };
}
