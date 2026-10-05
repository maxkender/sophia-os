// Appels à la fonction Edge `pods` de l'OS, avec le jeton du pod (POD_JETON).
// Le jeton ne s'écrit jamais dans un fichier : il vient de l'environnement.

export const POD = "originaux_weird_alpha";
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

export type SlideOriginale = { position: number; media_id: string; texte_overlay: string };

/** Un original, tel qu'écrit dans originaux/<source_id>.json. */
export type Original = {
  source_id: string;
  titre: string;
  musique_titre?: string | null;
  musique_url?: string | null;
  /** Contenus du label dont l'original s'inspire (ids). */
  inspirations?: string[];
  /** Notes de l'agent : angle, pourquoi ces items, ce qui est testé. */
  notes?: string;
  slides: SlideOriginale[];
};
