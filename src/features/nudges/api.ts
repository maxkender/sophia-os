import { supabase } from "@/lib/supabase/client";

/**
 * Relances (prompt 17, 0391) : une seule relance par étape, envoyée par
 * `recrues-check`. Cette page est le journal (lecture), le mode et les textes.
 */
export type EtapeRelance = "acces" | "tiktok" | "warmup" | "mercredi";
export const ETAPES_RELANCE: readonly EtapeRelance[] = ["acces", "tiktok", "warmup", "mercredi"];
export type ModeRelances = "off" | "simulation" | "on";

export interface NudgeEnvoye {
  id: string;
  poster_id: string;
  poster_nom: string | null;
  hm_prenom: string | null;
  handle: string | null;
  /** L'étape (acces, tiktok, warmup, mercredi), ou un ancien type de « Nudge all ». */
  type: string;
  periode: string | null;
  canal: "slack" | "os" | "upwork";
  texte: string;
  envoye_at: string;
  reponse_at: string | null;
  resolu_at: string | null;
  slack_erreur: string | null;
}

export async function lireNudges(depuis: string): Promise<NudgeEnvoye[]> {
  const { data, error } = await supabase.rpc("relances_liste", { p_depuis: depuis });
  if (error) throw error;
  return (data ?? []) as NudgeEnvoye[];
}

/** « A répondu » (le bouton reste jusqu'à la lecture des réponses, prompt 16). */
export async function marquerNudge(id: string, quoi: "repondu" | "upwork"): Promise<void> {
  const { error } = await supabase.rpc("nudge_marquer", { p_id: id, p_quoi: quoi });
  if (error) throw error;
}

export interface RelancePrevue {
  poster_id: string;
  poster_nom: string | null;
  type: EtapeRelance;
  periode: string;
  statut: "prevu" | "bloque";
  canal: "slack" | "upwork" | null;
  texte: string | null;
  raison: string | null;
  maj_at: string;
}

export async function lireRelancesPrevues(): Promise<RelancePrevue[]> {
  const { data, error } = await supabase
    .from("relances_prevues")
    .select("poster_id, type, periode, statut, canal, texte, raison, maj_at, profiles(prenom, nom)")
    .order("maj_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const p = (r as unknown as { profiles: { prenom: string | null; nom: string | null } | null }).profiles;
    return {
      ...(r as unknown as RelancePrevue),
      poster_nom: p ? [p.prenom, p.nom].filter(Boolean).join(" ") || null : null,
    };
  });
}

export interface DelaisRelances {
  acces_message_h: number;
  acces_rouge_h: number;
  tiktok_message_h: number;
  tiktok_rouge_h: number;
  [cle: string]: number;
}

export interface ReglagesRelances {
  mode: ModeRelances;
  delais: DelaisRelances;
  textes: Record<EtapeRelance, string>;
  slack: string;
}

const CLES_TEXTES: Record<EtapeRelance, string> = {
  acces: "relance_texte_acces",
  tiktok: "relance_texte_tiktok",
  warmup: "relance_texte_warmup",
  mercredi: "relance_texte_mercredi",
};

export async function lireReglagesRelances(): Promise<ReglagesRelances> {
  const { data, error } = await supabase
    .from("reglages")
    .select("cle, valeur")
    .in("cle", ["relances_auto", "relances_delais", "slack_lien_invitation", ...Object.values(CLES_TEXTES)]);
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  const texte = (cle: string) => (typeof v[cle] === "string" ? (v[cle] as string) : "");
  const mode = v.relances_auto === "on" || v.relances_auto === "off" ? v.relances_auto : "simulation";
  return {
    mode,
    delais: { acces_message_h: 24, acces_rouge_h: 48, tiktok_message_h: 48, tiktok_rouge_h: 24, ...((v.relances_delais ?? {}) as object) },
    textes: Object.fromEntries(Object.entries(CLES_TEXTES).map(([e, cle]) => [e, texte(cle)])) as Record<EtapeRelance, string>,
    slack: texte("slack_lien_invitation"),
  };
}

export async function enregistrerReglagesRelances(r: ReglagesRelances): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const par = { updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("reglages").upsert([
    { cle: "relances_auto", valeur: r.mode, ...par },
    { cle: "relances_delais", valeur: r.delais, ...par },
    { cle: "slack_lien_invitation", valeur: r.slack, ...par },
    ...ETAPES_RELANCE.map((e) => ({ cle: CLES_TEXTES[e], valeur: r.textes[e], ...par })),
  ]);
  if (error) throw error;
}

export interface CeQueLOsAFait {
  poster_id: string;
  poster_nom: string | null;
  quoi: "relance" | "inactif";
  type: string | null;
  canal: string | null;
  le: string;
  resolu_at: string | null;
}

/** L'accueil HM, en lecture seule : relances et inactifs de ses posteurs. */
export async function lireCeQueLOsAFait(): Promise<CeQueLOsAFait[]> {
  const { data, error } = await supabase.rpc("relances_hm");
  if (error) throw error;
  return (data ?? []) as CeQueLOsAFait[];
}
