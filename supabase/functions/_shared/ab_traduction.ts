/**
 * A/B de la traduction et du placement (migration 0620).
 *
 * Deux circuits écrivent le deck d'un post dans sa langue :
 *   - `temoin` : l'ancien, traduction Gemini puis placement de l'appli ;
 *   - `natif` : la réécriture native, un appel qui voit tout le post et lit
 *     les fiches (plan « Révolution placement/traduction »).
 *
 * Le bras se tire POST PAR POST, par un hash stable de la graine, du compte,
 * du contenu et du jour : le même post retombe dans le même bras à 14 h (deck
 * cuit à l'avance) et à minuit (deck servi). L'allemand n'a qu'une trentaine de
 * comptes ; tirer par post compare les deux bras à l'intérieur de chaque compte,
 * et le r (vues ÷ médiane du compte) les rend comparables d'un compte à l'autre.
 *
 * Un post du bras `natif` sans deck natif prêt (pas cuit, contrôles ratés,
 * créneau rendu à la tierlist) part avec le deck actuel et RESTE compté dans
 * le bras `natif` : sinon le bras ne garderait que les decks faciles.
 *
 * Ce module est léger (aucun appel modèle) : l'assignation de minuit l'importe.
 * Les circuits eux-mêmes sont dans `ab_circuits.ts`.
 */
