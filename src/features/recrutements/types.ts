export type PhaseRecrutement = 0 | 1 | 2;

export type EtapePhase0 =
  | "talks"
  | "contrat_envoye"
  | "contrat_signe"
  | "acces"
  | "checklist"
  | "job_post";

export type EtapeCreateur =
  | "talks"
  | "contrat"
  | "acces"
  | "rejoint"
  | "warmup"
  | "premier_post";

export type StatutSuggestion =
  | "en_attente"
  | "validee"
  | "ignoree"
  | "executee"
  | "a_reproposer";

export type KindSuggestion = "reponse" | "action" | "relance" | "pression";

export type CanalSuggestion = "upwork" | "slack" | "os" | "interne";

export interface RecrutementHm {
  id: string;
  profile_id: string | null;
  upwork_freelancer_id: string | null;
  upwork_profile_url: string | null;
  avatar_url: string | null;
  prenom: string | null;
  nom: string | null;
  nom_affiche: string;
  pays: string[];
  email_os: string | null;
  email_perso: string | null;
  slack_user_id: string | null;
  talks_at: string | null;
  contrat_envoye_at: string | null;
  contrat_signe_at: string | null;
  codes_envoyes_at: string | null;
  slack_invite_envoyee_at: string | null;
  email_perso_demandee_at: string | null;
  rejoint_slack_at: string | null;
  rejoint_os_at: string | null;
  ajoute_upwork_at: string | null;
  job_post_at: string | null;
  job_post_id: string | null;
  job_post_titre: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecrutementCreateur {
  id: string;
  hm_id: string;
  profile_id: string | null;
  pays: string;
  upwork_freelancer_id: string | null;
  upwork_profile_url: string | null;
  avatar_url: string | null;
  prenom: string | null;
  nom: string | null;
  nom_affiche: string;
  email_os: string | null;
  email_perso: string | null;
  slack_user_id: string | null;
  talks_at: string | null;
  contrat_envoye_at: string | null;
  contrat_signe_at: string | null;
  codes_envoyes_at: string | null;
  slack_invite_envoyee_at: string | null;
  rejoint_os_at: string | null;
  rejoint_slack_at: string | null;
  warmup_at: string | null;
  premier_post_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecrutementSuggestion {
  id: string;
  hm_id: string | null;
  createur_id: string | null;
  pays: string | null;
  phase: PhaseRecrutement;
  kind: KindSuggestion;
  canal: CanalSuggestion;
  titre: string;
  corps: string;
  prompt_autom: Record<string, unknown>;
  empreinte: string;
  statut: StatutSuggestion;
  validee_at: string | null;
  ignoree_at: string | null;
  executee_at: string | null;
  execution_log: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecrutementRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  resume: string | null;
}

export interface StatsCreateur10j {
  posterId: string;
  prevus: number;
  postes: number;
  ratio: number | null;
  flagVolume: boolean;
  vuesMoy10: number | null;
  vues10j: number;
  payeUsd: number;
  usdPour1000: number | null;
  ton: "ok" | "volume" | "vues" | "doux";
}

export interface CompteursPays {
  pays: string;
  phase0: number;
  phase1: number;
  phase2: number;
}
