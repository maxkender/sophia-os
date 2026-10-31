import { supabase } from "@/lib/supabase/client";

/**
 * Prompt 25 : les listes du jeudi et du samedi (Weekly decisions). Tous les
 * comptes actifs, une ligne par compte (`semaine_comptes`, 0435). La logique
 * ici ne touche ni la base ni le réseau : le choix pré-coché, les filtres, le
 * tri.
 */
export interface JourPosts {
  jour: string;
  prevus: number;
  lien: number;
}

export interface VuePost {
  jour: string;
  vues: number | null;
  url: string;
}

export interface CompteSemaine {
  compte_id: string;
  handle: string | null;
  poster_id: string;
  poster_nom: string | null;
  prenom: string | null;
  hm_id: string | null;
  hm_nom: string | null;
  pays: string | null;
  cohorte_lundi: string | null;
  premier_post: string | null;
  jours: JourPosts[];
  /** Posts prévus du lundi à la veille du jour affiché. */
  prevus_passes: number;
  lien_passes: number;
  lien_aujourdhui: number;
  /** Posts avec lien du lundi jusqu'au jour affiché compris. */
  lien_total: number;
  prevus_semaine: number;
  vues: VuePost[];
  /** « shadowban » (supposé) ou « vues_basses » (compte mort), page Shadowban. */
  shadowban: "shadowban" | "vues_basses" | null;
  liens_introuvables: number;
  canal: "slack" | "upwork" | null;
  nudge_envoye_at: string | null;
  nudge_en_file: boolean;
  ckd_jeudi_id: string | null;
  ckd_jeudi_action: string | null;
  ckd_jeudi_decision: string | null;
  ckd_samedi_id: string | null;
  ckd_samedi_action: string | null;
  ckd_samedi_regle: string | null;
  ckd_samedi_decision: string | null;
  ckd_samedi_donnees: Record<string, unknown> | null;
  /** Le chemin de Recreate : la proposition du contrôle du jeudi, ou la page Shadowban ; null : pas possible. */
  recreer: "ckd" | "shadowban" | null;
  autres_comptes: number;
}

export async function lireSemaineComptes(lundi: string, jusqu: string): Promise<CompteSemaine[]> {
  const { data, error } = await supabase.rpc("semaine_comptes", { p_lundi: lundi, p_jusqu: jusqu });
  if (error) throw error;
  return (data ?? []) as CompteSemaine[];
}

/** « Send » du jeudi : un nudge par posteur dans la file d'envoi (rien ne part avant ce clic). */
export async function validerNudgesJeudi(lundi: string, comptes: string[]): Promise<{ prepares: number; deja: number; sans_canal: number }> {
  const { data, error } = await supabase.rpc("jeudi_valider", { p_lundi: lundi, p_comptes: comptes });
  if (error) throw error;
  return data as { prepares: number; deja: number; sans_canal: number };
}

/** Le compte a manqué au moins un post avec lien depuis lundi (jours passés). */
export const aManque = (c: Pick<CompteSemaine, "prevus_passes" | "lien_passes">) => c.prevus_passes > c.lien_passes;

/** Les posts attendus « jusqu'ici » : les jours passés, plus ceux déjà postés aujourd'hui. */
export const attendusJusquIci = (c: Pick<CompteSemaine, "prevus_passes" | "lien_aujourdhui">) => c.prevus_passes + c.lien_aujourdhui;

export type ChoixJeudi = "nudge" | "recreate" | "kill_samedi" | "rien";

/**
 * Le choix pré-coché du jeudi : Recreate pour un shadowban supposé ou un compte
 * mort (ou proposé par le contrôle du jeudi) quand Recreate est possible ;
 * Nudge pour un compte qui a manqué au moins un post avec lien depuis lundi
 * (sauf déjà nudgé cette semaine) ; rien sinon.
 */
export function choixJeudiInitial(c: CompteSemaine): ChoixJeudi {
  const mort = c.shadowban !== null || (c.ckd_jeudi_action === "recreer" && !c.ckd_jeudi_decision);
  if (mort && c.recreer) return "recreate";
  if (aManque(c) && !c.nudge_envoye_at && !c.nudge_en_file) return "nudge";
  return "rien";
}

