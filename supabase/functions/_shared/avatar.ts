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
  opts: { labelId?: string | null; sourceId?: string | null },
): Promise<VisuelAvatar[]> {
  let q = supabase
    .from("media_library")
    .select(
      opts.labelId
        ? "id, url, used_count, media_labels!inner(label_id)"
        : "id, url, used_count",
    )
    .eq("texte_restant", false)
    .like("storage_path", "propre/%")
    .order("visage_identifiable", { ascending: true, nullsFirst: false })
    .order("used_count")
    .limit(80);
  if (opts.labelId) q = q.eq("media_labels.label_id", opts.labelId);
  if (opts.sourceId) q = q.eq("compte_reference_id", opts.sourceId);
  const { data } = await q;
  return (data as VisuelAvatar[] | null) ?? [];
}

function premierLibre(medias: VisuelAvatar[], pris: Set<string>): VisuelAvatar | null {
  return medias.find((m) => !pris.has(m.url)) ?? null;
}

/**
 * Choisit une photo de profil nettoyée, INSTANTANÉMENT.
 * Ordre : label → source → global. Privilégie sans visage, évite les doublons.
 */
export async function choisirVisuelSansVisage(
  supabase: Supabase,
  compteReferenceId: string | null,
  labelId?: string | null,
): Promise<VisuelAvatar | null> {
  const pris = await urlsDejaPrises(supabase);

  if (labelId) {
    const parLabel = premierLibre(await chercherVisuels(supabase, { labelId }), pris);
    if (parLabel) return parLabel;
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
 *   1) média du LABEL
 *   2) avatar préparé de la source
 *   3) média de la source
 *   4) biblio globale
 */
export async function avatarPourCompte(
  supabase: Supabase,
  opts: { compteReferenceId: string | null; labelId?: string | null },
): Promise<VisuelAvatar | null> {
  const pris = await urlsDejaPrises(supabase);

  if (opts.labelId) {
    const parLabel = premierLibre(
      await chercherVisuels(supabase, { labelId: opts.labelId }),
      pris,
    );
    if (parLabel) return parLabel;
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
