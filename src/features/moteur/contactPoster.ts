import type { ContactPoster } from "@/features/moteur/api";

/** Ce que les champs affichent : du texte, vide = non renseigné. */
export type ValeursContactPoster = { [K in keyof ContactPoster]: string };

export const CONTACT_POSTER_VIDE: ValeursContactPoster = {
  upwork_url: "",
  upwork_contrat_url: "",
  email_perso: "",
};

/** Les valeurs d'un poster existant, pour pré-remplir la fiche. */
export function valeursContactDe(p: Partial<ContactPoster>): ValeursContactPoster {
  return {
    upwork_url: p.upwork_url ?? "",
    upwork_contrat_url: p.upwork_contrat_url ?? "",
    email_perso: p.email_perso ?? "",
  };
}