export interface FiltresListe {
  hm: string;
  pays: string;
  /** « tous », « 0 », « max2 », « max4 », « manque » (a manqué au moins un post), « ok ». */
  posts: string;
  /** « tous », « oui » (shadowban supposé ou compte mort), « non ». */
  shadowban: string;
  nom: string;
  /** Décisions finales 2 : la cohorte (lundi de début), « » = toutes. */
  cohorte: string;
}

export const FILTRES_VIDES: FiltresListe = { hm: "", pays: "", posts: "tous", shadowban: "tous", nom: "", cohorte: "" };

export function filtrerComptes(liste: readonly CompteSemaine[], f: FiltresListe): CompteSemaine[] {
  const nom = f.nom.trim().toLowerCase();
  return liste.filter((c) => {
    if (f.hm && (c.hm_id ?? "aucune") !== f.hm) return false;
    if (f.pays && (c.pays ?? "") !== f.pays) return false;
    if (f.cohorte && (c.cohorte_lundi ?? "") !== f.cohorte) return false;
    if (f.posts === "0" && c.lien_total !== 0) return false;
    if (f.posts === "max2" && c.lien_total > 2) return false;
    if (f.posts === "max4" && c.lien_total > 4) return false;
    if (f.posts === "manque" && !aManque(c)) return false;
    if (f.posts === "ok" && aManque(c)) return false;
    if (f.shadowban === "oui" && c.shadowban === null) return false;
    if (f.shadowban === "non" && c.shadowban !== null) return false;
    if (nom && !`${c.poster_nom ?? ""} ${c.handle ?? ""}`.toLowerCase().includes(nom)) return false;
    return true;
  });
}

export type Tri = "posts_asc" | "posts_desc" | "nom";

/** Tri par posts avec lien (puis ceux qui ont le plus manqué), ou par nom. */
export function trierComptes(liste: readonly CompteSemaine[], tri: Tri): CompteSemaine[] {
  const manques = (c: CompteSemaine) => c.prevus_passes - c.lien_passes;
  return [...liste].sort((a, b) => {
    if (tri === "nom") return (a.poster_nom ?? a.handle ?? "").localeCompare(b.poster_nom ?? b.handle ?? "");
    const d = tri === "posts_asc" ? a.lien_total - b.lien_total : b.lien_total - a.lien_total;
    return d || manques(b) - manques(a) || (a.handle ?? "").localeCompare(b.handle ?? "");
  });
}

