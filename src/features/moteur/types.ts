import type { PapierFalUsage, ReglagesPapier } from "./papierReglages";
import type { Tier } from "./tierlist";

// Barèmes et table de requalification : voir `./tierlist`.
export { PASSAGES_PAR_TIER, TIERS } from "./tierlist";
export type { Tier } from "./tierlist";

export type PipelineStatut = "pending" | "running" | "done" | "failed";
export type SujetStatut = "propose" | "retenu" | "rejete" | "utilise";
export type PostType = "recycle" | "remanie" | "nouveau" | "contenu";
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
  /** Application OS (sophia, micabo, …). */
  application_id: string;
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

export type TypeCompte = "perso" | "cm";

export interface CompteIdentifiants {
  compte_id: string;
  tiktok_email: string;
  tiktok_password: string;
  tiktok_2fa_note: string | null;
  notes_hm: string | null;
  renseigne_at: string;
  vu_par_poster_at: string | null;
}

export interface CompteResumePoster {
  id: string;
  type_compte: TypeCompte;
  langue: string;
  application_id: string | null;
  application_slug: string | null;
  handle_tiktok: string | null;
  persona_nom: string | null;
  persona_bio: string | null;
  avatar_url: string | null;
  score: number | null;
  score_maj_at: string | null;
  warmup_started_at: string | null;
  warmup_ends_at: string | null;
  reference_handle: string | null;
}

export interface Compte {
  id: string;
  poster_id: string;
  compte_reference_id: string | null;
  type_compte: TypeCompte;
  langue: string;
  /** Application associée à ce compte TikTok. */
  application_id: string;
  application_slug?: string | null;
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
  /** Quota d'assignation minuit : 1 à 3 (défaut 1). */
  posts_par_jour: number;
  /** Forme du compte (EWMA), défaut 50. */
  score: number;
  score_maj_at: string | null;
  /** Clic « Start warmup » — null = créé, warmup pas lancé. */
  warmup_started_at: string | null;
  /** Fin warmup (started + N h). En process si now >= ends. */
  warmup_ends_at: string | null;
  /** Créateur UGC AI — slideshows ugc_compatible + swap visage persona. */
  ugc_ai: boolean;
  /** Créateur UGC AI VIDEO — marque seule, aucun label ; persona unique partagé. */
  ugc_ai_video: boolean;
  /** Persona UGC (4 angles) associé à ce créateur. */
  ugc_persona_id: string | null;
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
  application_id?: string | null;
  /** Lien optionnel vers un contenu v-next (biblio partagée). */
  contenu_id: string | null;
  storage_path: string;
  url: string;
  source: MediaSource;
  tags: string[];
  langue: string | null;
  visage_identifiable: boolean | null;
  /** Visage humain au premier plan (scan UGC vision). Null = non scanné. */
  visage_premier_plan: boolean | null;
  /** Regen Nano Banana (swap visage) — pas d'upscale SeedVR. */
  ugc_face_regen: boolean;
  /** L'audit a vu du texte sur une image pourtant rangée en propre. */
  texte_restant: boolean;
  /** Date du dernier upscale Real-ESRGAN (null = jamais). */
  upscale_le: string | null;
  /** Caption visuelle courte (Florence / Moondream). */
  caption: string | null;
  /** ok | aucune | null (pas encore tenté). */
  caption_statut: "ok" | "aucune" | null;
  caption_modele: "florence" | "moondream" | "none" | null;
  caption_le: string | null;
  /** Première slide d'un slideshow. */
  est_hook: boolean;
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
  /** Recharges complètes demandées par le créateur (0–2). */
  recharges_createur?: number;
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
  media_library: {
    url: string;
    storage_path: string;
    upscale_le: string | null;
  } | null;
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
  /** ELO / forme du compte TikTok (`comptes.score`), null si pas de compte. */
  score: number | null;
  score_maj_at: string | null;
  warmup_started_at: string | null;
  warmup_ends_at: string | null;
  manager_id: string | null;
  manager_nom: string | null;
  is_active: boolean;
  must_change_password: boolean;
  role: "admin" | "poster" | "hiring_manager" | "directing_manager" | null;
  /** Recruteur UGC AI VIDEO : créateurs = marque vidéo + persona, sans labels. */
  hm_ugc_ai_video: boolean;
  /** Tous les comptes actifs du créateur (perso + CM). */
  comptes: CompteResumePoster[];
}

