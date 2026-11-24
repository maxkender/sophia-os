import { avatarPourCompte } from "./avatar.ts";
import { slugApplicationDuCompte } from "./avatar_application.ts";
import {
  genreDuLabel,
  normaliserLabel,
  themeDuLabel,
  type Genre,
  type ThemeLabel,
} from "./label_theme.ts";
import { composerIdentite, racineHandle } from "./persona_identite.ts";

export type { Genre, ThemeLabel };
export { genreDuLabel, themeDuLabel, normaliserLabel };

type Supabase = ReturnType<typeof import("./supabase.ts").serviceClient>;

/**
 * Identité d'un compte de publication (pseudo, nom, bio, avatar), tirée au
 * hasard et INSTANTANÉE (aucun appel Gemini).
 *
 * Le tirage lui-même est dans persona_identite.ts, les listes (prénoms, noms,
 * mots du @) dans persona_donnees.ts, les bios dans persona_bios.ts.
 * — Genre : label (alpha_male → H, clean_girl → F) sinon genre de la source
 */

/** Charge le label principal d'un compte. */
export async function labelDuCompte(
  supabase: Supabase,
  compteId: string,
): Promise<{ labelId: string; labelNom: string; genre: Genre | null } | null> {
  const { data: cls } = await supabase
    .from("compte_labels")
    .select("label_id")
    .eq("compte_id", compteId);
  const ids = (cls ?? []).map((r) => r.label_id as string).filter(Boolean);
  if (ids.length === 0) return null;

  const { data: labs } = await supabase
    .from("labels")
    .select("id, nom, slug, genre")
    .in("id", ids);
  const lab = (labs ?? [])[0] ?? null;
  if (!lab?.id) return null;
  const labelNom =
    (lab.nom as string | undefined) ?? (lab.slug as string | undefined) ?? (lab.id as string);
  const genreRaw = lab.genre as string | null | undefined;
  const genre: Genre | null =
    genreRaw === "homme" || genreRaw === "femme" ? genreRaw : null;
  return { labelId: lab.id as string, labelNom, genre };
}

/**
 * L'application qu'un compte promeut VRAIMENT, pour chercher sa photo de
 * profil dans la bonne banque (19/11). Elle se lit dans sa répartition
 * (`parts_applications`), sinon dans les cases cochées de son label
 * (`slugApplicationDuCompte`). `comptes.application_id` n'en dit rien : c'est
 * une colonne historique, Sophia pour tous les comptes, Atala compris.
 *
 * Ne lève jamais : sans rien de lisible, rend cette colonne (le comportement
 * d'avant).
 */
export async function applicationReelleDuCompte(
  supabase: Supabase,
  compte: { parts_applications?: unknown; application_id?: string | null },
  labelId: string | null,
): Promise<string | null> {
  const historique = (compte.application_id as string | null | undefined) ?? null;
  try {
    const { data: apps } = await supabase.from("applications").select("id, slug");
    const slugDe = new Map((apps ?? []).map((a) => [a.id as string, a.slug as string]));
    let slugsDuLabel: string[] = [];
    if (labelId) {
      const { data: liens } = await supabase
        .from("label_applications")
        .select("application_id")
        .eq("label_id", labelId);
      slugsDuLabel = (liens ?? [])
        .map((l) => slugDe.get(l.application_id as string))
        .filter((x): x is string => Boolean(x));
    }
    const slug = slugApplicationDuCompte(compte.parts_applications, slugsDuLabel);
    const id = slug ? [...slugDe].find(([, s]) => s === slug)?.[0] : null;
    return id ?? historique;
  } catch {
    return historique;
  }
}

/** Les @ et noms affichés déjà en base, lus page par page (pages de 900, sous le plafond de 1 000 lignes). */
async function identitesPrises(
  supabase: Supabase,
): Promise<{ racinesPrises: Set<string>; nomsPris: Set<string> }> {
  const racinesPrises = new Set<string>();
  const nomsPris = new Set<string>();
  // 24/11 : sous le plafond PostgREST (1000), sinon le garde-fou « lecture tronquée » lève à chaque création.
  const PAGE = 900;
  for (let debut = 0; ; debut += PAGE) {
    const { data } = await supabase
      .from("comptes")
      .select("handle_tiktok, persona_nom")
      .order("id")
      .range(debut, debut + PAGE - 1);
    for (const c of data ?? []) {
      if (c.handle_tiktok) racinesPrises.add(racineHandle(c.handle_tiktok));
      if (c.persona_nom) nomsPris.add(c.persona_nom.toLowerCase());
    }
    if ((data ?? []).length < PAGE) break;
  }
  return { racinesPrises, nomsPris };
}

