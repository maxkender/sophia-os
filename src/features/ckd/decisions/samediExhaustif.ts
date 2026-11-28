/**
 * 0464 : la masterlist du samedi exhaustive. La couverture (chaque posteur actif
 * avec un compte actif, et la raison s'il n'est pas dans la liste), les posteurs
 * toujours montrés (demande d'arrêt, reporté 2 fois, Kill Saturday, No channel),
 * les contrats Upwork sans posteur, et ce que ferait Validate en mode Test.
 */
import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

export interface LigneCouverture {
  poster_id: string;
  nom: string | null;
  comptes: number;
  /** null : doit être dans la liste ; ruul, sans_compte, pas_perso : exclu, avec la raison. */
  raison: "ruul" | "sans_compte" | "pas_perso" | null;
}

export async function lireCouverture(lundi: string): Promise<LigneCouverture[]> {
  const { data, error } = await supabase.rpc("samedi_couverture", { p_lundi: lundi });
  if (error) throw error;
  return (data ?? []) as LigneCouverture[];
}

export interface Couverture {
  montres: number;
  posteurs: number;
  comptes: number;
  /** Les posteurs actifs avec un compte actif qui ne sont pas dans la liste. */
  absents: { poster_id: string; nom: string | null; raison: string }[];
  /** Les posteurs actifs sans aucun compte actif (pas comptés dans N). */
  sansCompte: number;
  /**
   * 26/11 (Max) : les posteurs en set-up (pas prêts : aucun compte dont la 1re semaine de posts a commencé). Ils
   * restent dans la liste (onglet des recrues, Keep), mais ne sont pas comptés dans N ni dans « montrés ».
   */
  enSetup: number;
}

/**
 * « n sur N posteurs actifs (M comptes) » et la liste « Not in the list ». `enSetup` : les posteurs pas encore
 * prêts (cohorte à venir), comptés à part.
 */
export function calculerCouverture(
  lignes: LigneCouverture[],
  posteursListe: Set<string>,
  enSetup: ReadonlySet<string> = new Set(),
): Couverture {
  const avecCompte = lignes.filter((l) => l.comptes > 0);
  const actifs = avecCompte.filter((l) => !enSetup.has(l.poster_id));
  return {
    montres: actifs.filter((l) => posteursListe.has(l.poster_id)).length,
    posteurs: actifs.length,
    comptes: actifs.reduce((n, l) => n + l.comptes, 0),
    absents: actifs
      .filter((l) => !posteursListe.has(l.poster_id))
      .map((l) => ({ poster_id: l.poster_id, nom: l.nom, raison: l.raison ?? "inconnue" }))
      .sort((a, b) => a.raison.localeCompare(b.raison) || (a.nom ?? "").localeCompare(b.nom ?? "")),
    sansCompte: lignes.filter((l) => l.comptes === 0).length,
    enSetup: avecCompte.length - actifs.length,
  };
}

/**
 * 26/11 : les posteurs en set-up pour le samedi du lundi `lundi` : tous leurs comptes de la liste sont dans une
 * cohorte qui n'a pas commencé (onglet des recrues). Un posteur qui a un compte déjà lancé n'en fait pas partie.
 */
export function posteursEnSetup(
  comptes: readonly { poster_id: string; cohorte_lundi: string | null }[],
  lundi: string,
): Set<string> {
  const lances = new Set<string>();
  const avenir = new Set<string>();
  for (const c of comptes) {
    if (c.cohorte_lundi && c.cohorte_lundi > lundi) avenir.add(c.poster_id);
    else lances.add(c.poster_id);
  }
  return new Set([...avenir].filter((p) => !lances.has(p)));
}

export type RaisonForce = "demande_arret" | "reporte_2" | "kill_jeudi" | "sans_canal";
export interface Force {
  poster_id: string;
  raison: RaisonForce;
  detail: string | null;
  depuis: string | null;
}

export async function lireForces(lundi: string): Promise<Map<string, Force[]>> {
  const { data, error } = await supabase.rpc("samedi_forces", { p_lundi: lundi });
  if (error) throw error;
  const m = new Map<string, Force[]>();
  for (const f of (data ?? []) as Force[]) m.set(f.poster_id, [...(m.get(f.poster_id) ?? []), f]);
  return m;
}

/** 0513 : les recrues à voir en premier cette semaine (décision de Max), avec la raison. */
export async function lirePriorites(lundi: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc("samedi_priorites_liste", { p_lundi: lundi });
  if (error) throw error;
  return new Map(((data ?? []) as { poster_id: string; raison: string }[]).map((p) => [p.poster_id, p.raison]));
}

export interface ContratSansPosteur {
  contrat_id: string;
  nom: string | null;
  titre: string | null;
  type: string | null;
  debut_at: string | null;
  dernier_message: { at?: string; texte?: string; de?: "posteur" | "nous" } | null;
  salon_lu_at: string | null;
  finances: { nom: string | null; depot: number | null; etat: string }[];
  jalons_lus_at: string | null;
  proposition: "hm" | "relier" | "ancien" | "autre";
  raison: string;
}

export async function lireContratsSansPosteur(): Promise<ContratSansPosteur[]> {
  const { data, error } = await supabase.rpc("contrats_sans_posteur");
  if (error) throw error;
  return (data ?? []) as ContratSansPosteur[];
}

export async function relireContratsSansPosteur(): Promise<{ contrats: number; jalons: number; salons: number }> {
  const r = await invoke<{ ok: boolean; error?: string; contrats: number; jalons: number; salons: number }>("upwork", { action: "contrats_sans_posteur_lire" });
  if (r.error) throw new Error(r.error);
  return r;
}

/** Un seul clic, après confirmation : refusé si le test de fermeture n'est pas bon ou si une milestone est financée. */
export async function fermerContratSansPosteur(contratId: string): Promise<void> {
  const r = await invoke<{ ok: boolean; error?: string }>("upwork", { action: "contrat_sans_posteur_fermer", contrat_id: contratId });
  if (!r.ok) throw new Error(r.error ?? "fermeture refusée");
}

/** Le mode de « Full stop » (arret_auto) : en Test, Validate ne fait que simuler. */
export async function lireModeArret(): Promise<"off" | "test" | "on"> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "arret_auto").maybeSingle();
  if (error) throw error;
  // Comme la fonction upwork (lireModeAuto) : off ou on, tout le reste vaut test.
  const v = data?.valeur;
  return v === "off" || v === "on" ? v : "test";
}

export interface LigneSimulation {
  poster_id: string;
  nom: string | null;
  choix: "kill" | "kill_np";
  desactivation: string;
  slack: string;
  fermeture: string;
  remboursement: string;
}

export async function simulerValidate(
  lundi: string,
  kills: { poster_id: string; compte_id: string | null; choix: "kill" | "kill_np" }[],
): Promise<LigneSimulation[]> {
  if (kills.length === 0) return [];
  const { data, error } = await supabase.rpc("samedi_simulation", { p_lundi: lundi, p_kills: kills });
  if (error) throw error;
  return (data ?? []) as LigneSimulation[];
}
