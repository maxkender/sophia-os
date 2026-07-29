import { serviceClient } from "./supabase.ts";

export type Supabase = ReturnType<typeof serviceClient>;

/** Copie les labels du contenu mère sur un media (upsert). */
export async function attacherLabelsAuMedia(
  supabase: Supabase,
  mediaId: string,
  contenuId: string | null | undefined,
): Promise<string[]> {
  if (!contenuId) return [];
  const { data: labs } = await supabase
    .from("contenu_labels")
    .select("label_id")
    .eq("contenu_id", contenuId);
  const labelIds = (labs ?? []).map((l) => l.label_id as string);
  if (labelIds.length === 0) return [];
  await supabase.from("media_labels").upsert(
    labelIds.map((label_id) => ({ media_id: mediaId, label_id })),
    { onConflict: "media_id,label_id" },
  );
  return labelIds;
}

/** Resync complet : médias d'un contenu = labels du contenu. */
export async function syncLabelsMediasDuContenu(
  supabase: Supabase,
  contenuId: string,
  labelIds: string[],
): Promise<void> {
  const { data: medias } = await supabase
    .from("media_library")
    .select("id")
    .eq("contenu_id", contenuId);
  const mediaIds = (medias ?? []).map((m) => m.id as string);
  if (mediaIds.length === 0) return;

  await supabase.from("media_labels").delete().in("media_id", mediaIds);
  if (labelIds.length === 0) return;

  const rows = mediaIds.flatMap((media_id) =>
    labelIds.map((label_id) => ({ media_id, label_id })),
  );
  // Lots pour éviter les payloads trop gros.
  const TAILLE = 500;
  for (let i = 0; i < rows.length; i += TAILLE) {
    const { error } = await supabase.from("media_labels").insert(rows.slice(i, i + TAILLE));
    if (error) throw error;
  }
}

/**
 * Choisit un visuel propre (sans texte) partageant au moins un label du contenu,
 * hors médias déjà utilisés dans la structure. Prefers least-used.
 */
export async function mediaPropreMemeLabel(
  supabase: Supabase,
  opts: {
    contenuId: string;
    excludeMediaIds: string[];
    compteReferenceId?: string | null;
  },
): Promise<{ id: string; url: string } | null> {
  const exclus = new Set(opts.excludeMediaIds.filter(Boolean));

  const { data: labs } = await supabase
    .from("contenu_labels")
    .select("label_id")
    .eq("contenu_id", opts.contenuId);
  const labelIds = (labs ?? []).map((l) => l.label_id as string);

  // 1) Via media_labels (source de vérité pour la biblio).
  if (labelIds.length > 0) {
    const { data: liens } = await supabase
      .from("media_labels")
      .select("media_id")
      .in("label_id", labelIds)
      .limit(200);
    const candidats = [
      ...new Set((liens ?? []).map((l) => l.media_id as string)),
    ].filter((id) => !exclus.has(id));

    if (candidats.length > 0) {
      const { data: medias } = await supabase
        .from("media_library")
        .select("id, url, used_count")
        .in("id", candidats)
        .eq("texte_restant", false)
        .like("storage_path", "propre/%")
        .order("used_count", { ascending: true })
        .limit(30);
      const pick = (medias ?? [])[0];
      if (pick) {
        await supabase
          .from("media_library")
          .update({ used_count: (pick.used_count as number) + 1 })
          .eq("id", pick.id);
        return { id: pick.id as string, url: pick.url as string };
      }
    }
  }

  // 2) Repli : autres contenus même label (si media_labels encore vide).
  if (labelIds.length > 0) {
    const { data: freres } = await supabase
      .from("contenu_labels")
      .select("contenu_id")
      .in("label_id", labelIds)
      .neq("contenu_id", opts.contenuId)
      .limit(60);
    const contenuIds = [...new Set((freres ?? []).map((f) => f.contenu_id as string))];
    if (contenuIds.length > 0) {
      const { data: medias } = await supabase
        .from("media_library")
        .select("id, url, used_count")
        .in("contenu_id", contenuIds)
        .eq("texte_restant", false)
        .like("storage_path", "propre/%")
        .order("used_count", { ascending: true })
        .limit(30);
      const pick = (medias ?? []).find((m) => !exclus.has(m.id as string));
      if (pick) {
        await supabase
          .from("media_library")
          .update({ used_count: (pick.used_count as number) + 1 })
          .eq("id", pick.id);
        return { id: pick.id as string, url: pick.url as string };
      }
    }
  }

  // 3) Repli faible : même source TikTok.
  if (opts.compteReferenceId) {
    const { data: medias } = await supabase
      .from("media_library")
      .select("id, url, used_count")
      .eq("compte_reference_id", opts.compteReferenceId)
      .neq("contenu_id", opts.contenuId)
      .eq("texte_restant", false)
      .like("storage_path", "propre/%")
      .order("used_count", { ascending: true })
      .limit(30);
    const pick = (medias ?? []).find((m) => !exclus.has(m.id as string));
    if (pick) {
      await supabase
        .from("media_library")
        .update({ used_count: (pick.used_count as number) + 1 })
        .eq("id", pick.id);
      return { id: pick.id as string, url: pick.url as string };
    }
  }

  return null;
}
