/**
 * 21/11 (Max) : le bloc « Get paid » des posteurs RUUL : ses données et ses textes (anglais par défaut, traduits par le
 * serveur dans la langue du posteur).
 */
import { invoke } from "@/features/moteur/api";
import { partiesParis, premierPaiementRuul } from "@/features/onboarding/datesRuul";
import { supabase } from "@/lib/supabase/client";

export type EtapeSetup = "inscrit" | "identite" | "banque";
export const ETAPES_SETUP: EtapeSetup[] = ["inscrit", "identite", "banque"];

export interface MonSetupRuul {
  ruul: boolean;
  etapes: { inscrit: boolean; identite: boolean; banque: boolean; pret: boolean; kyc: string | null } | null;
  email: string | null;
  ready_at: string | null;
  lien_auto: boolean;
  /** 0865 : le lundi de départ (AAAA-MM-JJ). */
  cohorte_lundi?: string | null;
}

export const TEXTES_SETUP_EN = {
  titre: "To get paid on Monday, finish your Ruul setup:",
  /** 26/11 (Max) : tant que la première semaine n'est pas payable (lundi de départ + 7 jours pas encore passé). */
  titre_plus_tard: "Ruul is how you get paid. You can set it up later: it's not required to start, just before your first pay.",
  inscrit: "Sign up on app.ruul.io with {email}",
  identite: "Verify your identity",
  banque: "Add your bank account",
  limite: "Ready before Sunday 23:59 (Paris) = paid on Monday.",
  probleme: "I have a problem with Ruul",
  pret: "✅ You're all set, you'll be paid every Monday via Ruul.",
  ouvrir: "Open Ruul",
  fait: "Done",
};
export type TextesSetup = typeof TEXTES_SETUP_EN;

/** Les pages Ruul (sans lien d'onboarding automatique). */
export const LIENS_RUUL: Record<EtapeSetup, string> = {
  inscrit: "https://app.ruul.io/register",
  identite: "https://app.ruul.io/",
  banque: "https://app.ruul.io/",
};

/** Le « ✅ You're all set » reste 3 jours après que Ruul l'a dit prêt. */
export const JOURS_PRET = 3;

/** Que montrer : rien (Upwork, ou prêt depuis plus de 3 jours), les étapes, ou « tout est prêt ». */
export function etatBloc(s: MonSetupRuul | null | undefined, maintenant = Date.now()): "rien" | "etapes" | "pret" {
  if (!s?.ruul || !s.etapes) return "rien";
  if (!s.etapes.pret) return "etapes";
  if (s.ready_at && maintenant - Date.parse(s.ready_at) < JOURS_PRET * 86_400_000) return "pret";
  return "rien";
}

/**
 * 26/11 (Max : « tu peux configurer la plateforme de paiement plus tard ») : la première semaine n'est pas encore
 * payable (avant le lundi de départ + 7 jours, heure de Paris) : Ruul peut attendre, avant la première paie. Après :
 * le texte habituel (« nécessaire pour être payé »).
 */
export function ruulPlusTard(cohorteLundi: string | null | undefined, maintenant = Date.now()): boolean {
  if (!cohorteLundi || !/^\d{4}-\d{2}-\d{2}$/.test(cohorteLundi)) return false;
  return partiesParis(new Date(maintenant)).date < premierPaiementRuul(cohorteLundi);
}

/** La première étape bloquée (pour le Help prérempli). */
export function etapeBloquee(s: MonSetupRuul): EtapeSetup | null {
  if (!s.etapes || s.etapes.pret) return null;
  return ETAPES_SETUP.find((e) => !s.etapes![e]) ?? "banque";
}

export async function lireMonSetupRuul(): Promise<MonSetupRuul | null> {
  const { data, error } = await supabase.rpc("ruul_mon_setup");
  if (error) throw new Error(error.message);
  return (data ?? null) as MonSetupRuul | null;
}

export async function lireTextesSetup(): Promise<TextesSetup> {
  try {
    const r = await invoke<{ ok: boolean; textes?: Partial<TextesSetup> }>("ruul-api", { action: "setup_textes" });
    return { ...TEXTES_SETUP_EN, ...(r.textes ?? {}) };
  } catch {
    return TEXTES_SETUP_EN;
  }
}
