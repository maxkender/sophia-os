import { nicheDesLabels } from "@/features/moteur/themeLabel";
import { supabase } from "@/lib/supabase/client";

/** Ce que les 5 étapes lisent du profil du posteur : son lundi de cohorte (0391), Slack relié. */
export interface MaPremiereSemaine {
  cohorteLundi: string | null;
  slackLie: boolean;
  /** 0544 : l'heure du 1er post publié avec lien (tous ses comptes), ou null. */
  premierPostLienAt?: string | null;
  /** 13/11 : le montant de SA semaine (Ruul : ruul_tarif_semaine), affiché seulement sur son dashboard. */
  montantSemaine?: number | null;
}

export async function lireMaPremiereSemaine(): Promise<MaPremiereSemaine> {
  const { data: auth } = await supabase.auth.getUser();
  const id = auth.user?.id;
  if (!id) return { cohorteLundi: null, slackLie: false };
  const { data, error } = await supabase.from("profiles").select("cohorte_lundi, slack_user_id, ruul_tarif_semaine").eq("id", id).maybeSingle();
  if (error) throw error;
  const premier = await supabase.rpc("mon_premier_post_lien");
  return {
    cohorteLundi: (data?.cohorte_lundi as string | null) ?? null,
    slackLie: Boolean(data?.slack_user_id),
    premierPostLienAt: premier.error ? null : ((premier.data as string | null) ?? null),
    montantSemaine: data?.ruul_tarif_semaine == null ? null : Number(data.ruul_tarif_semaine),
  };
}

/**
 * 19/11 : la niche du warm-up d'un compte du posteur, d'après son label (il
 * voit les labels de ses comptes, pas ceux des autres). Ne lève jamais : sans
 * label lisible, null, et l'accueil dit « your niche » sans la nommer.
 */
export async function lireMaNiche(compteId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from("compte_labels").select("labels(nom, slug)").eq("compte_id", compteId);
    if (error) return null;
    const noms = ((data ?? []) as unknown as { labels: { nom: string | null; slug: string | null } | null }[])
      .map((l) => l.labels?.nom ?? l.labels?.slug ?? null)
      .filter((n): n is string => Boolean(n));
    return noms.length > 0 ? nicheDesLabels(noms) : null;
  } catch {
    return null;
  }
}

/** 0497 : le compte du posteur, son dernier relevé VALIDE (illisible jamais) et « prêt » (compte_pret). */
export interface MonWarmup {
  compte_id: string;
  pret: boolean;
  abonnements: number | null;
  existe: boolean | null;
  releve_at: string | null;
  warmup_started_at: string | null;
  pays: string | null;
}

export async function lireMonWarmup(): Promise<MonWarmup | null> {
  const { data, error } = await supabase.rpc("mon_warmup");
  if (error) throw error;
  return ((data ?? []) as MonWarmup[])[0] ?? null;
}

export type EtapeDeclarable = "slack" | "tiktok" | "warmup";
export interface MaDeclaration {
  etape: EtapeDeclarable;
  statut: "en_attente" | "valide" | "refuse";
  declare_at: string;
}

/** « I did this step » / « I've joined » : Slack est relié tout de suite si on le trouve ; sinon, à confirmer par l'équipe. */
export async function declarerEtape(etape: EtapeDeclarable, note?: string): Promise<"relie" | "en_attente"> {
  const { data, error } = await supabase.rpc("declarer_etape", { p_etape: etape, p_note: note ?? null });
  if (error) throw error;
  return data as "relie" | "en_attente";
}

export async function lireMesDeclarations(): Promise<MaDeclaration[]> {
  const { data, error } = await supabase.rpc("mes_declarations");
  if (error) throw error;
  return (data ?? []) as MaDeclaration[];
}

/** 0498 : les textes debut_popup_* (le conseil « TikTok limite les follows »), modifiables dans Settings. */
export async function lireMesTextesDebut(): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc("mes_textes_debut");
  if (error) throw error;
  return (data ?? {}) as Record<string, string>;
}