import type { SlideDeck } from "./deck_langue.ts";
import type { serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

export type BrasTraduction = "temoin" | "natif";

/**
 * La voie du CTA d'un deck (colonnes `voie_cta` de 0600), tirée par l'OS à la
 * commande, jamais par le modèle : `reprise` (le CTA de l'original), `prouvee`
 * (une forme qui a fait ses preuves dans le label), `essai` (une forme neuve).
 */
export type VoieCta = "reprise" | "prouvee" | "essai" | "marquee" | "concurrent";

/** Le CTA commandé à un circuit : la voie tirée et, pour `prouvee` ou `essai`, la forme. */
export interface CommandeCta {
  voie: VoieCta;
  forme: string | null;
}

export interface ReglageAbTraduction {
  actif: boolean;
  /** Codes des langues en test (`de`, `pt`…) ; `pt` couvre aussi `pt-BR`. */
  langues: string[];
  /** Part des posts tirés dans le bras `natif`. */
  partNatif: number;
  graine: string;
  /** `version` du circuit natif servi en production ; null : rien n'est branché. */
  circuitProduction: string | null;
}

export const AB_TRADUCTION_COUPE: ReglageAbTraduction = {
  actif: false,
  langues: [],
  partNatif: 0.5,
  graine: "ab-traduction-1",
  circuitProduction: null,
};

/** Lit `reglages.ab_traduction.valeur`. Toute valeur bancale vaut « coupé ». */
export function lireReglageAbTraduction(valeur: unknown): ReglageAbTraduction {
  if (!valeur || typeof valeur !== "object") return AB_TRADUCTION_COUPE;
  const v = valeur as Record<string, unknown>;
  const langues = Array.isArray(v.langues)
    ? v.langues.map((l) => String(l).trim().toLowerCase()).filter(Boolean)
    : [];
  const part = Number(v.part_natif);
  const circuit = typeof v.circuit_production === "string" && v.circuit_production.trim()
    ? v.circuit_production.trim()
    : null;
  return {
    actif: v.actif === true && circuit !== null && langues.length > 0,
    langues,
    partNatif: Number.isFinite(part) && part > 0 && part < 1 ? part : 0.5,
    graine: typeof v.graine === "string" && v.graine ? v.graine : AB_TRADUCTION_COUPE.graine,
    circuitProduction: circuit,
  };
}

/** Le réglage en base. Ne lève jamais : une lecture en panne vaut « coupé ». */
export async function chargerReglageAbTraduction(supabase: Supabase): Promise<ReglageAbTraduction> {
  try {
    const { data, error } = await supabase
      .from("reglages")
      .select("valeur")
      .eq("cle", "ab_traduction")
      .maybeSingle();
    if (error || !data) return AB_TRADUCTION_COUPE;
    return lireReglageAbTraduction((data as { valeur?: unknown }).valeur);
  } catch {
    return AB_TRADUCTION_COUPE;
  }
}

/** La langue est-elle en test ? `pt` dans la liste couvre `pt` et `pt-BR`. */
export function langueEnTest(reglage: ReglageAbTraduction, langue: string): boolean {
  const l = langue.trim().toLowerCase();
  return reglage.langues.includes(l) || reglage.langues.includes(l.split("-")[0]);
}

/** FNV-1a 32 bits ramené dans [0, 1). Stable d'un runtime à l'autre. */
export function hashUnitaire(texte: string): number {
  let h = 0x811c9dc5;
  for (const octet of new TextEncoder().encode(texte)) {
    h ^= octet;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x1_0000_0000;
}

/**
 * Le bras d'un post. Null : pas d'A/B pour lui (coupé, langue hors test).
 * Même entrée, même bras : 14 h et minuit tombent d'accord.
 */
export function brasDuPost(
  reglage: ReglageAbTraduction,
  post: { compteId: string; contenuId: string; jour: string; langue: string },
): BrasTraduction | null {
  if (!reglage.actif || !langueEnTest(reglage, post.langue)) return null;
  const u = hashUnitaire(`${reglage.graine}:${post.compteId}:${post.contenuId}:${post.jour}`);
  return u < reglage.partNatif ? "natif" : "temoin";
}

/**
 * Le deck écrit par un circuit, recalé sur le deck de référence (le deck
 * source ou le deck actuel) : mêmes positions, un texte là où il y en avait
 * un, une seule slide d'appli, jamais la couverture. Le circuit ne touche ni
 * aux images ni à l'ordre : seuls le texte et la slide d'appli changent.
 */
export function recalerDeck(
  reference: ReadonlyArray<SlideDeck>,
  ecrit: ReadonlyArray<{ position: number; texte_overlay: string | null; position_sophia?: boolean }>,
): { slides: SlideDeck[] } | { erreur: string } {
  const parPosition = new Map(ecrit.map((s) => [Number(s.position), s]));
  const positions = reference.map((s) => s.position);
  const manquantes = positions.filter((p) => !parPosition.has(p));
  if (manquantes.length) return { erreur: `slides manquantes : ${manquantes.join(", ")}` };
  const enTrop = [...parPosition.keys()].filter((p) => !positions.includes(p));
  if (enTrop.length) return { erreur: `slides en trop : ${enTrop.join(", ")}` };

  const slides: SlideDeck[] = reference.map((r) => {
    const e = parPosition.get(r.position)!;
    const texte = (e.texte_overlay ?? "").trim();
    return { position: r.position, texte_overlay: texte || null, position_sophia: e.position_sophia === true };
  });
  const vides = reference
    .filter((r, i) => (r.texte_overlay ?? "").trim() && !slides[i].texte_overlay)
    .map((r) => r.position);
  if (vides.length) return { erreur: `slides sans texte : ${vides.join(", ")}` };
  const appli = slides.filter((s) => s.position_sophia);
  if (appli.length !== 1) return { erreur: `${appli.length} slide(s) d'appli au lieu d'une` };
  if (appli[0].position === Math.min(...positions)) return { erreur: "slide d'appli sur la couverture" };
  return { slides };
}

/** Un deck natif prêt, tel que l'assignation le sert. */
export interface DeckNatifServi {
  slides: SlideDeck[];
  hashtags: string;
  versionFiche: number | null;
  /** Le CTA réellement écrit (la voie reprise quand le circuit a refusé celle tirée). */
  cta: CommandeCta | null;
}

/**
 * Le deck natif d'un contenu × langue × appli, s'il est prêt ET de la version
 * en production. Ne lève jamais : sans deck, le post part avec l'ancien.
 */
export async function lireDeckNatif(
  supabase: Supabase,
  cle: { contenuId: string; langue: string; applicationId: string; version: string },
): Promise<DeckNatifServi | null> {
  try {
    const { data, error } = await supabase
      .from("decks_natifs")
      .select("slides, hashtags, version_fiche, statut, version, voie_cta, forme_cta")
      .eq("contenu_id", cle.contenuId)
      .eq("langue", cle.langue)
      .eq("application_id", cle.applicationId)
      .maybeSingle();
    if (error || !data || data.statut !== "pret" || data.version !== cle.version) return null;
    const slides = (data.slides ?? []) as SlideDeck[];
    if (!slides.length || !slides.some((s) => s.position_sophia)) return null;
    return {
      slides,
      hashtags: String(data.hashtags ?? ""),
      versionFiche: data.version_fiche ?? null,
      cta: data.voie_cta ? { voie: data.voie_cta as VoieCta, forme: data.forme_cta ?? null } : null,
    };
  } catch {
    return null;
  }
}

/**
 * Les colonnes A/B d'un passage. `{}` hors A/B : l'objet inséré reste
 * exactement celui d'avant 0620.
 */
export function colonnesAbTraduction(
  bras: BrasTraduction | null,
  servi: DeckNatifServi | null,
): Record<string, string | number | null> {
  if (!bras) return {};
  const natif = bras === "natif" && servi !== null;
  return {
    bras_traduction: bras,
    circuit: natif ? "natif" : "gemini",
    deck_version: natif ? servi.versionFiche : null,
    voie_cta: natif ? servi.cta?.voie ?? null : null,
    forme_cta: natif ? servi.cta?.forme ?? null : null,
  };
}
