import { supabase } from "@/lib/supabase/client";

/**
 * 0848 (24/11) : l'état du pont Hub ↔ OS (fonction hub-posteurs, appelée par
 * vik-studios-creators.com), pour l'indicateur de la carte Health. Rouge dès
 * qu'une action échoue sans interruption depuis plus de 15 min (incident
 * ouvert, aussi en rouge sur Aujourd'hui et en DM Slack à Max).
 */
export interface IncidentPont {
  action: string;
  depuis: string;
  derniere_erreur: string | null;
  echecs: number;
}

export interface EtatPontHub {
  dernier_succes_at: string | null;
  dernier_echec: { at: string; action: string; code: number; erreur: string | null } | null;
  appels_24h: number;
  echecs_24h: number;
  incidents: IncidentPont[];
}

export async function lireEtatPontHub(): Promise<EtatPontHub> {
  const { data, error } = await supabase.rpc("hub_pont_etat");
  if (error) throw error;
  return data as EtatPontHub;
}