/** Les HM et les pays présents dans la liste (pour les filtres). */
export function optionsFiltres(liste: readonly CompteSemaine[]) {
  const hms = new Map<string, string>();
  const pays = new Set<string>();
  const cohortes = new Set<string>();
  for (const c of liste) {
    hms.set(c.hm_id ?? "aucune", c.hm_nom ?? "—");
    if (c.pays) pays.add(c.pays);
    if (c.cohorte_lundi) cohortes.add(c.cohorte_lundi);
  }
  return {
    hms: [...hms.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    pays: [...pays].sort(),
    cohortes: [...cohortes].sort().reverse(),
  };
}

// ---------------------------------------------------------------------------
// Prompt 25, partie 4 : le samedi (masterlist)
// ---------------------------------------------------------------------------

/**
 * Prompt 26 : « kill » = Kill & pay (par défaut), « kill_np » = Kill & don't pay (raison obligatoire).
 * Prompt 12 : « repondre » (Je réponds : la conversation Upwork s'ouvre, la ligne reste à traiter) et
 * « Autre » : recreate, pause, reporter.
 */
export type ChoixSamedi = "kill" | "kill_np" | "double" | "keep" | "repondre" | "recreate" | "pause" | "reporter";

/** La décision déjà prise sur la proposition du samedi, en Kill / Double / Keep. */
export function decisionSamedi(c: Pick<CompteSemaine, "ckd_samedi_decision">): ChoixSamedi | null {
  switch (c.ckd_samedi_decision) {
    case null:
    case undefined:
      return null;
    case "ne_pas_renouveler":
      return "kill";
    case "doubler":
      return "double";
    default:
      return "keep";
  }
}

/**
 * Pré-rempli avec la proposition de l'OS (contrôle du samedi) : Kill, Double,
 * sinon Keep. Décisions finales : une demande d'arrêt → Kill pré-coché.
 */
export function choixSamediInitial(c: CompteSemaine, demande: DemandeArret | null = null): ChoixSamedi {
  const prise = decisionSamedi(c);
  if (prise) return prise;
  if (demande) return "kill";
  if (c.ckd_samedi_action === "ne_pas_renouveler") return "kill";
  if (c.ckd_samedi_action === "doubler") return "double";
  return "keep";
}

/** Une étape de « Validate » : décider une proposition existante, ou en créer une (choisi à la main) puis la décider. */
export type EtapeSamedi =
  | { op: "decider"; id: string; decision: "ne_pas_renouveler" | "doubler" | "garder" | "pas_maintenant" }
  | { op: "choisir"; action: "ne_pas_renouveler" | "doubler" };

/**
 * Ce que « Validate » fait pour un compte. Déjà décidé : rien. Keep : la
 * proposition de l'OS est refusée (Garder, ou Pas maintenant pour un Double).
 * Kill ou Double proposé par l'OS : il est décidé. Kill ou Double choisi à la
 * main (autre proposition, ou aucune) : l'autre proposition est refusée, une
 * proposition « à la main » est créée puis décidée.
 */
export function planSamedi(c: CompteSemaine, choix: ChoixSamedi): EtapeSamedi[] {
  if (c.ckd_samedi_decision || decisionSamedi(c)) return [];
  const id = c.ckd_samedi_id;
  const doubler = c.ckd_samedi_regle === "doubler";
  const refuser: EtapeSamedi[] = id ? [{ op: "decider", id, decision: doubler ? "pas_maintenant" : "garder" }] : [];
  if (choix === "repondre") return [];
  if (choix === "keep" || choix === "recreate" || choix === "pause" || choix === "reporter") return refuser;
  if (choix === "kill" || choix === "kill_np") {
    return id && !doubler && c.ckd_samedi_action === "ne_pas_renouveler"
      ? [{ op: "decider", id, decision: "ne_pas_renouveler" }]
      : [...refuser, { op: "choisir", action: "ne_pas_renouveler" }];
  }
  return id && doubler ? [{ op: "decider", id, decision: "doubler" }] : [...refuser, { op: "choisir", action: "doubler" }];
}

export async function choisirSamedi(compteId: string, action: "ne_pas_renouveler" | "doubler"): Promise<string> {
  const { data, error } = await supabase.rpc("samedi_choisir", { p_compte: compteId, p_action: action });
  if (error) throw error;
  return data as string;
}

export interface RecrueSansReaction {
  poster_id: string;
  nom: string | null;
  hm_nom: string | null;
  pays: string | null;
  compte_id: string | null;
  handle: string | null;
  cohorte_lundi: string;
  connecte: boolean;
  tiktok_trouve: boolean;
  start_warmup: boolean;
  abonnements: number | null;
  relances: number;
  derniere_relance: string | null;
  repondu_at: string | null;
}

/** Les recrues de la cohorte du lundi suivant, pas prêtes, relancées cette semaine sans réaction. */
export async function lireRecruesSansReaction(lundi: string): Promise<RecrueSansReaction[]> {
  const { data, error } = await supabase.rpc("samedi_recrues", { p_lundi: lundi });
  if (error) throw error;
  return (data ?? []) as RecrueSansReaction[];
}

/** Ce qui manque à une recrue, la 1re étape pas faite. */
export function manqueRecrue(r: Pick<RecrueSansReaction, "connecte" | "tiktok_trouve" | "start_warmup" | "abonnements">): "connexion" | "tiktok" | "warmup" | "follows" {
  if (!r.connecte) return "connexion";
  if (!r.start_warmup) return r.tiktok_trouve ? "warmup" : "tiktok";
  if (!r.tiktok_trouve) return "tiktok";
  return "follows";
}

// ---------------------------------------------------------------------------
// Décisions finales (0443) : les demandes d'arrêt attendent le samedi
// ---------------------------------------------------------------------------

/** « I want to stop », « STOP », un message classé stop, un persona refusé, ou Max (Onboarding posters). */
export interface DemandeArret {
  poster_id: string;
  source: "bouton" | "message" | "persona" | "manuel";
  raison: string | null;
  demande_at: string;
}

export async function lireDemandesArret(): Promise<DemandeArret[]> {
  const { data, error } = await supabase.rpc("demandes_arret_ouvertes");
  if (error) throw error;
  return (data ?? []) as DemandeArret[];
}

/** Max, depuis Onboarding posters : la personne va au samedi, Kill pré-coché (rien n'est arrêté). */
export async function demanderArretSamedi(posterId: string, raison: string | null): Promise<boolean> {
  const { data, error } = await supabase.rpc("demande_arret_noter", { p_poster: posterId, p_source: "manuel", p_raison: raison, p_reponse: null });
  if (error) throw error;
  return data === true;
}

/** Keep ou Postpone le samedi : la demande est classée, les relances reprennent. */
export async function garderMalgreDemande(posterId: string): Promise<void> {
  const { error } = await supabase.rpc("demande_arret_garder", { p_poster: posterId });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Prompt 26 : le Kill du samedi, Kill & pay ou Kill & don't pay, avec la fiche
// ---------------------------------------------------------------------------

export const RAISONS_SANS_PAIE = ["faux_liens", "mauvais_compte", "fraude", "zero_post", "autre"] as const;
export type RaisonSansPaie = (typeof RAISONS_SANS_PAIE)[number];

export interface FicheSamedi {
  posts: { jour: string; handle: string | null; url: string | null; vues: number | null; statut: string | null }[];
  nudges: { type: string; at: string; canaux: string[] | null; canal: string | null; texte: string | null; erreur: string | null }[];
  messages: { sens: "recu" | "envoye"; canal: string | null; at: string; texte: string | null; reponse?: string | null }[];
  historique: {
    cohorte: string | null;
    comptes: { handle: string | null; actif: boolean; cree: string }[];
    pauses: { debut: string; jusqu_au: string; raison: string | null }[];
    recreations?: number;
    kills_annules: number;
  };
  contrat: { id: string | null; url: string | null; freelance: string | null; profil?: string | null; tarif: number | null };
  /** 0454 : la conversation Upwork, le profil TikTok, le DM Slack, la carte du posteur dans l'OS. */
  liens?: { tiktok: string | null; slack: string | null; os: string | null };
  semaine: { faits: number; prevus: number; montant: number; action: string; raison: string | null; tarif?: number | null } | null;
  /** Les milestones financées lues par l'OS (l'état de la paie). */
  paie?: { jalons_lus_le: string | null; finances: { nom: string | null; montant: string | null; etat: string | null }[] } | null;
  needs_you?: { type: string; vu: string | null; pense: string | null }[];
  disputes?: { type: string; texte: string | null; recu_at: string }[];
  to_read?: { liste: string; texte: string | null; recu_at: string }[];
}

export async function lireFicheSamedi(posterId: string, lundi: string): Promise<FicheSamedi> {
  const { data, error } = await supabase.rpc("samedi_fiche", { p_poster: posterId, p_lundi: lundi });
  if (error) throw error;
  return data as FicheSamedi;
}

/** Kill & don't pay : la raison (obligatoire) et le montant en jeu, gardés pour la paie de lundi et Disputes. */
export async function noterKillSansPaie(posterId: string, lundi: string, raison: string, montant: number | null): Promise<void> {
  const { error } = await supabase.rpc("kill_sans_paie_noter", { p_poster: posterId, p_semaine: lundi, p_raison: raison, p_montant: montant });
  if (error) throw error;
}

/** 0484 : le brouillon du samedi (un choix par compte et par semaine, enregistré au clic). */
export interface BrouillonSamedi {
  choix: ChoixSamedi;
  raison: { code: string; detail: string } | null;
}

export async function lireBrouillonsSamedi(lundi: string): Promise<Map<string, BrouillonSamedi>> {
  const { data, error } = await supabase.rpc("samedi_brouillons_lire", { p_lundi: lundi });
  if (error) throw error;
  const rows = (data ?? []) as { compte_id: string; choix: ChoixSamedi; raison: BrouillonSamedi["raison"] }[];
  return new Map(rows.map((b) => [b.compte_id, { choix: b.choix, raison: b.raison ?? null }]));
}

export async function noterBrouillonSamedi(
  lundi: string,
  compteId: string,
  choix: ChoixSamedi,
  raison: BrouillonSamedi["raison"] = null,
): Promise<void> {
  const { error } = await supabase.rpc("samedi_brouillon_noter", { p_lundi: lundi, p_compte: compteId, p_choix: choix, p_raison: raison });
  if (error) throw error;
}
