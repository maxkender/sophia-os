export type PipelineStatut = "pending" | "running" | "done" | "failed";
export type SujetStatut = "propose" | "retenu" | "rejete" | "utilise";
export type PostType = "recycle" | "remanie" | "nouveau";
export type PostStatut = "brouillon" | "assigne" | "valide_par_poster" | "publie";
export type MediaSource =
  | "nettoye_reference"
  | "stock_libre_de_droits"
  | "genere_ia"
  | "fourni_par_freelance";

export interface CompteReference {
  id: string;
  handle_tiktok: string;
  niche: string | null;
  langue: string;
  /** Prompt adapté (voix / ton de traduction) propre à cette source. */
  style_profile: string | null;
  /** Genre des identités des posters qui reprennent cette source (prénom H/F). */
  genre: "homme" | "femme";
  /** Source « conjointe » : rattachée à un compte principal (null = principal). */
  parent_id: string | null;
  /** Ordre d'assignation global (repli). Plus petit = assigné en premier. */
  ordre_assignation: number | null;
  /** Ordre d'assignation PAR LANGUE : { fr: 2, de: 1, … } (l'emporte sur le global). */
  ordre_par_langue: Record<string, number>;
  is_active: boolean;
  dernier_scrape_at: string | null;
  created_at: string;
}

export interface Compte {
  id: string;
  poster_id: string;
  compte_reference_id: string | null;
  langue: string;
  persona_nom: string | null;
  persona_bio: string | null;
  avatar_url: string | null;
  avatar_source: string | null;
  handle_tiktok: string | null;
  style_profile: string | null;
  demarre_le: string;
  is_active: boolean;
  /** null = suit les réglages globaux. */
  repartition: { recycle: number; remanie: number; nouveau: number } | null;
  posts_par_jour: number | null;
  /** Forme du compte (EWMA), défaut 50. */
  score: number;
  score_maj_at: string | null;
}

export interface CompteAvecDetails extends Compte {
  profiles: { prenom: string | null; nom: string | null; upwork_url: string | null } | null;
  comptes_reference: { handle_tiktok: string } | null;
}

/** Une slide telle que stockée dans `sujets.structure_slides`. */
export interface SujetSlide {
  position: number;
  raw_url: string;
  texte_original: string | null;
  media_id: string | null;
}

export interface Sujet {
  id: string;
  titre: string;
  structure_slides: SujetSlide[];
  compte_reference_id: string | null;
  langue: string;
  source_url: string | null;
  pertinence_score: number | null;
  pertinence_raison: string | null;
  statut: SujetStatut;
  preparation_statut: PipelineStatut;
  preparation_erreur: string | null;
  musique_url: string | null;
  vues: number | null;
  created_at: string;
}

export interface Media {
  id: string;
  compte_id: string | null;
  compte_reference_id: string | null;
  /** Lien optionnel vers un contenu v-next (biblio partagée). */
  contenu_id: string | null;
  storage_path: string;
  url: string;
  source: MediaSource;
  tags: string[];
  langue: string | null;
  visage_identifiable: boolean | null;
  /** L'audit a vu du texte sur une image pourtant rangée en propre. */
  texte_restant: boolean;
  used_count: number;
  created_at: string;
}

export interface Post {
  id: string;
  compte_id: string;
  sujet_id: string | null;
  date_publication_prevue: string | null;
  type: PostType;
  statut: PostStatut;
  musique_url: string | null;
  musique_titre: string | null;
  musique_plateforme: string | null;
  hashtags: string | null;
  publie_at: string | null;
  publie_url: string | null;
  pipeline_statut: PipelineStatut;
  pipeline_etape: string | null;
  pipeline_erreur: string | null;
  est_test: boolean;
  created_at: string;
}

export interface PostSlide {
  id: string;
  post_id: string;
  position: number;
  media_id: string | null;
  texte_overlay: string | null;
  position_sophia: boolean;
  /** Visuel d'origine, texte encore incrusté : modèle de placement. */
  reference_url: string | null;
  media_library: { url: string; storage_path: string } | null;
}

export interface PosterProfil {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  langues: string[];
  nationalite: string | null;
  upwork_url: string | null;
  cout_mensuel: number | null;
  compte_id: string | null;
  handle_tiktok: string | null;
  reference_handle: string | null;
  persona_nom: string | null;
  persona_bio: string | null;
  avatar_url: string | null;
  manager_id: string | null;
  manager_nom: string | null;
  is_active: boolean;
  must_change_password: boolean;
  role: "admin" | "poster" | "hiring_manager" | null;
}

export interface ReglagesScoring {
  ewma_alpha: number;
  regularisation_k: number;
  transfert_inter_langue: number;
  top_k: number;
  temperature: number;
  saturation_jours: number;
  saturation_penalite: number;
  variation_seuil_score: number;
  variation_min_passages: number;
  variation_age_jours: number;
  variation_profondeur_max: number;
  score_prior: number;
  pertinence_seuil: number;
  /** Seuil ELO à l'import : langues en-dessous non cuites ; 0 langue → non importé. */
  elo_seuil_import: number;
  /** Poids des vues dans la base ELO (0..1). Défaut 0.8. */
  elo_poids_vues: number;
  /** Vues qui valent score 100 sur l'échelle log. Défaut 120000. */
  elo_vues_plafond: number;
}

