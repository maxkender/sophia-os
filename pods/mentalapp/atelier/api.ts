// Constantes du pod 6 et appels à la fonction Edge `pods` de l'OS, avec le
// jeton du pod (POD_JETON). Le jeton ne s'écrit jamais dans un fichier : il
// vient de l'environnement.

import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const POD = "remakes_mentalapp";
/** Le compte refait : les tier lists « mentalmaxxing » de @mentalapp (appli Journey). */
export const COMPTE_SOURCE = "mentalapp";
/** Le style refait commence le 16/09 (décision du 17/10). */
export const DEPUIS = "2026-09-16";
/** D'abord les posts à 20 k vues ou plus, puis les autres (décision du 17/10). */
export const VUES_MIN_DEPART = 20_000;
export const LANGUE_SOURCE = "en";
/** Les langues d'UnSwipe (Pilotage → Applications), l'anglais d'abord. */
export const LANGUES = ["en", "fr", "de", "es", "it", "tr"] as const;
export type Langue = (typeof LANGUES)[number];

const URL_DEFAUT = "https://mbikecieskoobeizixig.supabase.co";

export async function appelPod<T = Record<string, unknown>>(corps: Record<string, unknown>): Promise<T & { ok: boolean; error?: string }> {
  const jeton = process.env.POD_JETON;
  if (!jeton) throw new Error("POD_JETON manquant");
  const r = await fetch(`${process.env.SUPABASE_URL ?? URL_DEFAUT}/functions/v1/pods`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pod-jeton": jeton },
    body: JSON.stringify({ pod: POD, ...corps }),
  });
  const json = (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as T & { ok: boolean; error?: string };
  if (!r.ok && json.ok !== false) return { ...json, ok: false, error: `HTTP ${r.status}` };
  return json;
}

// ---------------------------------------------------------------------------
// Manifeste des posts source (sources/manifeste.json, versionné)
// ---------------------------------------------------------------------------

export type StatutPost = "a_faire" | "transcrit" | "depose" | "exclu";

export type PostSource = {
  /** Id TikTok du post. */
  id: string;
  url: string;
  publie_le: string;
  vues: number;
  enregistrements: number;
  partages: number;
  commentaires: number;
  /** Nombre de slides du diaporama. */
  slides: number;
  legende: string;
  musique: { titre: string | null; url: string | null };
  statut: StatutPost;
  /** Pourquoi un post est exclu, ou id de la livraison une fois déposé. */
  motif?: string;
  releve_le: string;
};

export type Manifeste = { compte: string; maj_le: string; posts: PostSource[] };

export const CHEMIN_MANIFESTE = "sources/manifeste.json";

export function lireManifeste(): Manifeste {
  if (!existsSync(CHEMIN_MANIFESTE)) return { compte: COMPTE_SOURCE, maj_le: "", posts: [] };
  return JSON.parse(readFileSync(CHEMIN_MANIFESTE, "utf8")) as Manifeste;
}

export function ecrireManifeste(m: Manifeste) {
  m.posts.sort((a, b) => b.publie_le.localeCompare(a.publie_le));
  writeFileSync(CHEMIN_MANIFESTE, `${JSON.stringify(m, null, 1)}\n`);
}

/** Les posts à refaire, dans l'ordre : les plus vus d'abord. */
export function postsARefaire(m: Manifeste, vuesMin = VUES_MIN_DEPART): PostSource[] {
  return m.posts
    .filter((p) => p.publie_le.slice(0, 10) >= DEPUIS && p.slides >= 2 && p.statut !== "exclu" && p.vues >= vuesMin)
    .sort((a, b) => b.vues - a.vues);
}

export const k = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)} M` : v >= 1e3 ? `${Math.round(v / 1e3)} k` : String(v));
