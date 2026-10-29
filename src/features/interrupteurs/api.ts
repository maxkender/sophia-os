import { supabase } from "@/lib/supabase/client";

/**
 * Système du 2 nov. : chaque fonction automatique a son interrupteur dans
 * Réglages, off / test / on. Défaut « test » : l'OS montre ce qu'il ferait,
 * sans rien envoyer ni payer.
 */
export type ModeInterrupteur = "off" | "test" | "approve" | "on";

/**
 * Prompt 25 : les relances des recrues et le lundi 20 h ont une position
 * « Approve » : l'OS prépare les messages (Messages sent → To approve), ils ne
 * partent qu'après « Send selected ».
 */
export const AVEC_APPROVE: readonly string[] = ["accueil_auto", "relances_auto", "lundi_soir_auto"];

export const INTERRUPTEURS = [
  "accueil_auto",
  "relances_auto",
  "lundi_message_auto",
  "lundi_soir_auto",
  "kill_auto",
  "kill_message_auto",
  "arret_auto",
  "reponses_auto",
] as const;
export type CleInterrupteur = (typeof INTERRUPTEURS)[number];

/** « simulation » (ancien nom de relances_auto) = test ; l'ancien kill_message_auto (oui / non) = on / off. */
export function lireMode(v: unknown): ModeInterrupteur {
  if (v === true) return "on";
  if (v === false) return "off";
  return v === "off" || v === "on" || v === "approve" ? v : "test";
}

export async function lireInterrupteurs(): Promise<Record<CleInterrupteur, ModeInterrupteur>> {
  const { data, error } = await supabase.from("reglages").select("cle, valeur").in("cle", [...INTERRUPTEURS]);
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  return Object.fromEntries(INTERRUPTEURS.map((c) => [c, lireMode(v[c])])) as Record<CleInterrupteur, ModeInterrupteur>;
}

export async function enregistrerInterrupteur(cle: CleInterrupteur, mode: ModeInterrupteur): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("reglages")
    .upsert({ cle, valeur: mode, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/** Rappels en pause pour tous jusqu'à cette date (minuit, Paris) : `rappels_reprise_le`, vide = pas de pause. */
export async function lireRepriseRappels(): Promise<string> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "rappels_reprise_le").maybeSingle();
  if (error) throw error;
  return typeof data?.valeur === "string" ? data.valeur : "";
}

export async function enregistrerRepriseRappels(jour: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("reglages")
    .upsert({ cle: "rappels_reprise_le", valeur: jour, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/**
 * Prompt 22, partie 3 : le mode de la paie par l'API (`paie_api.mode`), dans
 * Overview → Switches. Seul le mode change : les contrats de test, les dates
 * et les plafonds restent dans Payroll, tels quels.
 */
export async function lireModePaieApi(): Promise<ModeInterrupteur> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "paie_api").maybeSingle();
  if (error) throw error;
  const mode = (data?.valeur as { mode?: unknown } | null)?.mode;
  return mode === "test" || mode === "on" ? mode : "off";
}

export async function enregistrerModePaieApi(mode: ModeInterrupteur): Promise<void> {
  const { data, error: errLu } = await supabase.from("reglages").select("valeur").eq("cle", "paie_api").maybeSingle();
  if (errLu) throw errLu;
  const avant = data?.valeur && typeof data.valeur === "object" ? (data.valeur as Record<string, unknown>) : {};
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("reglages")
    .upsert({ cle: "paie_api", valeur: { ...avant, mode }, updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() });
  if (error) throw error;
}
