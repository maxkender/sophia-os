import type * as React from "react";

import { couleurApplication, nomAffiche } from "@/components/brand/identiteApplications";

export interface Segment {
  cle: string;
  /** Valeur brute ; la barre renormalise elle-même à 100 %. */
  valeur: number;
  couleur: string;
  libelle: string;
  /** Ce que dit l'infobulle sous le libellé. */
  detail?: React.ReactNode;
  /** Remplace le pourcentage dans l'infobulle (ex. « 14 comptes »). */
  valeurAffichee?: string;
}

/** Les segments d'une répartition par application, dans l'ordre donné. */
export function segmentsApplications(
  parts: Array<{ slug: string; valeur: number; detail?: React.ReactNode; valeurAffichee?: string }>,
): Segment[] {
  return parts.map((p) => ({
    cle: p.slug,
    valeur: p.valeur,
    couleur: couleurApplication(p.slug),
    libelle: nomAffiche(p.slug),
    detail: p.detail,
    valeurAffichee: p.valeurAffichee,
  }));
}

