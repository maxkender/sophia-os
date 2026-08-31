/** Helpers purs — assignation de la vidéo papier aux comptes CM. */

import { protegerNomSophia } from "./papierScript";

export type CompteCmCible = {
  id: string;
  langue: string;
  type_compte?: string | null;
  is_active?: boolean | null;
};

export type LanguePapierPrete = {
  id: string;
  langue: string;
  statut?: string | null;
  video_url?: string | null;
};

export type PaireAssignationPapier = {
  compteId: string;
  langueId: string;
  langue: string;
};

export function estLanguePapierPrete(row: LanguePapierPrete): boolean {
  return row.statut === "ready" && Boolean(row.video_url);
}

/** Master FR assemblable : tous les clips Seedance sont là. */
export function masterClipsComplets(
  scenes: Array<{ clip_url?: string | null }>,
): boolean {
  return scenes.length > 0 && scenes.every((s) => Boolean(s.clip_url));
}

export type StatutMasterPapier = "queued" | "scripting" | "images" | "clips" | "ready";

/** Statut dérivé des assets. Ready = vidéo FR complète, pas seulement les clips. */
export function statutMasterDepuisAssets(
  master: { topic?: string | null; script?: unknown; video_url?: string | null },
  scenes: Array<{ image_url?: string | null; clip_url?: string | null }>,
): StatutMasterPapier {
  if (!String(master.topic ?? "").trim()) return "queued";
  if (!master.script || scenes.length === 0) return "scripting";
  if (scenes.some((s) => !s.image_url)) return "images";
  if (scenes.some((s) => !s.clip_url)) return "clips";
  if (master.video_url) return "ready";
  return "clips";
}

export type PostPapierConso = {
  master_id: string;
  langue: string;
  est_test?: boolean | null;
};

/** Un master est consommé dans une langue dès qu'un CM réel l'a reçu. */
export function masterUtiliseDansLangue(
  posts: PostPapierConso[],
  masterId: string,
  langue: string,
): boolean {
  return posts.some((p) => p.master_id === masterId && p.langue === langue && !p.est_test);
}

/** Masters FR prêts pas encore servis dans cette langue. */
export function mastersLibresPourLangue(
  masters: Array<{ id: string }>,
  posts: PostPapierConso[],
  langue: string,
): Array<{ id: string }> {
  const pris = new Set(
    posts.filter((p) => p.langue === langue && !p.est_test).map((p) => p.master_id),
  );
  return masters.filter((m) => !pris.has(m.id));
}

/**
 * Un master FR libre, au hasard, pour cette langue.
 * Un CM qui l'a déjà reçu dans cette langue ne le revoit pas.
 */
export function piocherMasterInutilise(
  masters: Array<{ id: string }>,
  posts: PostPapierConso[],
  langue: string,
  hasard: () => number = Math.random,
): string | null {
  const libres = mastersLibresPourLangue(masters, posts, langue);
  if (!libres.length) return null;
  const i = Math.min(libres.length - 1, Math.floor(hasard() * libres.length));
  return libres[i]!.id;
}

/** Légende TikTok : hook puis CTA, prêts à coller. */
export function captionDepuisLangue(row: {
  hook?: string | null;
  cta?: string | null;
}): string {
  return [row.hook, row.cta]
    .map((s) => protegerNomSophia(String(s ?? "").trim()))
    .filter(Boolean)
    .join("\n\n");
}

export function hashtagsDepuisLangue(raw: string | string[] | null | undefined): string {
  if (Array.isArray(raw)) {
    return raw
      .map((h) => String(h).trim())
      .filter(Boolean)
      .map((h) => (h.startsWith("#") ? h : `#${h}`))
      .join(" ");
  }
  return String(raw ?? "").trim();
}

export type PairesAssignationOpts = {
  /** Test admin : on accepte un CM inactif. */
  inclureInactifs?: boolean;
};

/**
 * Un CM actif reçoit la langue prête qui correspond.
 * Perso / inactifs / sans vidéo ready : ignorés (sauf test).
 */
export function pairesAssignationPapier(
  comptes: CompteCmCible[],
  langues: LanguePapierPrete[],
  opts: PairesAssignationOpts = {},
): PaireAssignationPapier[] {
  const parLangue = new Map<string, LanguePapierPrete>();
  for (const langue of langues) {
    if (!estLanguePapierPrete(langue)) continue;
    parLangue.set(langue.langue, langue);
  }

  const out: PaireAssignationPapier[] = [];
  for (const compte of comptes) {
    if (compte.type_compte != null && compte.type_compte !== "cm") continue;
    if (compte.is_active === false && !opts.inclureInactifs) continue;
    const langue = parLangue.get(compte.langue);
    if (!langue) continue;
    out.push({ compteId: compte.id, langueId: langue.id, langue: compte.langue });
  }
  return out;
}

export function datesFenetreParis(aujourdhui: string, fenetreJours: number): string[] {
  const n = Math.max(1, Math.round(fenetreJours));
  const out: string[] = [];
  const [y, m, d] = aujourdhui.split("-").map(Number);
  const base = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  for (let i = 0; i < n; i++) {
    const cur = new Date(base);
    cur.setUTCDate(base.getUTCDate() - i);
    out.push(cur.toISOString().slice(0, 10));
  }
  return out;
}
