/** Seuil sous lequel on signale un stock faible (assignation de minuit). */
export const SEUIL_STOCK_SOURCE = 10;

export type EtatStockSource =
  | "import_en_cours"
  | "jamais_extrait"
  | "epuise"
  | "faible"
  | "ok";

const LISTING_COMPTE_RE = /^listing:\/\/([0-9a-f-]{36})\//i;

/** Compte cible d'une tâche `listing://{compteId}/{batchId}`. */
export function compteIdDepuisListingUrl(url: string): string | null {
  return url.match(LISTING_COMPTE_RE)?.[1] ?? null;
}

/**
 * État du badge stock. Un groupe à 0 n'est « épuisé » que s'il a déjà eu
 * de la matière — sinon Extraire, pas un compte conjoint.
 */
export function etatStockSource(input: {
  stock: number;
  importEnCours: boolean;
  aDejaDeLaMatiere: boolean;
  seuil?: number;
}): EtatStockSource {
  if (input.importEnCours) return "import_en_cours";
  if (input.stock === 0) {
    return input.aDejaDeLaMatiere ? "epuise" : "jamais_extrait";
  }
  if (input.stock < (input.seuil ?? SEUIL_STOCK_SOURCE)) return "faible";
  return "ok";
}

export function cleI18nEtatStock(etat: EtatStockSource): string | null {
  switch (etat) {
    case "import_en_cours":
      return "sources.stockImportEnCours";
    case "jamais_extrait":
      return "sources.stockJamaisExtrait";
    case "epuise":
      return "sources.epuise";
    case "faible":
      return "sources.stockFaible";
    case "ok":
      return null;
  }
}
