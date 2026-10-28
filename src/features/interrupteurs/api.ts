import { supabase } from "@/lib/supabase/client";

/**
 * Système du 2 nov. : chaque fonction automatique a son interrupteur dans
 * Réglages, off / test / on. Défaut « test » : l'OS montre ce qu'il ferait,
 * sans rien envoyer ni payer.
 */
export type ModeInterrupteur = "off" | "test" | "on";

export const INTERRUPTEURS = ["accueil_auto", "relances_auto", "lundi_message_auto", "kill_auto", "arret_auto"] as const;
export type CleInterrupteur = (typeof INTERRUPTEURS)[number];

/** « simulation » (ancien nom de relances_auto) = test. */
export function lireMode(v: unknown): ModeInterrupteur {
  return v === "off" || v === "on" ? v : "test";
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
