/**
 * Angle de placement par label × application, côté admin : décisions pures
 * de l'éditeur (Réglages → Prompts), de l'alerte au décochage d'une
 * application (Pilotage → Labels) et du test à blanc.
 *
 * L'angle est `label_applications.angle` : une consigne libre ajoutée au prompt
 * de placement de l'application pour les slideshows du label (placement
 * seulement, pas la pertinence). Vide = placement seul. Il ne vaut que pour les
 * prochaines préparations. Le moteur le lit dans
 * `supabase/functions/_shared/angle_placement.ts`.
 */
import { estLabelSystemeSlug } from "@/features/moteur/multiApp";

/** Même borne que le moteur (`ANGLE_LONGUEUR_MAX` de angle_placement.ts). */
export const ANGLE_LONGUEUR_MAX = 500;

export interface LienAvecAngle {
  label_id: string;
  application_id: string;
  angle?: string | null;
}

export interface LabelPourAngle {
  id: string;
  nom: string | null;
  slug?: string | null;
}

export interface LigneAngle {
  labelId: string;
  nom: string;
  angle: string;
}

/** Angle saisi, sans les blancs de bord ; chaîne vide = pas d'angle. */
export function normaliserAngle(angle: string | null | undefined): string {
  return (angle ?? "").trim();
}

/** Angle enregistré pour (label, application) ; chaîne vide s'il n'y en a pas. */
export function angleDuLien(
  liens: readonly LienAvecAngle[],
  labelId: string,
  applicationId: string,
): string {
  const lien = liens.find((l) => l.label_id === labelId && l.application_id === applicationId);
  return normaliserAngle(lien?.angle);
}

/**
 * Les labels qui servent EXPLICITEMENT cette application (une ligne
 * `label_applications`), labels système exclus, triés par nom, avec leur angle.
 * Un label sans ligne sert Sophia par héritage mais n'a nulle part où ranger un
 * angle : il n'apparaît pas (seuls les labels système sont dans ce cas en prod).
 */
export function lignesAnglesApplication(
  applicationId: string,
  labels: readonly LabelPourAngle[],
  liens: readonly LienAvecAngle[],
): LigneAngle[] {
  const parId = new Map(labels.map((l) => [l.id, l]));
  const lignes: LigneAngle[] = [];
  for (const lien of liens) {
    if (lien.application_id !== applicationId) continue;
    const label = parId.get(lien.label_id);
    if (!label || estLabelSystemeSlug(label.slug)) continue;
    lignes.push({
      labelId: label.id,
      nom: (label.nom ?? label.slug ?? label.id).trim(),
      angle: normaliserAngle(lien.angle),
    });
  }
  return lignes.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/**
 * Angles qu'un nouvel ensemble d'applications servies ferait perdre : décocher
 * une application SUPPRIME sa ligne `label_applications`, et l'angle avec.
 */
export function anglesPerdus(
  labelId: string,
  liens: readonly LienAvecAngle[],
  applicationsVoulues: readonly string[],
): Array<{ applicationId: string; angle: string }> {
  const gardees = new Set(applicationsVoulues);
  return liens
    .filter((l) => l.label_id === labelId && !gardees.has(l.application_id))
    .map((l) => ({ applicationId: l.application_id, angle: normaliserAngle(l.angle) }))
    .filter((p) => p.angle !== "");
}
