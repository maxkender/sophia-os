// Appels à l'OS avec le jeton du pod (POD_JETON) : la fonction `pods` (file de
// validation, comptes, personas, envoi de fichiers) et `pod-labo` (Kling).
// Le jeton ne s'écrit jamais dans un fichier : il vient de l'environnement.
import { readFileSync } from "node:fs";

export const POD = "reactions_ugc";
const URL_DEFAUT = "https://mbikecieskoobeizixig.supabase.co";
const base = () => process.env.SUPABASE_URL ?? URL_DEFAUT;

async function appel<T>(fonction: string, corps: Record<string, unknown>): Promise<T & { ok: boolean; error?: string }> {
  const jeton = process.env.POD_JETON;
  if (!jeton) throw new Error("POD_JETON manquant");
  const r = await fetch(`${base()}/functions/v1/${fonction}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pod-jeton": jeton },
    body: JSON.stringify(corps),
  });
  const json = (await r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }))) as T & { ok: boolean; error?: string };
  if (!r.ok && json.ok !== false) return { ...json, ok: false, error: `HTTP ${r.status}` };
  return json;
}

export const appelPod = <T = Record<string, unknown>>(corps: Record<string, unknown>) => appel<T>("pods", { pod: POD, ...corps });
export const appelLabo = <T = Record<string, unknown>>(corps: Record<string, unknown>) => appel<T>("pod-labo", corps);

/**
 * Envoie un fichier local vers medias/pods/reactions_ugc/<chemin> (URL signée
 * donnée par l'OS) et renvoie son URL publique. Chemins permis :
 * personas/<compte>.jpg|png · reactions/<source>/<compte>.mp4 ·
 * sources/<source>/reaction.mp4 · sources/<source>/<compte>.jpg|png
 */
export async function envoyer(chemin: string, fichier: string): Promise<{ chemin: string; url: string }> {
  const u = await appelPod<{ chemin: string; upload_url: string; url: string }>({ action: "upload_url", chemin });
  if (!u.ok) throw new Error(`upload_url ${chemin} : ${u.error}`);
  const type = fichier.endsWith(".mp4") ? "video/mp4" : fichier.endsWith(".png") ? "image/png" : "image/jpeg";
  const r = await fetch(u.upload_url, {
    method: "PUT",
    headers: { "content-type": type, "x-upsert": "true" },
    body: readFileSync(fichier),
  });
  if (!r.ok) throw new Error(`envoi ${chemin} : HTTP ${r.status} ${await r.text()}`);
  return { chemin: u.chemin, url: u.url };
}

export type Compte = {
  id: string;
  langue: string;
  persona_nom: string | null;
  handle_tiktok: string | null;
  persona: { statut: string; image_url: string; description: string } | null;
};

/** Une livraison en préparation : livraisons/<source_id>.json. */
export type Livraison = {
  source_id: string;
  /** La vidéo TikTok d'origine et ses vues (pour la file de validation). */
  source_url?: string;
  source_vues?: number;
  titre?: string;
  /** Ce que dit / montre la réaction d'origine (transcription courte). */
  texte_source?: string;
  musique_titre?: string | null;
  musique_url?: string | null;
  /** Consigne de mouvement passée à Kling (optionnelle, en anglais). */
  prompt?: string;
  comptes: {
    compte_id: string;
    /** Image de départ (persona dans le décor de la source, sans texte), chemin local. */
    depart: string;
    /** Texte que le poster colle dans l'éditeur TikTok, dans la langue du compte. */
    texte_ecran: string;
    /** Légende TikTok dans la langue du compte (hashtags compris). */
    legende: string;
  }[];
};

export const lireLivraison = (sourceId: string): Livraison => {
  const l = JSON.parse(readFileSync(`livraisons/${sourceId}.json`, "utf8")) as Livraison;
  if (l.source_id !== sourceId) throw new Error(`livraisons/${sourceId}.json : source_id différent (${l.source_id})`);
  return l;
};
