/** 19/11 (Max) : « Injoignable par email » (RPC ruul_injoignables, 0775). */
import { supabase } from "@/lib/supabase/client";

export interface AdresseEssayee { adresse: string; statut: string | null; raison: string | null; at: string | null }

export interface Injoignable {
  poster_id: string;
  nom: string | null;
  handle: string | null;
  pays: string | null;
  hm_nom: string | null;
  onboarding: string | null;
  adresses: AdresseEssayee[];
  bandeau_at: string | null;
  bandeau_vu_at: string | null;
}

export async function lireInjoignables(): Promise<Injoignable[]> {
  const { data, error } = await supabase.rpc("ruul_injoignables");
  if (error) throw new Error(error.message);
  return (data ?? []) as Injoignable[];
}

/** Ce que Brevo a répondu, en clair. */
export function raisonLisible(a: Pick<AdresseEssayee, "statut" | "raison">): string {
  const s = (a.statut ?? "").toLowerCase();
  if (s.startsWith("hardbounce")) return /5\.1\.1|does not exist|unknown/i.test(a.raison ?? "") ? "adresse inexistante" : "refusée par la boîte (hard bounce)";
  if (s === "blocked") return "bloquée par Brevo (déjà revenue)";
  if (s === "spam" || s === "complaint") return "plainte (marqué spam)";
  if (s === "invalid") return "adresse invalide";
  if (!s) return "jamais écrit";
  return s;
}
