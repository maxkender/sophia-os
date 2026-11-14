/** Le rythme des podz de la voie 1, tenu par le chef dans `pods/rythme.json` (lu au build). */
import rythme from "../../../pods/rythme.json";

/** Le dossier d'un podz dans `pods/rythme.json` : son slug sans préfixe, tirets à la place des soulignés (quelques exceptions). */
const DOSSIER_PAR_SLUG: Record<string, string> = {
  originaux_weird_alpha: "originaux",
  page_blanche: "page-blanche",
  remakes_fathom: "fathom",
  remakes_kaja: "kaja",
  remakes_yasmine: "yasmine",
  remakes_mentalapp: "mentalapp",
  reactions_ugc: "reactions",
};

export function dossierPod(slug: string): string {
  return DOSSIER_PAR_SLUG[slug] ?? slug.replace(/^(originaux|remakes)_/, "").replace(/_/g, "-");
}

/** Le rythme de la voie 1 tenu par le chef dans `pods/rythme.json` (null si absent). */
export function parJourVoie1(slug: string): number | null {
  const ligne = (rythme as Record<string, unknown>)[dossierPod(slug)] as { par_jour?: unknown } | undefined;
  const n = Number(ligne?.par_jour);
  return Number.isFinite(n) ? n : null;
}