export interface ReglagesPaiement {
  tarif_base_mensuel: number;
  tarif_par_post_jour: number;
}

/** Ordre Fal / Replicate pour le nettoyage d'images. */
export interface ReglagesNettoyage {
  /** Qui est appelé en premier ; l'autre sert de fallback. */
  provider_principal: "fal" | "replicate";
}

export interface Reglages {
  repartition: { recycle: number; remanie: number; nouveau: number };
  frequence: { posts_par_jour: number };
  semaine1: {
    actif: boolean;
    jours: number;
    posts_par_jour: number;
    tout_recycle: boolean;
  };
  /** Réglages moteur v-next (présents dès la migration 0141). */
  scoring: ReglagesScoring;
  paiement: ReglagesPaiement;
  moteur_vnext: { actif: boolean };
  nettoyage: ReglagesNettoyage;
}

export interface StatsCompte {
  compte_id: string;
  persona_nom: string | null;
  handle_tiktok: string | null;
  langue: string;
  is_active: boolean;
  poster_prenom: string | null;
  poster_nom: string | null;
  posts_total: number;
  posts_publies: number;
  /** Publiés mais sans lien TikTok enregistré → non mesurables (0 vue « normal »). */
  posts_sans_lien: number;
  posts_en_attente: number;
  vues_totales: number;
  likes_totaux: number;
  vues_moyennes: number;
}

export interface StatsPost {
  id: string;
  compte_id: string;
  persona_nom: string | null;
  handle_tiktok: string | null;
  type: PostType;
  statut: PostStatut;
  date_publication_prevue: string | null;
  publie_at: string | null;
  publie_url: string | null;
  sujet_titre: string | null;
  vues: number | null;
  likes: number | null;
  commentaires: number | null;
  partages: number | null;
}

// ---------------------------------------------------------------------------
// Moteur v-next (schéma 0141) — tables côte à côte jusqu'au cutover.
// ---------------------------------------------------------------------------

export type ContenuStatut = "brouillon" | "valide" | "rejete";
export type PassageStatut = "brouillon" | "assigne" | "valide_par_poster" | "publie";
export type ImportStatut = "pending" | "running" | "done" | "failed";

export interface Label {
  id: string;
  nom: string;
  slug: string;
  couleur: string | null;
  created_at: string;
}

/** Slide language-agnostique d'un contenu (visuel partagé). */
export interface ContenuSlide {
  position: number;
  media_id: string | null;
  raw_url?: string | null;
  reference_url?: string | null;
}

/** Slide traduite + placement Sophia (par langue). */
export interface ContenuLangueSlide {
  position: number;
  texte_overlay: string | null;
  position_sophia: boolean;
}

/** Détail ELO d'un import (formule + par langue). */
export interface EloImportRapport {
  texte: string;
  vues: number;
  pertinence: number;
  vuesScore: number;
  poidsVues: number;
  vuesPlafond: number;
  prior: number;
  k: number;
  seuil: number;
  langueSource: string;
  lignes: Array<{
    langue: string;
    estSource: boolean;
    pertinence: number;
    vuesScore: number;
    base: number;
    kk: number;
    prior: number;
    elo: number;
    seuil: number;
    retenue: boolean;
  }>;
}

export interface Contenu {
  id: string;
  titre: string;
  structure_slides: ContenuSlide[];
  compte_reference_id: string | null;
  sujet_id: string | null;
  source_url: string | null;
  langue_source: string;
  musique_url: string | null;
  musique_titre: string | null;
  musique_plateforme: string | null;
  vues_source: number | null;
  pertinence_score: number | null;
  pertinence_raison: string | null;
  statut: ContenuStatut;
  import_statut: ImportStatut;
  import_etape: string | null;
  import_erreur: string | null;
  import_tentatives: number;
  /** Rapport ELO détaillé (persistant pour historique / logs). */
  import_elo_rapport?: EloImportRapport | null;
  /** Scores plancherés au seuil (relance manuelle admin). */
  import_elo_force_seuil?: boolean;
  parent_id: string | null;
  profondeur: number;
  /** Langue qui a déclenché la variation (null si contenu original). */
  variation_langue: string | null;
  created_at: string;
}

export interface ContenuLangue {
  id: string;
  contenu_id: string;
  langue: string;
  slides: ContenuLangueSlide[];
  score: number;
  nb_passages: number;
  score_maj_at: string | null;
  created_at: string;
}

export interface Passage {
  id: string;
  contenu_id: string;
  compte_id: string;
  langue: string;
  date_publication_prevue: string | null;
  statut: PassageStatut;
  slides: ContenuLangueSlide[];
  musique_url: string | null;
  musique_titre: string | null;
  musique_plateforme: string | null;
  hashtags: string | null;
  publie_at: string | null;
  publie_url: string | null;
  vues: number | null;
  likes: number | null;
  commentaires: number | null;
  partages: number | null;
  stats_maj_at: string | null;
  post_id: string | null;
  created_at: string;
}
