/** Étapes du pipeline de nettoyage (miroir du backend). */
export type EtapeNettoyageId =
  | "text_removal"
  | "replicate_text_removal"
  | "c2pa"
  | "ready";

export type StatutEtape = "encours" | "ok" | "echec" | "saute" | "attente";

export type MoteurNettoyage = "text_removal" | "replicate_text_removal";

export interface EvenementEtape {
  etape: EtapeNettoyageId;
  statut: StatutEtape;
  detail?: string;
  url?: string;
  moteur?: MoteurNettoyage;
  mediaId?: string;
  ok?: boolean;
  nettoyee?: boolean;
  remplacee?: boolean;
  erreur?: string;
}

export const ORDRE_ETAPES: EtapeNettoyageId[] = [
  "text_removal",
  "replicate_text_removal",
  "c2pa",
  "ready",
];

export function etapesInitiales(): EvenementEtape[] {
  return ORDRE_ETAPES.map((etape) => ({
    etape,
    statut: etape === "text_removal" ? "encours" : "attente",
  }));
}

/** Fusionne un événement reçu dans la timeline affichée. */
export function appliquerEvenement(
  prev: EvenementEtape[],
  ev: EvenementEtape,
): EvenementEtape[] {
  const map = new Map(prev.map((e) => [e.etape, e]));
  map.set(ev.etape, { ...map.get(ev.etape), ...ev });
  // Si une étape démarre, les suivantes non encore jouées restent en attente.
  return ORDRE_ETAPES.map((id) => map.get(id) ?? { etape: id, statut: "attente" });
}