/**
 * Génère une identité pour une langue + genre + label (thème du @ et de la bio).
 * 100 % local, aucune IA.
 *
 * Seule identité qui existe : un compte reste un compte Sophia (bio, persona)
 * quelles que soient les applications que ses labels servent
 * (docs/multi-applications.md). L'identité « études » de micabo est partie
 * avec l'application (migration 0257).
 */
export async function genererIdentite(
  supabase: Supabase,
  langue: string,
  genre: Genre,
  labelNom?: string | null,
): Promise<{ handle: string; nom: string; bio: string }> {
  const pris = await identitesPrises(supabase);
  return composerIdentite({
    langue,
    genre,
    labelNom,
    ...pris,
    annee: new Date().getUTCFullYear(),
  });
}

/**
 * Pose une identité complète (pseudo + nom + bio + avatar) sur un compte.
 * Label → genre (H/F) + thème du @ + PDP ; langue → prénoms/mots ;
 * application réelle du compte → banque de la PDP.
 * `labelHint` évite une relecture juste après l'insert compte_labels.
 */
export async function appliquerIdentiteInstantanee(
  supabase: Supabase,
  compteId: string,
  labelHint?: {
    labelId: string | null;
    labelNom?: string | null;
    genre?: Genre | null;
  },
): Promise<{ applique: boolean; handle: string | null }> {
  const { data: compte, error } = await supabase
    .from("comptes")
    .select("*, comptes_reference(genre)")
    .eq("id", compteId)
    .single();
  if (error || !compte) return { applique: false, handle: null };

  let labelId = labelHint?.labelId ?? null;
  let labelNom = labelHint?.labelNom ?? null;
  let labelGenre: Genre | null =
    labelHint?.genre === "homme" || labelHint?.genre === "femme"
      ? labelHint.genre
      : null;
  if (!labelId || !labelNom || !labelGenre) {
    const lab = await labelDuCompte(supabase, compteId);
    labelId = labelId ?? lab?.labelId ?? null;
    labelNom = labelNom ?? lab?.labelNom ?? null;
    labelGenre = labelGenre ?? lab?.genre ?? null;
  }
  if (labelId && (!labelNom || !labelGenre)) {
    const { data: lab } = await supabase
      .from("labels")
      .select("nom, slug, genre")
      .eq("id", labelId)
      .maybeSingle();
    labelNom =
      labelNom ??
      (lab?.nom as string | undefined) ??
      (lab?.slug as string | undefined) ??
      null;
    const g = lab?.genre as string | null | undefined;
    if (!labelGenre && (g === "homme" || g === "femme")) labelGenre = g;
  }

  // deno-lint-ignore no-explicit-any
  const genreSource: Genre =
    (compte as any).comptes_reference?.genre === "homme" ? "homme" : "femme";
  // Genre du label (colonne) > heuristique nom > genre source.
  const genre = labelGenre ?? genreDuLabel(labelNom) ?? genreSource;

  const identite = await genererIdentite(supabase, compte.langue, genre, labelNom);
  // La photo vient de la banque de l'application que le compte promeut
  // vraiment (un compte Atala reçoit une photo Atala), jamais d'une autre.
  const avatar = await avatarPourCompte(supabase, {
    compteReferenceId: compte.compte_reference_id,
    labelId,
    labelNom,
    applicationId: await applicationReelleDuCompte(supabase, compte, labelId),
    genre,
  });

  await supabase
    .from("comptes")
    .update({
      handle_tiktok: compte.handle_tiktok ?? identite.handle,
      persona_nom: compte.persona_nom ?? identite.nom,
      persona_bio: compte.persona_bio ?? identite.bio,
      avatar_url: compte.avatar_url ?? avatar?.url ?? null,
      avatar_source: compte.avatar_url ? compte.avatar_source : avatar ? "bibliotheque" : null,
    })
    .eq("id", compteId);

  if (avatar?.id && !compte.avatar_url) {
    await supabase
      .from("media_library")
      .update({ used_count: avatar.used_count + 1 })
      .eq("id", avatar.id);
  }

  return { applique: true, handle: identite.handle };
}
