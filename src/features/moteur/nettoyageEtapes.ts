/** Étapes du pipeline de nettoyage (miroir du backend). */
export type EtapeNettoyageId = "seedream" | "proxy" | "inpaint" | "c2pa" | "ready";

export type StatutEtape = "encours" | "ok" | "echec" | "saute" | "attente";

export interface EvenementEtape {
  etape: EtapeNettoyageId;
  statut: StatutEtape;
  detail?: string;
  url?: string;
  moteur?: "seedream" | "proxy" | "inpaint";
  ok?: boolean;
  nettoyee?: boolean;
  remplacee?: boolean;
  erreur?: string;
}

export const ORDRE_ETAPES: EtapeNettoyageId[] = [
  "seedream",
  "proxy",
  "inpaint",
  "c2pa",
  "ready",
];

export function etapesInitiales(): EvenementEtape[] {
  return ORDRE_ETAPES.map((etape) => ({
    etape,
    statut: etape === "seedream" ? "encours" : "attente",
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
