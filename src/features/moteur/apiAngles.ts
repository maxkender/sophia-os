/**
 * Angles de placement (`angles_placement`, migration 0285) : plusieurs par
 * label × application, chacun ACTIF (plusieurs par paire depuis 0353 : chaque
 * slideshow en reçoit un, ajouté à son prompt de placement) ou en TEST (lu seulement par le test à blanc
 * « contenus », une variante par angle pour comparer). Écriture admin (RLS).
 */
import { supabase } from "@/lib/supabase/client";

import { ANGLE_LONGUEUR_MAX, normaliserAngle } from "./multiapp/angles";

export type StatutAngle = "test" | "actif";

export interface AnglePlacement {
  id: string;
  label_id: string;
  application_id: string;
  texte: string;
  statut: StatutAngle;
  created_at: string;
  updated_at: string;
}

const COLONNES = "id, label_id, application_id, texte, statut, created_at, updated_at";

function texteValide(texte: string): string {
  const propre = normaliserAngle(texte);
  if (!propre) throw new Error("Angle vide.");
  if (propre.length > ANGLE_LONGUEUR_MAX) throw new Error(`Angle trop long : ${ANGLE_LONGUEUR_MAX} caractères au plus.`);
  return propre;
}

/** Tous les angles (table de quelques dizaines de lignes), du plus ancien au plus récent. */
export async function listerAnglesPlacement(): Promise<AnglePlacement[]> {
  const { data, error } = await supabase
    .from("angles_placement")
    .select(COLONNES)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AnglePlacement[];
}

/** Active un angle (fonction `activer_angle_placement`) ; les autres actifs restent actifs. */
export async function activerAnglePlacement(id: string): Promise<void> {
  const { error } = await supabase.rpc("activer_angle_placement", { p_id: id });
  if (error) throw error;
}

/** Nouvel angle, en test ou directement actif (fonction `ajouter_angle_placement`). */
export async function creerAnglePlacement(
  labelId: string,
  applicationId: string,
  texte: string,
  statut: StatutAngle,
): Promise<void> {
  const { error } = await supabase.rpc("ajouter_angle_placement", {
    p_label_id: labelId,
    p_application_id: applicationId,
    p_texte: texteValide(texte),
    p_actif: statut === "actif",
  });
  if (error) throw error;
}

export async function modifierTexteAngle(id: string, texte: string): Promise<void> {
  const { error } = await supabase
    .from("angles_placement")
    .update({ texte: texteValide(texte), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** L'angle ne sert plus la nuit : il reste, en test. */
export async function passerAngleEnTest(id: string): Promise<void> {
  const { error } = await supabase
    .from("angles_placement")
    .update({ statut: "test", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function supprimerAnglePlacement(id: string): Promise<void> {
  const { error } = await supabase.from("angles_placement").delete().eq("id", id);
  if (error) throw error;
}
