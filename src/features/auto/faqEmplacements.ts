import type * as React from "react";

/**
 * Prompt 22, partie 9 : l'emplacement des onglets en plus du bot FAQ. La FAQ
 * par situation (prompt 21, partie Q : onglets Test et Situations, dans
 * src/features/faq/situations) s'y branche en ajoutant ses onglets ici ; ils
 * s'affichent après Questions to handle · Validated answers · Sources.
 *
 *   { cle: "situations", titre: "autoOnglets.faq.onglets.situations", Composant: OngletSituations }
 *
 * `titre` est une clé i18n (fr et en).
 */
export interface OngletFaqEnPlus {
  cle: string;
  titre: string;
  Composant: React.ComponentType;
}

export const ONGLETS_FAQ_EN_PLUS: readonly OngletFaqEnPlus[] = [];
