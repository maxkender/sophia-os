/** Étapes du pipeline de nettoyage (miroir du backend). */
export type EtapeNettoyageId =
  | "text_removal"
  | "replicate_text_removal"
  | "restore_resolution"
  | "c2pa"
  | "ready";

export type StatutEtape = "encours" | "ok" | "echec" | "saute" | "attente";

export type MoteurNettoyage = "text_removal" | "replicate_text_removal";

/** Qui tourne en premier dans cleanImage (réglage `nettoyage.provider_principal`). */
export type ProviderNettoyage = "fal" | "replicate";

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

export function ordreEtapesNettoyage(
  premier: ProviderNettoyage = "fal",
): EtapeNettoyageId[] {
  const a: EtapeNettoyageId =
    premier === "fal" ? "text_removal" : "replicate_text_removal";
  const b: EtapeNettoyageId =
    premier === "fal" ? "replicate_text_removal" : "text_removal";
  // restore_resolution après upload (appel HTTP upscale-media), pas dans cleanImage.
  return [a, b, "c2pa", "restore_resolution", "ready"];
}

/** @deprecated préférer ordreEtapesNettoyage(premier) */
export const ORDRE_ETAPES: EtapeNettoyageId[] = ordreEtapesNettoyage("fal");

export function etapesInitiales(
  premier: ProviderNettoyage = "fal",
): EvenementEtape[] {
  const ordre = ordreEtapesNettoyage(premier);
  return ordre.map((etape, i) => ({
    etape,
    statut: i === 0 ? "encours" : "attente",
  }));
}

/** Anciens ids d'étapes (proxy / LaMa) → replicate. */
function normaliserEtape(etape: string): EtapeNettoyageId | null {
  if (
    etape === "text_removal" ||
    etape === "replicate_text_removal" ||
    etape === "restore_resolution" ||
    etape === "c2pa" ||
    etape === "ready"
  ) {
    return etape;
  }
  if (etape === "proxy" || etape === "inpaint") return "replicate_text_removal";
  return null;
}

/** Fusionne un événement reçu dans la timeline affichée. */
export function appliquerEvenement(
  prev: EvenementEtape[],
  ev: EvenementEtape,
  premier: ProviderNettoyage = "fal",
): EvenementEtape[] {
  const etape = normaliserEtape(ev.etape);
  if (!etape) return prev;
  const ordre = ordreEtapesNettoyage(premier);
  const map = new Map(prev.map((e) => [e.etape, e]));
  map.set(etape, { ...map.get(etape), ...ev, etape });
  return ordre.map((id) => map.get(id) ?? { etape: id, statut: "attente" });
}
