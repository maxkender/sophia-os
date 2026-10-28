import { supabase } from "@/lib/supabase/client";

/**
 * Relances (prompt 17, 0391) : une seule relance par étape, envoyée par
 * `recrues-check`. Cette page est le journal (lecture), le mode et les textes.
 * Système du 2 nov. (0402) : les 4 étapes de l'accueil, puis le mercredi.
 */
export type EtapeRelance = "connexion" | "tiktok" | "warmup_lance" | "warmup_bien_fait" | "mercredi";
export const ETAPES_RELANCE: readonly EtapeRelance[] = ["connexion", "tiktok", "warmup_lance", "warmup_bien_fait", "mercredi"];
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

/** Les délais des 4 étapes et du Kill (réglage `etapes_delais`, 0402). */
export interface DelaisRelances {
  connexion_message_h: number;
  tiktok_message_h: number;
  warmup_lance_message_h: number;
  warmup_bien_fait_heure: number;
  kill_h: number;
  kill_annulation_h: number;
  [cle: string]: number;
}

export const DELAIS_ETAPES: readonly (keyof DelaisRelances & string)[] = [
  "connexion_message_h",
  "tiktok_message_h",
  "warmup_lance_message_h",
  "warmup_bien_fait_heure",
  "kill_h",
  "kill_annulation_h",
];

const DELAIS_DEFAUT: DelaisRelances = {
  connexion_message_h: 24,
  tiktok_message_h: 48,
  warmup_lance_message_h: 24,
  warmup_bien_fait_heure: 12,
  kill_h: 48,
  kill_annulation_h: 12,
  fenetre_debut: 10,
  fenetre_fin: 20,
};

export interface ReglagesRelances {
  mode: ModeRelances;
  delais: DelaisRelances;
  textes: Record<EtapeRelance, string>;
  slack: string;
  /** Le lien des étapes de création du compte TikTok (texte « tiktok »). */
  lienEtapes: string;
}

const CLES_TEXTES: Record<EtapeRelance, string> = {
  connexion: "etape_texte_connexion",
  tiktok: "etape_texte_tiktok",
  warmup_lance: "etape_texte_warmup_lance",
  warmup_bien_fait: "etape_texte_warmup_bien_fait",
  mercredi: "relance_texte_mercredi",
};

export async function lireReglagesRelances(): Promise<ReglagesRelances> {
  const { data, error } = await supabase
    .from("reglages")
    .select("cle, valeur")
    .in("cle", ["relances_auto", "etapes_delais", "slack_lien_invitation", "lien_etapes_tiktok", ...Object.values(CLES_TEXTES)]);
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  const texte = (cle: string) => (typeof v[cle] === "string" ? (v[cle] as string) : "");
  // « test » (Interrupteurs) = simulation.
  const mode = v.relances_auto === "on" || v.relances_auto === "off" ? v.relances_auto : "simulation";
  return {
    mode,
    delais: { ...DELAIS_DEFAUT, ...((v.etapes_delais ?? {}) as object) },
    textes: Object.fromEntries(Object.entries(CLES_TEXTES).map(([e, cle]) => [e, texte(cle)])) as Record<EtapeRelance, string>,
    slack: texte("slack_lien_invitation"),
    lienEtapes: texte("lien_etapes_tiktok"),
  };
}

export async function enregistrerReglagesRelances(r: ReglagesRelances): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const par = { updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("reglages").upsert([
    { cle: "relances_auto", valeur: r.mode === "simulation" ? "test" : r.mode, ...par },
    { cle: "etapes_delais", valeur: r.delais, ...par },
    { cle: "slack_lien_invitation", valeur: r.slack, ...par },
    { cle: "lien_etapes_tiktok", valeur: r.lienEtapes, ...par },
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

/** Les recrues passées en rouge depuis une date (0391), pour les chiffres de la page. */
export async function lireRougesDepuis(depuisIso: string): Promise<{ etape: string; rouge_at: string }[]> {
  const { data, error } = await supabase.from("recrues_rouges").select("etape, rouge_at").gte("rouge_at", depuisIso);
  if (error) throw error;
  return (data ?? []) as { etape: string; rouge_at: string }[];
}
