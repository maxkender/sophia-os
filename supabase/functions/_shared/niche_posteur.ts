/**
 * La niche à dire à un posteur pour son warm-up, lue en base.
 *
 * C'est celle du label de son 1er compte perso actif : le même compte que le @
 * donné dans la bienvenue (`handleACreer`, fonction upwork). La règle label →
 * niche est dans `label_theme.ts` (`nicheDesLabels`), partagée avec le front.
 */

import { NICHE_DEFAUT, nicheDesLabels } from "./label_theme.ts";

/**
 * Ne lève jamais : sans compte, sans label ou sur une lecture en panne, rend
 * la niche par défaut (culture générale), ce que les messages disaient à tous
 * avant le 19/11.
 */
export async function nicheDuPosteur(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  posterId: string,
): Promise<string> {
  try {
    const { data: compte } = await supabase.from("comptes").select("id").eq("poster_id", posterId)
      .eq("type_compte", "perso").eq("is_active", true).order("created_at").limit(1).maybeSingle();
    if (!compte?.id) return NICHE_DEFAUT;
    const { data: liens } = await supabase.from("compte_labels").select("labels(nom, slug)").eq("compte_id", compte.id);
    // deno-lint-ignore no-explicit-any
    return nicheDesLabels((liens ?? []).map((l: any) => (l.labels?.nom ?? l.labels?.slug ?? null) as string | null));
  } catch {
    return NICHE_DEFAUT;
  }
}

/**
 * 25/11 : la niche du 1er compte perso actif, ou null sans compte ni label (ou sur une panne) : le WhatsApp
 * warmup_start dit alors « your topic » au lieu de la niche par défaut.
 */
export async function nicheOuNull(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  posterId: string,
): Promise<string | null> {
  try {
    const { data: compte } = await supabase.from("comptes").select("id").eq("poster_id", posterId)
      .eq("type_compte", "perso").eq("is_active", true).order("created_at").limit(1).maybeSingle();
    if (!compte?.id) return null;
    const { data: liens } = await supabase.from("compte_labels").select("labels(nom, slug)").eq("compte_id", compte.id);
    // deno-lint-ignore no-explicit-any
    const noms = (liens ?? []).map((l: any) => (l.labels?.nom ?? l.labels?.slug ?? null) as string | null).filter(Boolean);
    return noms.length ? nicheDesLabels(noms) : null;
  } catch {
    return null;
  }
}