/** Avancement du cycle tierlist d'un contenu (vue `contenu_tier_etat`). */
export interface ContenuTierEtat {
  contenu_id: string;
  tier: Tier;
  passages_prevus: number;
  tier_cycle: number;
  tier_maj_at: string | null;
  /** Passages publiés sur le cycle courant (hors rappels J+7). */
  publies: number;
  /** Passages assignés, pas encore publiés (réservés 7 jours). */
  en_vol: number;
  /** Passages encore à distribuer. */
  restants: number;
  /** `m` — moyenne des vues des passages publiés du cycle. */
  moyenne_vues: number | null;
  max_vues: number | null;
  nb_150k: number;
  dernier_publie_at: string | null;
}

/** Trace de la dernière requalification (colonne `contenus.tier_rapport`). */
export interface TierRapport {
  origine?: "import" | "import_force";
  avant?: Tier;
  apres?: Tier;
  regle?: string;
  m?: number;
  max_vues?: number;
  nb_150k?: number;
  passages_mesures?: number;
  cycle?: number;
  elo?: number;
  seuil?: number;
  tier?: Tier;
  passages?: number;
}

export interface ReglagesTierlist {
  /** Jours de recul sur le dernier passage publié avant de requalifier. */
  recul_jours: number;
  /** Vues d'un passage qui déclenchent le rappel J+7 sur le même compte. */
  rappel_vues: number;
  /** Décalage du rappel après la publication du passage source. */
  rappel_jours: number;
  /** Rappels enchaînés maximum. */
  rappel_max: number;
  /** Remix débloqués à chaque requalification en S+. */
  remix_par_requalif: number;
  /** Passages offerts à un contenu en D repêché pour combler le pool. */
  repechage_passages: number;
}

