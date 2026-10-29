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

export type ChoixJeudi = "nudge" | "recreate" | "rien";

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
}

export const FILTRES_VIDES: FiltresListe = { hm: "", pays: "", posts: "tous", shadowban: "tous", nom: "" };

export function filtrerComptes(liste: readonly CompteSemaine[], f: FiltresListe): CompteSemaine[] {
  const nom = f.nom.trim().toLowerCase();
  return liste.filter((c) => {
    if (f.hm && (c.hm_id ?? "aucune") !== f.hm) return false;
    if (f.pays && (c.pays ?? "") !== f.pays) return false;
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
  for (const c of liste) {
    hms.set(c.hm_id ?? "aucune", c.hm_nom ?? "—");
    if (c.pays) pays.add(c.pays);
  }
  return {
    hms: [...hms.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    pays: [...pays].sort(),
  };
}
