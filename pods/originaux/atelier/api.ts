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

export type SlideOriginale = {
  position: number;
  media_id: string;
  /** Texte de base, SANS appli (l'OS le traduit pour chaque langue). */
  texte_overlay: string;
  /** Sur une slide : la version anglaise avec l'appli Sophia (servie aux comptes anglais). */
  texte_sophia?: string;
  /** Slide TikTok d'inspiration (medias/brut/…) : le modèle de mise en page du poster. */
  reference_url: string;
};

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
  /** BLEO (L4) : « full_test » (accroche neuve) ou « declinaison » (famille de la boîte, avec son parent). */
  type_bleo?: "full_test" | "declinaison";
  /** BLEO : pour une déclinaison, l'id complet du parent (colonne parent_contenu_id de npm run boite). */
  parent_contenu_id?: string;
  slides: SlideOriginale[];
};

/**
 * BLEO (L4) : ce que l'original déclare (voir npm run boite). `full_test` : une
 * accroche neuve pour le label, sans parent. `declinaison` : une famille de la
 * boîte, avec son `parent_contenu_id` complet. Sans `type_bleo` : le chemin
 * d'avant BLEO.
 */
export function declarationBleo(o: { type_bleo?: string; parent_contenu_id?: string }):
  | { type_bleo: null; champs: Record<string, never>; resume: string }
  | { type_bleo: "full_test" | "declinaison"; champs: { type_bleo: string; parent_contenu_id: string | null }; resume: string }
  | { erreur: string } {
  if (!o.type_bleo) return { type_bleo: null, champs: {}, resume: "sans type_bleo" };
  if (o.type_bleo !== "full_test" && o.type_bleo !== "declinaison") {
    return { erreur: `type_bleo « ${o.type_bleo} » : « full_test » ou « declinaison »` };
  }
  if (o.type_bleo === "full_test") {
    if (o.parent_contenu_id) return { erreur: "full test : pas de parent_contenu_id (sinon type_bleo « declinaison »)" };
    return { type_bleo: "full_test", champs: { type_bleo: "full_test", parent_contenu_id: null }, resume: "full test" };
  }
  const parent = (o.parent_contenu_id ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(parent)) {
    return { erreur: "déclinaison : parent_contenu_id complet (36 caractères), copié de npm run boite" };
  }
  return { type_bleo: "declinaison", champs: { type_bleo: "declinaison", parent_contenu_id: parent }, resume: `déclinaison de ${parent.slice(0, 8)}` };
}
