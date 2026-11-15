// Appels à la fonction Edge `pods` de l'OS, avec le jeton du podz (POD_JETON).
// Le jeton ne s'écrit jamais dans un fichier : il vient de l'environnement.

export const POD = "originaux_plony";
/**
 * Les originaux du label Plony s'écrivent en anglais (décision d'Adrien du
 * 13/11) : l'OS les traduit au placement, dans la langue de chaque compte, et
 * y place Sophia sur la slide marquée.
 */
export const LANGUE_SOURCE = "en";
const URL_DEFAUT = "https://mbikecieskoobeizixig.supabase.co";

/** Le format Plony : la phrase sur 3 slides, puis la slide Sophia. */
export const SLIDES_PHRASE = 3;
export const POSITION_SOPHIA = 4;
/** Limites de l'OS (verifierOriginal) : 120 caractères en slide 1, 320 ensuite. */
export const MAX_ACCROCHE = 120;
export const MAX_SLIDE = 320;
/** Une slide de phrase reste courte, comme chez @_plony_ (lisible en une seconde). */
export const MAX_MORCEAU = 90;

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
  /** Image propre de la banque du label (id complet ou ses 8 premiers caractères). */
  media_id: string;
  /**
   * Texte de base, SANS appli. Slides 1 à 3 : un morceau de la phrase. Slide 4 :
   * la source de la phrase (« Seneca, Letters to Lucilius. ») ou une chute
   * neutre pour une phrase à nous.
   */
  texte_overlay: string;
  /**
   * Slide 4 seulement : la même slide AVEC Sophia, dans l'esprit de « I read
   * this this morning on Sophia. » (jamais de tiret long ni de point-virgule).
   * L'OS la traduit et la sert aux comptes Sophia.
   */
  texte_sophia?: string;
  /** Slide TikTok d'origine (medias/brut/…) : le modèle de mise en page du poster (où poser le texte). */
  reference_url: string;
};

/** Un original, tel qu'écrit dans originaux/<source_id>.json. */
export type Original = {
  source_id: string;
  /** La légende TikTok : la phrase en entier, puis 3 ou 4 hashtags. */
  titre: string;
  /** D'où vient la phrase : « Seneca, Letters to Lucilius, 13 », ou « podz » pour une phrase à nous. */
  source_phrase: string;
  musique_titre?: string | null;
  musique_url?: string | null;
  /** Posts de @_plony_ dont l'original reprend les images (contenu_id de sources/banque.json). */
  inspirations?: string[];
  /** Notes de l'agent : thème, angle, ce qui est testé. */
  notes?: string;
  /** BLEO : « full_test » (phrase neuve) ou « declinaison » (famille de la boîte, avec son parent). */
  type_bleo: "full_test" | "declinaison";
  /** BLEO : pour une déclinaison, l'id complet du parent (colonne parent_contenu_id de npm run boite). */
  parent_contenu_id?: string;
  slides: SlideOriginale[];
};

/**
 * BLEO : ce que l'original déclare (voir npm run boite). `full_test` : une
 * phrase neuve pour le label, sans parent. `declinaison` : une famille de la
 * boîte, avec son `parent_contenu_id` complet. Le label est en voie 1 : un
 * dépôt sans déclaration est refusé.
 */
export function declarationBleo(o: { type_bleo?: string; parent_contenu_id?: string }):
  | { type_bleo: "full_test" | "declinaison"; champs: { type_bleo: string; parent_contenu_id: string | null }; resume: string }
  | { erreur: string } {
  if (o.type_bleo !== "full_test" && o.type_bleo !== "declinaison") {
    return { erreur: `type_bleo « ${o.type_bleo ?? ""} » : « full_test » ou « declinaison » (obligatoire)` };
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

/**
 * Contrôles locaux du format Plony, avant ceux de l'OS : 4 slides, la phrase
 * sur 1 à 3, la slide Sophia en 4 (et seulement elle), des morceaux courts,
 * une image différente par slide, une slide d'origine partout.
 */
export function controlerFormat(o: Original): string[] {
  const e: string[] = [];
  const slides = [...o.slides].sort((a, b) => a.position - b.position);
  if (slides.length !== POSITION_SOPHIA) e.push(`${slides.length} slides (${POSITION_SOPHIA} attendues : la phrase sur 3, puis Sophia)`);
  if (slides.some((s, i) => s.position !== i + 1)) e.push("positions attendues : 1, 2, 3, 4");
  if (new Set(slides.map((s) => s.media_id.slice(0, 8))).size !== slides.length) e.push("même image utilisée deux fois");
  if (!o.source_phrase?.trim()) e.push("source_phrase manquante (l'auteur et l'œuvre, ou « podz »)");
  for (const s of slides) {
    const t = s.texte_overlay.trim();
    const max = s.position === 1 ? MAX_ACCROCHE : s.position <= SLIDES_PHRASE ? MAX_MORCEAU : MAX_SLIDE;
    if (!t) e.push(`#${s.position} : texte vide`);
    else if (t.length > max) e.push(`#${s.position} : ${t.length} caractères (${max} au plus)`);
    if (/\bsophia\b/i.test(t)) e.push(`#${s.position} : le texte de base cite Sophia (la version Sophia va dans texte_sophia, slide 4)`);
    if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/medias\/brut\//.test(s.reference_url ?? "")) {
      e.push(`#${s.position} : reference_url doit être une slide d'origine medias/brut/ (voir npm run sources)`);
    }
    const ts = s.texte_sophia?.trim();
    if (s.position === POSITION_SOPHIA) {
      if (!ts) e.push(`#${POSITION_SOPHIA} : texte_sophia manquant`);
      else {
        if (!/\bsophia\b/i.test(ts)) e.push(`#${POSITION_SOPHIA} : texte_sophia ne cite pas Sophia`);
        if (/[—;]/.test(ts)) e.push(`#${POSITION_SOPHIA} : texte_sophia avec tiret long ou point-virgule`);
        if (ts.length > MAX_SLIDE) e.push(`#${POSITION_SOPHIA} : texte_sophia de ${ts.length} caractères (${MAX_SLIDE} au plus)`);
      }
    } else if (ts) e.push(`#${s.position} : texte_sophia seulement en slide ${POSITION_SOPHIA}`);
  }
  return e;
}
