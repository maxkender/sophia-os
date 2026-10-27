/**
 * L'apparence de la relecture native, la même côté posteur et côté admin :
 * une icône et une couleur par voie de CTA et par état d'un post du kit.
 * Les couleurs d'état reprennent les jetons du thème (succès, alerte) ; les
 * voies ont chacune leur teinte pour se repérer d'un coup d'œil.
 */
import {
  CheckCircle2,
  Circle,
  LayoutTemplate,
  PenLine,
  Repeat2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import type { EtatPostKit, VoieKit } from "./kit";

export type Ton = "neutre" | "bleu" | "violet" | "orange" | "vert" | "ambre";

/** Fond, texte et bordure d'une pastille ou d'une tuile, clair et sombre. */
export const CLASSES_TON: Record<Ton, string> = {
  neutre: "border-border bg-muted/60 text-muted-foreground",
  bleu: "border-info/25 bg-info/8 text-info-foreground dark:bg-info/16",
  violet: "border-violet-500/25 bg-violet-500/8 text-violet-700 dark:bg-violet-500/16 dark:text-violet-300",
  orange: "border-orange-500/25 bg-orange-500/8 text-orange-700 dark:bg-orange-500/16 dark:text-orange-300",
  vert: "border-success/25 bg-success/8 text-success-foreground dark:bg-success/16",
  ambre: "border-warning/25 bg-warning/8 text-warning-foreground dark:bg-warning/16",
};

export const VOIE: Record<VoieKit, { icone: LucideIcon; ton: Ton }> = {
  reprise: { icone: Repeat2, ton: "bleu" },
  forme: { icone: LayoutTemplate, ton: "violet" },
  libre: { icone: Sparkles, ton: "orange" },
};

export const ETAT: Record<EtatPostKit, { icone: LucideIcon; ton: Ton }> = {
  a_faire: { icone: Circle, ton: "neutre" },
  en_cours: { icone: PenLine, ton: "ambre" },
  rendu: { icone: CheckCircle2, ton: "vert" },
};

/** Les initiales d'un nom, pour la pastille d'un relecteur. */
export function initiales(nom: string): string {
  const mots = nom.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  return (mots.length > 1 ? `${mots[0][0]}${mots[mots.length - 1][0]}` : (mots[0] ?? "?").slice(0, 2)).toUpperCase();
}
