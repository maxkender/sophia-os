import { labelsFreres, type LabelPhoto } from "./avatar_application.ts";
import { themeDuLabel, type Genre, type ThemeLabel } from "./label_theme.ts";
import { lireTout } from "./lots.ts";
import type { serviceClient } from "./supabase.ts";

type Supabase = ReturnType<typeof serviceClient>;

/** Un visuel utilisable comme photo de profil (comptage d'usage inclus). */
export interface VisuelAvatar {
  id: string;
  url: string;
  used_count: number;
}

/**
 * 24/11 : plus de 1000 comptes avec une photo : lus par pages (keyset sur id), sinon le garde-fou
 * « lecture tronquée » levait APRÈS la création du login et du compte (manage-users create) et
 * chaque création ratée laissait une fiche orpheline.
 */
async function urlsDejaPrises(supabase: Supabase): Promise<Set<string>> {
  const dejaAvatars = await lireTout<{ id: string; avatar_url: string | null }>(
    "avatars déjà pris",
    (curseur, taille) => {
      let q = supabase.from("comptes").select("id, avatar_url").not("avatar_url", "is", null);
      if (curseur) q = q.gt("id", curseur.id);
      return q.order("id", { ascending: true }).limit(taille);
    },
    { ancre: (c) => c.id },
  );
  return new Set(dejaAvatars.map((c) => c.avatar_url as string));
}

async function chercherVisuels(
  supabase: Supabase,
  opts: { labelIds?: string[]; sourceId?: string | null; applicationId?: string | null },
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
  if (opts.applicationId) q = q.eq("application_id", opts.applicationId);
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
  applicationId?: string | null,
): Promise<string[]> {
  const theme: ThemeLabel = themeDuLabel(labelNom);
  if (theme === "default" && !labelId) return [];

  let q = supabase.from("labels").select("id, nom, slug");
  if (applicationId) q = q.eq("application_id", applicationId);
  const { data: tous } = await q;
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
  applicationId?: string | null,
): Promise<VisuelAvatar | null> {
  const pris = await urlsDejaPrises(supabase);
  const scope = { applicationId };

  const themeIds = await labelIdsDuTheme(supabase, labelId, labelNom, applicationId);
  if (themeIds.length > 0) {
    // 1) label exact
    if (labelId) {
      const exact = premierLibre(
        await chercherVisuels(supabase, { ...scope, labelIds: [labelId] }),
        pris,
      );
      if (exact) return exact;
    }
    // 2) autres labels du même thème (même « genre » visuel)
    const autres = themeIds.filter((id) => id !== labelId);
    if (autres.length > 0) {
      const parTheme = premierLibre(
        await chercherVisuels(supabase, { ...scope, labelIds: autres }),
        pris,
      );
      if (parTheme) return parTheme;
    }
  }

  if (compteReferenceId) {
    const parSource = premierLibre(
      await chercherVisuels(supabase, { ...scope, sourceId: compteReferenceId }),
      pris,
    );
    if (parSource) return parSource;
  }
  return premierLibre(await chercherVisuels(supabase, scope), pris);
}

/**
 * Les labels qui servent une application (cases cochées : `label_applications`).
 * Sans application connue : tous les labels, comme avant.
 */
async function labelsDeLApplication(
  supabase: Supabase,
  applicationId: string | null | undefined,
): Promise<LabelPhoto[]> {
  let ids: string[] | null = null;
  if (applicationId) {
    const { data: liens } = await supabase
      .from("label_applications")
      .select("label_id")
      .eq("application_id", applicationId);
    ids = [...new Set((liens ?? []).map((l) => l.label_id as string).filter(Boolean))];
    if (ids.length === 0) return [];
  }
  let q = supabase.from("labels").select("id, nom, slug, genre");
  if (ids) q = q.in("id", ids);
  const { data } = await q;
  return (data ?? []) as LabelPhoto[];
}

/**
 * Une photo libre de ces labels : d'abord celles rangées sous l'application du
 * compte, puis les autres photos des MÊMES labels. Le label fait la banque ;
 * le rayon (`media_library.application_id`) n'est qu'une préférence : les
 * photos des labels micabo sont rangées sous Sophia, celles de
 * `clean_girl_run` sous Atala et sous Sophia.
 */
async function visuelDesLabels(
  supabase: Supabase,
  labelIds: string[],
  applicationId: string | null | undefined,
  pris: Set<string>,
): Promise<VisuelAvatar | null> {
  if (labelIds.length === 0) return null;
  if (applicationId) {
    const duRayon = premierLibre(await chercherVisuels(supabase, { applicationId, labelIds }), pris);
    if (duRayon) return duRayon;
  }
  return premierLibre(await chercherVisuels(supabase, { labelIds }), pris);
}

/**
 * Photo de profil pour un compte, dans la banque de SON application :
 *   1) photos de son LABEL ;
 *   2) photos des labels du même thème (ex. clean_girl) de son application ;
 *   3) avatar préparé de sa source, puis photos de sa source (même application) ;
 *   4) photos des autres labels du même genre de son application ;
 *   5) le reste des photos rangées sous son application.
 * Rien de libre : `null`. On ne prend jamais la photo d'une autre application
 * (19/11) : la maintenance de nuit repassera sur le compte.
 *
 * `applicationId` est l'application que le compte promeut VRAIMENT
 * (`applicationReelleDuCompte`, persona.ts), pas `comptes.application_id`,
 * colonne historique qui vaut Sophia pour tous les comptes.
 */
export async function avatarPourCompte(
  supabase: Supabase,
  opts: {
    compteReferenceId: string | null;
    labelId?: string | null;
    labelNom?: string | null;
    applicationId?: string | null;
    /** Le genre du compte (label, sinon source) : pour les labels frères. */
    genre?: Genre | null;
  },
): Promise<VisuelAvatar | null> {
  const pris = await urlsDejaPrises(supabase);
  const applicationId = opts.applicationId ?? null;

  if (opts.labelId) {
    const exact = await visuelDesLabels(supabase, [opts.labelId], applicationId, pris);
    if (exact) return exact;
  }

  const freres = opts.labelId || opts.labelNom
    ? labelsFreres({
      labelId: opts.labelId,
      labelNom: opts.labelNom,
      genre: opts.genre,
      labels: await labelsDeLApplication(supabase, applicationId),
    })
    : { memeTheme: [], memeGenre: [] };

  const parTheme = await visuelDesLabels(supabase, freres.memeTheme, applicationId, pris);
  if (parTheme) return parTheme;

  if (opts.compteReferenceId) {
    const { data: ref } = await supabase
      .from("comptes_reference")
      .select("avatar_url, avatar_media_id, application_id")
      .eq("id", opts.compteReferenceId)
      .maybeSingle();
    const memeApp = !applicationId || !ref?.application_id || ref.application_id === applicationId;
    if (memeApp && ref?.avatar_url && !pris.has(ref.avatar_url)) {
      return { id: ref.avatar_media_id ?? "", url: ref.avatar_url, used_count: 0 };
    }

    const parSource = premierLibre(
      await chercherVisuels(supabase, { applicationId, sourceId: opts.compteReferenceId }),
      pris,
    );
    if (parSource) return parSource;
  }

  const parGenre = await visuelDesLabels(supabase, freres.memeGenre, applicationId, pris);
  if (parGenre) return parGenre;

  return premierLibre(await chercherVisuels(supabase, { applicationId }), pris);
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
