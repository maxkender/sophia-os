/** File du jour : posts marqués publiés (jour Paris). */

import { idTiktokDepuisUrl } from "./tiktokEmbed";

/** Jour calendaire Paris d'un timestamptz ISO (ou null). */
export function jourParisDepuisIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d);
}

/** Ajoute des jours à une date calendaire YYYY-MM-DD (sans fuseau). */
export function ajouterJourCalendaire(yyyyMmDd: string, delta: number): string {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Instant UTC du minuit Paris pour un jour calendaire.
 * L'offset est lu à midi UTC de ce jour (hors bascule DST 2h du matin).
 */
export function isoDebutJourParis(yyyyMmDd: string): string {
  const noonUtc = new Date(`${yyyyMmDd}T12:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(noonUtc);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const offsetMin = hour * 60 + minute - 12 * 60;
  return new Date(Date.parse(`${yyyyMmDd}T00:00:00.000Z`) - offsetMin * 60_000).toISOString();
}

/** [debut, fin) du jour Paris — `fin` = minuit du lendemain (gère 23h/25h DST). */
export function isoBornesJourParis(yyyyMmDd: string): { debut: string; fin: string } {
  return {
    debut: isoDebutJourParis(yyyyMmDd),
    fin: isoDebutJourParis(ajouterJourCalendaire(yyyyMmDd, 1)),
  };
}

export function estCompteSlideshowAssigne(compte: {
  type_compte?: string | null;
  ugc_ai_video?: boolean | null;
}): boolean {
  if (compte.type_compte === "cm") return false;
  if (compte.ugc_ai_video) return false;
  return true;
}

/** Ajoute le corps d'une remarque générique au brouillon (saut de ligne si déjà du texte). */
export function insererRemarqueDansBrouillon(actuel: string, corps: string): string {
  const ajout = corps.trim();
  if (!ajout) return actuel;
  const base = actuel.trim();
  return base ? `${base}\n\n${ajout}` : ajout;
}

/** Vidéo d'explication jointe à une review (copie figée à l'envoi). */
export type ReviewVideo = { url: string; titre: string };

/** Ajoute une vidéo à la liste envoyée au créateur (ordre d'insertion, sans doublon). */
export function ajouterVideoReview(
  actuelles: ReviewVideo[],
  video: { url: string | null | undefined; titre: string },
): ReviewVideo[] {
  const url = video.url?.trim() ?? "";
  if (!url) return actuelles;
  if (actuelles.some((v) => v.url === url)) return actuelles;
  return [...actuelles, { url, titre: video.titre.trim() }];
}

export function retirerVideoReview(actuelles: ReviewVideo[], url: string): ReviewVideo[] {
  return actuelles.filter((v) => v.url !== url);
}

/** Remarque générique utilisée pour une review (copie figée à l'envoi). */
export type ReviewRemarqueUtilisee = { id: string; titre: string };

/** Marque une remarque comme utilisée pour la review en cours (sans doublon :
 *  une même remarque ne compte qu'une fois par review). */
export function ajouterRemarqueUtilisee(
  actuelles: ReviewRemarqueUtilisee[],
  remarque: { id: string; titre: string },
): ReviewRemarqueUtilisee[] {
  const id = remarque.id.trim();
  if (!id || actuelles.some((r) => r.id === id)) return actuelles;
  return [...actuelles, { id, titre: remarque.titre.trim() }];
}

export function retirerRemarqueUtilisee(
  actuelles: ReviewRemarqueUtilisee[],
  id: string,
): ReviewRemarqueUtilisee[] {
  return actuelles.filter((r) => r.id !== id);
}

/** Lit le jsonb `reviews.remarques` (ou une valeur inattendue) en liste propre. */
export function normaliserRemarquesReview(raw: unknown): ReviewRemarqueUtilisee[] {
  if (!Array.isArray(raw)) return [];
  const out: ReviewRemarqueUtilisee[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const id =
      typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id.trim() : "";
    if (!id || out.some((r) => r.id === id)) continue;
    const titre =
      typeof (item as { titre?: unknown }).titre === "string"
        ? (item as { titre: string }).titre.trim()
        : "";
    out.push({ id, titre });
  }
  return out;
}

/** « 3× Texte illisible » : une remarque et le nombre de reviews qui la portent. */
export type CompteRemarque = { id: string; titre: string; n: number };

/** Lit le jsonb `reviews.videos` (ou une valeur inattendue) en liste propre. */
export function normaliserVideosReview(raw: unknown): ReviewVideo[] {
  if (!Array.isArray(raw)) return [];
  const out: ReviewVideo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const url =
      typeof (item as { url?: unknown }).url === "string"
        ? (item as { url: string }).url.trim()
        : "";
    if (!url || out.some((v) => v.url === url)) continue;
    const titre =
      typeof (item as { titre?: unknown }).titre === "string"
        ? (item as { titre: string }).titre.trim()
        : "";
    out.push({ url, titre });
  }
  return out;
}

/** Clé d'un lien de post : l'ID TikTok quand on l'a (lien complet ou lien court résolu), sinon le lien nettoyé. */
export function cleLienPost(url: string | null | undefined, idResolu?: string | null): string | null {
  const id = idResolu ?? idTiktokDepuisUrl(url);
  if (id) return `id:${id}`;
  const brut = (url ?? "").trim();
  if (!brut) return null;
  return brut.toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
}

/** Pour chaque post, les liens des AUTRES posts du même compte (le même jour, reviewés compris). */
export function liensDesAutresPosts(
  posts: Array<{ id: string; compte_id: string; publie_url: string | null }>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of posts) {
    out.set(
      p.id,
      posts
        .filter((q) => q.id !== p.id && q.compte_id === p.compte_id && q.publie_url)
        .map((q) => q.publie_url as string),
    );
  }
  return out;
}

/**
 * Combien d'autres posts mènent au même TikTok : le créateur a collé le même
 * post pour plusieurs slideshows (asya.ogrenir761 et mia.thrives282 le 15/10,
 * un lien complet puis le même en lien court « Partager »).
 */
export function compterMemeTiktok(
  courant: { lien: string | null; id: string | null },
  autres: Array<{ lien: string | null; id: string | null }>,
): number {
  const cle = cleLienPost(courant.lien, courant.id);
  if (!cle) return 0;
  return autres.filter((a) => cleLienPost(a.lien, a.id) === cle).length;
}
