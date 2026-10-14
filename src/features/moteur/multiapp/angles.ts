/**
 * Angles de placement par label × application, côté admin : décisions pures
 * de la page « Angles de placement » (Configuration) et du test à blanc.
 *
 * Un angle est une consigne libre ajoutée au prompt de placement de
 * l'application pour les slideshows du label (placement seulement, pas la
 * pertinence). Statuts (table `angles_placement`, migration 0285) :
 *  - actif : utilisé partout (nuit, assignation), au plus un par paire ;
 *  - test  : utilisé SEULEMENT par le test à blanc « contenus » (Tests), une
 *            variante par angle en test, à côté de la référence.
 * Le moteur le lit dans `supabase/functions/_shared/angle_placement.ts`.
 */
import { applicationsDuLabel, estLabelSystemeSlug } from "@/features/moteur/multiApp";

/** Même borne que le moteur (`ANGLE_LONGUEUR_MAX` de angle_placement.ts). */
export const ANGLE_LONGUEUR_MAX = 500;

/** Angles en test comparés par le test à blanc (`MAX_ANGLES_TEST` du moteur). */
export const MAX_ANGLES_TEST = 4;

export interface LabelPourAngle {
  id: string;
  nom: string | null;
  slug?: string | null;
}

export interface LienLabelApp {
  label_id: string;
  application_id: string;
}

export interface AngleLigne {
  id: string;
  label_id: string;
  application_id: string;
  texte: string;
  statut: string;
  created_at: string;
}

export interface GroupeAngles<A extends AngleLigne = AngleLigne> {
  labelId: string;
  nom: string;
  /** Le label sert l'application (ligne `label_applications`). */
  sert: boolean;
  actif: A | null;
  /** Du plus ancien au plus récent (l'ordre du test à blanc). */
  tests: A[];
}

/** Angle saisi, sans les blancs de bord ; chaîne vide = pas d'angle. */
export function normaliserAngle(angle: string | null | undefined): string {
  return (angle ?? "").trim();
}

/**
 * Une carte par label pour l'application : ceux qui la servent (ligne
 * `label_applications` ; un label sans ligne sert Sophia), plus ceux qui ont
 * encore des angles pour elle sans la servir (angles gardés, inutilisés : le
 * moteur ne les lit pas). Labels système exclus ; ceux qui servent d'abord,
 * puis par nom.
 */
export function groupesAnglesApplication<A extends AngleLigne>(
  applicationId: string,
  labels: readonly LabelPourAngle[],
  liens: readonly LienLabelApp[],
  angles: readonly A[],
): Array<GroupeAngles<A>> {
  const parId = new Map(labels.map((l) => [l.id, l]));
  const servent = new Set(
    labels.filter((l) => applicationsDuLabel(l.id, liens).includes(applicationId)).map((l) => l.id),
  );
  const anglesApp = angles.filter((a) => a.application_id === applicationId);
  const ids = new Set([...servent, ...anglesApp.map((a) => a.label_id)]);
  const groupes: Array<GroupeAngles<A>> = [];
  for (const id of ids) {
    const label = parId.get(id);
    if (!label || estLabelSystemeSlug(label.slug)) continue;
    const siens = anglesApp
      .filter((a) => a.label_id === id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    groupes.push({
      labelId: id,
      nom: (label.nom ?? label.slug ?? id).trim(),
      sert: servent.has(id),
      actif: siens.find((a) => a.statut === "actif") ?? null,
      tests: siens.filter((a) => a.statut === "test"),
    });
  }
  return groupes.sort((a, b) => Number(b.sert) - Number(a.sert) || a.nom.localeCompare(b.nom, "fr"));
}
