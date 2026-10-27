import type { EtatCase } from "./logique";

/** Les couleurs des cases : les mêmes partout (vert, orange, rouge, gris). */
export const COULEUR: Record<EtatCase, string> = {
  ok: "border-success/40 bg-success/15 text-success-foreground",
  partiel: "border-warning/50 bg-warning/15 text-warning-foreground",
  rate: "border-destructive/40 bg-destructive/12 text-destructive-foreground",
  en_cours: "border-border bg-muted/60 text-muted-foreground",
  a_venir: "border-border bg-muted/40 text-muted-foreground",
  vide: "border-transparent text-muted-foreground/60",
};
