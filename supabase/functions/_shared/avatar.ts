import { themeDuLabel, type ThemeLabel } from "./label_theme.ts";
import { serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

/** Un visuel utilisable comme photo de profil (comptage d'usage inclus). */
export interface VisuelAvatar {
  id: string;
  url: string;
  used_count: number;
}

async function urlsDejaPrises(supabase: Supabase): Promise<Set<string>> {
  const { data: dejaAvatars } = await supabase
    .from("comptes")
    .select("avatar_url")
    .not("avatar_url", "is", null);
  return new Set((dejaAvatars ?? []).map((c) => c.avatar_url as string));
}

async function chercherVisuels(
  supabase: Supabase,
  opts: { labelIds?: string[]; sourceId?: string | null },
): Promise<VisuelAvatar[]> {
  const labelIds = (opts.labelIds ?? []).filter(Boolean);
  let q = supabase
    .from("media_library")
    .select(
      labelIds.length > 0
        ? "id, url, used_count, media_labels!inner(label_id)"
        : "id, url, used_count",
    )
    .eq("texte_restant", false)
    .like("storage_path", "propre/%")
    .order("visage_identifiable", { ascending: true, nullsFirst: false })
    .order("used_count")
    .limit(80);
  if (labelIds.length === 1) q = q.eq("media_labels.label_id", labelIds[0]!);
  else if (labelIds.length > 1) q = q.in("media_labels.label_id", labelIds);
  if (opts.sourceId) q = q.eq("compte_reference_id", opts.sourceId);
  const { data } = await q;
  return (data as VisuelAvatar[] | null) ?? [];
}

function premierLibre(medias: VisuelAvatar[], pris: Set<string>): VisuelAvatar | null {
  return medias.find((m) => !pris.has(m.url)) ?? null;
}

/** Autres labels du même thème (ex. alpha_msle_dark → alpha_male, alpha_male_yellow…). */
async function labelIdsDuTheme(
  supabase: Supabase,
  labelId: string | null | undefined,
  labelNom: string | null | undefined,
): Promise<string[]> {
  const theme: ThemeLabel = themeDuLabel(labelNom);
  if (theme === "default" && !labelId) return [];

  const { data: tous } = await supabase.from("labels").select("id, nom, slug");
  const ids: string[] = [];
  for (const l of tous ?? []) {
    const nom = (l.nom as string) ?? (l.slug as string) ?? "";
    if (themeDuLabel(nom) === theme) ids.push(l.id as string);
  }
  // Label exact en tête
  if (labelId) {
    const rest = ids.filter((id) => id !== labelId);
    return [labelId, ...rest];
  }
  return ids;
}

/**
 * Choisit une photo de profil nettoyée, INSTANTANÉMENT.
 * Ordre : label (puis même thème) → source → global.
 */
export async function choisirVisuelSansVisage(
  supabase: Supabase,
  compteReferenceId: string | null,
  labelId?: string | null,
  labelNom?: string | null,
): Promise<VisuelAvatar | null> {
  const pris = await urlsDejaPrises(supabase);

  const themeIds = await labelIdsDuTheme(supabase, labelId, labelNom);
  if (themeIds.length > 0) {
    // 1) label exact
    if (labelId) {
      const exact = premierLibre(await chercherVisuels(supabase, { labelIds: [labelId] }), pris);
      if (exact) return exact;
    }
    // 2) autres labels du même thème (même « genre » visuel)
    const autres = themeIds.filter((id) => id !== labelId);
    if (autres.length > 0) {
      const parTheme = premierLibre(await chercherVisuels(supabase, { labelIds: autres }), pris);
      if (parTheme) return parTheme;
    }
  }

  if (compteReferenceId) {
    const parSource = premierLibre(
      await chercherVisuels(supabase, { sourceId: compteReferenceId }),
      pris,
    );
    if (parSource) return parSource;
  }
  return premierLibre(await chercherVisuels(supabase, {}), pris);
}

/**
 * Photo de profil pour un compte :
 *   1) média du LABEL (puis labels du même thème — ex. clean_girl)
 *   2) avatar préparé de la source
 *   3) média de la source
 *   4) biblio globale
 */
export async function avatarPourCompte(
  supabase: Supabase,
  opts: {
    compteReferenceId: string | null;
    labelId?: string | null;
    labelNom?: string | null;
  },
): Promise<VisuelAvatar | null> {
  const pris = await urlsDejaPrises(supabase);
  const themeIds = await labelIdsDuTheme(supabase, opts.labelId, opts.labelNom);

  if (opts.labelId) {
    const exact = premierLibre(
      await chercherVisuels(supabase, { labelIds: [opts.labelId] }),
      pris,
    );
    if (exact) return exact;
  }
  const autres = themeIds.filter((id) => id !== opts.labelId);
  if (autres.length > 0) {
    const parTheme = premierLibre(await chercherVisuels(supabase, { labelIds: autres }), pris);
    if (parTheme) return parTheme;
  }

  if (opts.compteReferenceId) {
    const { data: ref } = await supabase
      .from("comptes_reference")
      .select("avatar_url, avatar_media_id")
      .eq("id", opts.compteReferenceId)
      .maybeSingle();
    if (ref?.avatar_url && !pris.has(ref.avatar_url)) {
      return { id: ref.avatar_media_id ?? "", url: ref.avatar_url, used_count: 0 };
    }

    const parSource = premierLibre(
      await chercherVisuels(supabase, { sourceId: opts.compteReferenceId }),
      pris,
    );
    if (parSource) return parSource;
  }

  return premierLibre(await chercherVisuels(supabase, {}), pris);
}

/** @deprecated préférer avatarPourCompte — conservé pour maintenance. */
export async function avatarPourSource(
  supabase: Supabase,
  compteReferenceId: string | null,
): Promise<VisuelAvatar | null> {
  return avatarPourCompte(supabase, { compteReferenceId });
}

/**
 * PRÉPARE (à l'avance, la nuit) la photo de profil d'un compte de référence.
 */
export async function preparerAvatarReference(
  supabase: Supabase,
  referenceId: string,
): Promise<string | null> {
  const visuel = await choisirVisuelSansVisage(supabase, referenceId);
  if (!visuel) return null;
  await supabase
    .from("comptes_reference")
    .update({ avatar_url: visuel.url, avatar_media_id: visuel.id || null })
    .eq("id", referenceId);
  return visuel.url;
}
