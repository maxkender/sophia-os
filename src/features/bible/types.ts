/** 18/11 (Max) : « Bible des comptes ». Les types partagés par la page, le parseur et l'API. */

export type StatutBible = "a_trier" | "a_importer" | "importe" | "refuse" | "en_pause";
export type NicheStatut = "oui" | "non" | "partiel";

export const STATUTS: readonly StatutBible[] = ["a_trier", "a_importer", "importe", "refuse", "en_pause"];

export const LIBELLE_STATUT: Record<StatutBible, string> = {
  a_trier: "à trier",
  a_importer: "à importer",
  importe: "importé",
  refuse: "refusé",
  en_pause: "en pause",
};

export interface PostBible {
  url: string;
  miniature_path?: string | null;
  miniature_url?: string | null;
  vues?: number | null;
  erreur?: string | null;
}

/** Polyvalent : selon le sujet du post, quelle app (et quel label). */
export interface RegleSujet {
  sujet: string;
  app: string;
  label?: string | null;
}

export interface FicheBible {
  id: string;
  handle: string;
  profil_url: string | null;
  statut: StatutBible;
  application_ids: string[];
  apps_attente: string[];
  label_id: string | null;
  label_propose_id: string | null;
  note_import: string | null;
  angle: string | null;
  niche_statut: NicheStatut | null;
  niche: string | null;
  polyvalent: boolean;
  polyvalent_regles: RegleSujet[];
  langue: string | null;
  pays: string | null;
  abonnes: number | null;
  vues_mediane: number | null;
  meilleur_post_url: string | null;
  meilleur_post_vues: number | null;
  dernier_post_le: string | null;
  stats_source: "manuel" | "auto" | null;
  posts: PostBible[];
  miniatures_statut: "a_faire" | "ok" | "partiel" | "sans_liens" | "erreur" | null;
  miniatures_erreur: string | null;
  compte_reference_id: string | null;
  /** « Autre app / idée » : l'app imaginée en texte libre (mode, langues, wellness…). */
  autre_app: string | null;
  ajoute_par: string | null;
  ajoute_at: string;
  modifie_at: string;
}

export interface LabelPropose {
  id: string;
  nom: string;
  description_da: string | null;
  application_ids: string[];
  apps_attente: string[];
  statut: "a_valider" | "valide" | "refuse";
  label_id: string | null;
  propose_at: string;
}

export interface CompteImporte {
  compte_reference_id: string;
  handle: string;
  langue: string | null;
  niche: string | null;
  actif: boolean;
  application_id: string | null;
  ajoute_at: string;
  labels: { id: string; nom: string }[];
  slides: string[];
  /** Le lien TikTok du post de chaque slide (même ordre). */
  slides_posts?: (string | null)[];
  posts: number;
  vues_mediane: number | null;
  bible_id: string | null;
}

export interface AppBible {
  id: string;
  slug: string;
  nom: string;
}

export interface LabelBible {
  id: string;
  nom: string;
  style_theme: string | null;
  application_id: string;
  /** Les apps servies (label_applications), sinon l'app du label. */
  apps: string[];
}

export interface Historique {
  id: number;
  at: string;
  par: string | null;
  quoi: string;
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown> | null;
}
