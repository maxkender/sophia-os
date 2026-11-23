import { supabase } from "@/lib/supabase/client";

/**
 * 0839 : WhatsApp côté OS — la bannière de consentement du posteur (derrière le réglage whatsapp_banniere, éteint par
 * défaut) et la carte de statistiques de l'admin (whatsapp_stats).
 */

/** Le réglage whatsapp_banniere : true (ou { actif: true }) pour montrer la bannière ; tout le reste = éteint. */
export function banniereActive(valeur: unknown): boolean {
  if (valeur === true) return true;
  return typeof valeur === "object" && valeur !== null && (valeur as { actif?: unknown }).actif === true;
}

export async function lireBanniereWhatsApp(): Promise<boolean> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "whatsapp_banniere").maybeSingle();
  if (error) return false;
  return banniereActive(data?.valeur);
}

export interface MonWhatsApp {
  whatsapp_e164: string | null;
  whatsapp_optin_at: string | null;
  whatsapp_optout_at: string | null;
}

/** Le numéro et l'accord du posteur connecté (sa ligne de posteur_contacts, s'il en a une). */
export async function lireMonWhatsApp(): Promise<MonWhatsApp | null> {
  const { data: u } = await supabase.auth.getUser();
  const id = u.user?.id;
  if (!id) return null;
  const { data, error } = await supabase.from("posteur_contacts")
    .select("whatsapp_e164, whatsapp_optin_at, whatsapp_optout_at").eq("poster_id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MonWhatsApp | null) ?? null;
}

/** Un numéro au format international (+ et 7 à 15 chiffres) ; les espaces, tirets, points et parenthèses sautent. */
export function numeroInternational(brut: string): string | null {
  let s = brut.trim().replace(/[\s().-]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
}

export async function enregistrerMonWhatsApp(e164: string, accord: boolean): Promise<MonWhatsApp> {
  const { data, error } = await supabase.rpc("whatsapp_mon_numero", { p_e164: e164, p_accord: accord });
  if (error) throw new Error(error.message);
  return data as MonWhatsApp;
}

export interface StatsWhatsApp {
  mode: string | null;
  depuis: string;
  posteurs: number;
  avec_accord: number;
  envoyes: number;
  livres: number;
  lus: number;
  echecs: number;
  bloques: number;
  avec_reponse: number;
  cout_estime: number;
}

export async function lireStatsWhatsApp(): Promise<StatsWhatsApp> {
  const { data, error } = await supabase.rpc("whatsapp_stats");
  if (error) throw new Error(error.message);
  return data as StatsWhatsApp;
}

/** Le pourcentage arrondi (0 si pas de base). */
export const pourcent = (n: number, sur: number) => (sur > 0 ? Math.round((100 * n) / sur) : 0);
