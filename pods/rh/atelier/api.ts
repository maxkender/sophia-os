// Appels à la fonction Edge `pods` de l'OS, avec le jeton du pod (POD_JETON).
// Le jeton ne s'écrit jamais dans un fichier : il vient de l'environnement.

export const POD = "originaux_rh";
/** Les originaux du label RH s'écrivent en français, comme sa source @careerswemma. */
export const LANGUE_SOURCE = "fr";
const URL_DEFAUT = "https://mbikecieskoobeizixig.supabase.co";

/** Règle de preuve (décidée le 15/10), contrôlée aussi par l'OS au dépôt. */
export const PREUVE_VUES_MIN = 200_000;
export const PREUVE_JOURS_MAX = 30;
export const PREUVE_R_MIN = 2;

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

/** Une référence de preuve : un post de la niche, ou un contenu du label (r recalculé par l'OS). */
export type ReferencePreuve =
  | { type: "tiktok"; url: string; vues: number; publie_le: string; enregistrements?: number | null; releve_le?: string }
  | { type: "os"; contenu_id: string; r_median?: number | null; publies?: number; releve_le?: string };

/** Un schéma d'accroche du playbook (playbook.json). */
export type Schema = {
  id: string;
  schema: string;
  exemples: string[];
  pourquoi?: string;
  /** Contenus du label d'où prendre images et slides d'inspiration. */
  inspiration_contenus?: string[];
  musiques?: { titre: string; url: string }[];
  preuves: ReferencePreuve[];
};

export type Playbook = {
  maj_le: string;
  regle: string;
  schemas: Schema[];
  a_eviter: { schema: string; pourquoi: string; preuves: ReferencePreuve[] }[];
};

/** Un original, tel qu'écrit dans originaux/<source_id>.json. */
export type Original = {
  source_id: string;
  titre: string;
  /** Chemin d'avant BLEO : le schéma du playbook, dont la preuve part avec le dépôt. Pas pour un dépôt BLEO. */
  schema_id?: string;
  musique_titre?: string | null;
  musique_url?: string | null;
  /** Contenus du label dont l'original s'inspire (ids). */
  inspirations?: string[];
  /** Notes de l'agent : angle, accroches écartées, ce qui est testé. */
  notes?: string;
  /** BLEO (L4) : « full_test » (accroche neuve) ou « declinaison » (famille de la boîte, avec son parent). */
  type_bleo?: "full_test" | "declinaison";
  /** BLEO : pour une déclinaison, l'id complet du parent (colonne parent_contenu_id de npm run boite). */
  parent_contenu_id?: string;
  slides: SlideOriginale[];
};

export const aujourdhui = () => new Date().toISOString().slice(0, 10);
export const jours = (debut: string, fin: string) =>
  Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000);

/** Une référence TikTok qui suffit seule : ≥ 200 k vues, publiée il y a 30 jours au plus. */
export const tiktokSuffit = (r: ReferencePreuve, jour = aujourdhui()) =>
  r.type === "tiktok" && r.vues >= PREUVE_VUES_MIN && r.publie_le <= jour && jours(r.publie_le, jour) <= PREUVE_JOURS_MAX;

/** Un contenu du label relevé à r ≥ 2 (l'OS le recalcule au dépôt). */
export const osSuffit = (r: ReferencePreuve) => r.type === "os" && (r.r_median ?? 0) >= PREUVE_R_MIN;

/**
 * La preuve d'un schéma telle qu'envoyée à l'OS : ses références qui suffisent
 * encore aujourd'hui (6 au plus), ou null si le schéma est expiré.
 */
export function preuveDuSchema(s: Schema, jour = aujourdhui()) {
  const valables = s.preuves.filter((r) => tiktokSuffit(r, jour) || osSuffit(r)).slice(0, 6);
  if (!valables.length) return null;
  return {
    schema: s.schema,
    references: valables.map((r) =>
      r.type === "tiktok"
        ? { type: "tiktok", url: r.url, vues: r.vues, publie_le: r.publie_le, enregistrements: r.enregistrements ?? null }
        : { type: "os", contenu_id: r.contenu_id },
    ),
  };
}

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
