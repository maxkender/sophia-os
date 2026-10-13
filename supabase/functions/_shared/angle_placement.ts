/**
 * Angle de placement : consigne propre à un label pour UNE application
 * (`label_applications.angle`), ajoutée au prompt de placement de cette
 * application quand elle n'est pas vide.
 *
 * Exemple : weird_alpha × Unswipe = « insister sur le côté … ». Le prompt de
 * placement de l'application reste le socle ; l'angle oriente le FOND de la
 * slide pub (ce qu'elle met en avant), jamais sa forme.
 *
 * Décision du 2026-10-13 (l'angle avait été retiré le 2026-10-08) :
 *  - placement seulement : la pertinence (le contenu entre-t-il dans la réserve
 *    de l'application ?) ne lit pas l'angle ;
 *  - toutes les applications, Sophia comprise ;
 *  - l'angle est celui du label du CONTENU (le cache des decks est par contenu ×
 *    langue × application, partagé entre comptes) ;
 *  - il ne vaut que pour les prochaines préparations : un deck déjà prêt est
 *    servi tel quel, un post déjà assigné garde son texte ;
 *  - angle vide : le prompt envoyé au modèle est identique OCTET POUR OCTET à
 *    celui d'avant (`blocConsignePlacement` rend une chaîne vide).
 *
 * Module pur : testé sans réseau ni base.
 */
import { estLabelSystemeSlug, type LabelRef } from "./multi_app.ts";

/** Longueur maximale d'un angle dans l'éditeur (Réglages → Prompts). */
export const ANGLE_LONGUEUR_MAX = 500;

/** Ligne `label_applications` lue avec son angle. */
export interface LienAngle {
  label_id: string;
  application_id: string;
  angle?: string | null;
}

/** Angle saisi, sans les blancs de bord ; chaîne vide = pas d'angle. */
export function normaliserAngle(angle: string | null | undefined): string {
  return (angle ?? "").trim();
}

/**
 * Angles des labels d'un contenu pour une application : non vides,
 * dédoublonnés, dans l'ordre des labels, labels système exclus. Vide tant
 * qu'aucun angle n'est saisi.
 */
export function anglesPourApplication(
  labels: readonly LabelRef[],
  liens: readonly LienAngle[],
  applicationId: string,
): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    if (estLabelSystemeSlug(label.slug)) continue;
    for (const lien of liens) {
      if (lien.label_id !== label.id || lien.application_id !== applicationId) continue;
      const angle = normaliserAngle(lien.angle);
      if (!angle || vus.has(angle)) continue;
      vus.add(angle);
      out.push(angle);
    }
  }
  return out;
}

/**
 * L'angle d'un contenu en un seul texte : tel quel s'il n'y en a qu'un (cas de
 * tous les contenus aujourd'hui : un seul label chacun), en liste à puces s'il
 * y en a plusieurs. Chaîne vide s'il n'y en a aucun.
 */
export function texteAngle(angles: readonly string[]): string {
  const propres = [...new Set(angles.map(normaliserAngle).filter(Boolean))];
  if (propres.length === 0) return "";
  if (propres.length === 1) return propres[0];
  return propres.map((a) => `- ${a}`).join("\n");
}

/**
 * Bloc ajouté juste après le prompt maître de placement, avant les données du
 * deck. Chaîne VIDE quand l'angle est vide : le prompt ne bouge alors pas d'un
 * octet.
 *
 * Le mot « angle » n'y figure pas : les prompts maîtres l'emploient déjà pour
 * les 3 variantes (« 3 VARIANTES — 3 ANGLES DIFFÉRENTS »).
 */
export function blocConsignePlacement(
  angle: string | null | undefined,
  nomApplication: string,
  langue: string,
): string {
  const consigne = normaliserAngle(angle);
  if (!consigne) return "";
  return `

--- CONSIGNE PROPRE À CE SLIDESHOW ---
${consigne}
Cette consigne oriente le FOND de la slide ${nomApplication} : ce qu'elle met en avant.
Elle ne remplace aucune règle de forme (langue, longueur, préfixe, casse, ton,
façon de mentionner ${nomApplication}). Les 3 variantes la suivent, chacune à sa
façon. N'en recopie aucune formule telle quelle : tes variantes sont en ${langue}.`;
}