export interface ReglagesScoring {
  ewma_alpha: number;
  regularisation_k: number;
  transfert_inter_langue: number;
  variation_seuil_score: number;
  variation_min_passages: number;
  variation_age_jours: number;
  variation_profondeur_max: number;
  score_prior: number;
  pertinence_seuil: number;
  /** Seuil de la note d'import : en-dessous, le TikTok n'est pas importé. */
  elo_seuil_import: number;
  /** Poids des vues dans la note d'import (0..1). Défaut 0.7. */
  elo_poids_vues: number;
  /** Vues qui valent score 100 (échelle log^1.3). Défaut 80000. */
  elo_vues_plafond: number;
  /**
   * Régularisation ELO à l'import (≠ regularisation_k des comptes).
   * Faible = l'écart 1k vs 20k vues reste visible. Défaut 1.
   */
  elo_regularisation_k: number;
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

/** Entrée de la file des prochains comptes (label + mode UGC). */
export interface FileLabelCompteItem {
  label_id: string;
  /** Si true : compte UGC AI (persona libre, nom + avatar persona). */
  ugc: boolean;
}

/**
 * File FIFO des labels assignés aux prochains comptes créés.
 * `par_langue[code]` surpasse `items` (file générale) pour cette langue ;
 * si la file langue est vide → file générale ; si les deux sont vides → least-used.
 */
export interface FileLabelsApplication {
  items: FileLabelCompteItem[];
  par_langue: Record<string, FileLabelCompteItem[]>;
}

export interface ReglagesFileLabels {
  /** File générale (fallback, app courante / Sophia legacy). */
  items: FileLabelCompteItem[];
  /** Files prioritaires par code langue (`fr`, `de`, …). */
  par_langue: Record<string, FileLabelCompteItem[]>;
  /** Files séparées par slug d'application. */
  par_application?: Record<string, FileLabelsApplication>;
}

export interface ReglagesWarmup {
  /** Durée du warmup en heures (défaut 24). */
  heures: number;
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
  /** Réglages tierlist (requalification, rappels J+7, repêchage). */
  tierlist: ReglagesTierlist;
  paiement: ReglagesPaiement;
  moteur_vnext: { actif: boolean };
  /** false = cron minuit + rattrapage en pause (manuel OK). */
  assignation_auto: { actif: boolean };
  nettoyage: ReglagesNettoyage;
  file_labels_comptes: ReglagesFileLabels;
  warmup: ReglagesWarmup;
  papier: ReglagesPapier;
  papier_fal_usage: PapierFalUsage;
}

export interface StatsCompte {
  compte_id: string;
  persona_nom: string | null;
  handle_tiktok: string | null;
  langue: string;
  is_active: boolean;
  /** ELO / forme du compte (`comptes.score`). */
  elo: number | null;
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

export type LabelGenre = "homme" | "femme";

export interface Label {
  id: string;
  nom: string;
  slug: string;
  couleur: string | null;
  created_at: string;
  application_id: string;
  /** Pool UGC AI VIDEO (HM vidéo + reactions/utilisations). */
  ugc_ai_video: boolean;
  /** Genre imposé pour les prénoms TikTok des créateurs de ce label. */
  genre: LabelGenre | null;
  /** Thème / style rédigé par l'admin (création semi-manuelle). */
  style_theme?: string | null;
  /** Prompt dédié pour rédiger les slides de ce label. */
  prompt_creation?: string | null;
  /** Exemples de textes déjà rédigés (feed few-shot). */
  exemples_feed?: string[];
}

/** Slide language-agnostique d'un contenu (visuel partagé). */
export interface ContenuSlide {
  position: number;
  media_id: string | null;
  raw_url?: string | null;
  reference_url?: string | null;
  /** Image figée (hook, ou choix admin) — jamais re-tirée à l'assignation. */
  pinned?: boolean;
  /** Mots-clés caption (sujet + ton) pour résoudre l'image à l'assignation. */
  critere?: string | null;
}

/** Slide traduite + placement Sophia (par langue). */
export interface ContenuLangueSlide {
  position: number;
  texte_overlay: string | null;
  position_sophia: boolean;
}

/** Détail de la note d'import (formule + premier placement). */
export interface EloImportRapport {
  texte: string;
  vues: number;
  /** Note /100 de la langue source. */
  elo?: number;
  /** Rang d'entrée déduit de la note (null = sous le seuil, pas importé). */
  tier?: Tier | null;
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
  application_id: string;
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
  /** Rang tierlist — unique, langue-agnostique. */
  tier: Tier;
  /** Passages à effectuer sur le cycle courant avant requalification. */
  passages_prevus: number;
  /** Cycle de requalification courant (fenêtre de mesure de `m`). */
  tier_cycle: number;
  tier_maj_at: string | null;
  /** Trace de la dernière requalification / du placement d'import. */
  tier_rapport?: TierRapport | null;
  /** Rapport de la note d'import (persistant pour historique / logs). */
  import_elo_rapport?: EloImportRapport | null;
  /** Scores plancherés au seuil (relance manuelle admin). */
  import_elo_force_seuil?: boolean;
  parent_id: string | null;
  profondeur: number;
  /** Langue qui a déclenché la variation (null si contenu original). */
  variation_langue: string | null;
  /** Marqué UGC — scan visage premier plan sur les images. */
  ugc_compatible: boolean;
  /** import = pipeline TikTok ; manuel = création semi-manuelle admin. */
  creation_mode?: "import" | "manuel";
  /** Slideshow d'origine du hook (musique reprise). */
  hook_contenu_id?: string | null;
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
  /** Cycle tierlist du contenu au moment de l'assignation. */
  tier_cycle?: number;
  /** Rappel automatique J+7 (passage source > 50k vues) — hors quota, hors `m`. */
  est_rappel?: boolean;
  rappel_rang?: number;
  rappel_source_id?: string | null;
  publie_at: string | null;
  publie_url: string | null;
  vues: number | null;
  likes: number | null;
  commentaires: number | null;
  partages: number | null;
  stats_maj_at: string | null;
  /** Horodatage de l'application ELO langue (delta rattrapage). */
  elo_maj_at?: string | null;
  post_id: string | null;
  created_at: string;
}
