import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

/**
 * Prompt 14, point 3 : payer depuis la liste de paie, par l'API Upwork. Tout
 * passe par la fonction `upwork` (actions paie_apercu et paie_payer) ; ici,
 * seulement les appels et les réglages.
 */
export interface PlanLigne {
  id: string;
  poster_id: string;
  poster_nom: string | null;
  action: string;
  contrat_id: string | null;
  statut: "pret" | "rien" | "lien" | "deja_payee" | "refuse";
  raison: string | null;
  approuver: { jalon_id: string; nom: string; montant: number; depot: number; sous_paiement: string | null } | null;
  financer: { mode: "existant" | "creer"; jalon_id: string | null; nom: string; montant: number; editer: boolean } | null;
  lien: "fermer" | "rembourser" | null;
  total: number;
  montant_trouve: number | null;
  /** Le mode (éteint, test, date) bloque l'envoi de cette ligne : la raison. */
  bloque: string | null;
  /** Après « Confirmer » : ce qui s'est passé. */
  resultat?: "paye" | "a_verifier" | "reessai" | "deja_payee" | "refuse" | "rien" | "lien" | "pret";
}

export interface Apercu {
  mode: "off" | "test" | "on";
  plafond_ligne: number;
  plafond_jour: number;
  lignes: PlanLigne[];
  total: number;
}

export async function apercuPaiement(semaine: string, ids: string[]): Promise<Apercu> {
  const r = await invoke<Apercu & { ok: boolean; error?: string }>("upwork", { action: "paie_apercu", semaine, ids });
  if (!r.ok) throw new Error(r.error ?? "aperçu impossible");
  return r;
}

export async function payer(semaine: string, ids: string[]): Promise<PlanLigne[]> {
  const r = await invoke<{ ok: boolean; lignes?: PlanLigne[]; error?: string }>("upwork", {
    action: "paie_payer",
    semaine,
    ids,
    confirmer: true,
  });
  if (!r.ok || !r.lignes) throw new Error(r.error ?? "paiement impossible");
  return r.lignes;
}

export interface EtatPaiementApi {
  id: string;
  paie_semaine_id: string;
  poster_id: string;
  statut: "en_cours" | "paye" | "a_verifier" | "deja_payee";
  jalon_approuve: string | null;
  montant_approuve: number | null;
  jalon_finance: string | null;
  montant_finance: number | null;
  financement: string | null;
  erreur: string | null;
  par_nom: string | null;
  created_at: string;
  updated_at: string;
}

/** Les paiements API de la semaine, par ligne de paie. */
export async function lireEtatPaiementsApi(semaine: string): Promise<Map<string, EtatPaiementApi>> {
  const { data, error } = await supabase.rpc("paie_api_etat", { p_lundi: semaine });
  if (error) throw error;
  return new Map(((data ?? []) as EtatPaiementApi[]).map((e) => [e.paie_semaine_id, e]));
}

/** Après vérification à la main sur Upwork : libère une ligne « à vérifier » (admin). */
export async function libererPaiementApi(id: string, raison: string): Promise<void> {
  const { error } = await supabase.rpc("paie_api_liberer", { p_id: id, p_raison: raison });
  if (error) throw error;
}

export interface ReglagesPaiementApi {
  mode: "off" | "test" | "on";
  contrats_test: string[];
  test_des: string;
  tous_des: string;
  plafond_ligne: number;
  plafond_jour: number;
}

export async function lireReglagesPaiementApi(): Promise<ReglagesPaiementApi> {
  const { data, error } = await supabase
    .from("reglages")
    .select("cle, valeur")
    .in("cle", ["paie_api", "paie_plafond_ligne", "paie_plafond_jour"]);
  if (error) throw error;
  const v = Object.fromEntries((data ?? []).map((r) => [r.cle as string, r.valeur]));
  const api = (v.paie_api ?? {}) as Partial<ReglagesPaiementApi>;
  return {
    mode: api.mode === "test" || api.mode === "on" ? api.mode : "off",
    contrats_test: Array.isArray(api.contrats_test) ? api.contrats_test.map(String) : [],
    test_des: api.test_des ?? "2026-11-02",
    tous_des: api.tous_des ?? "2026-11-09",
    plafond_ligne: Number(v.paie_plafond_ligne ?? 30),
    plafond_jour: Number(v.paie_plafond_jour ?? 5000),
  };
}

export async function enregistrerReglagesPaiementApi(r: ReglagesPaiementApi): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const par = { updated_by: auth.user?.id ?? null, updated_at: new Date().toISOString() };
  const { error } = await supabase.from("reglages").upsert([
    {
      cle: "paie_api",
      valeur: { mode: r.mode, contrats_test: r.contrats_test, test_des: r.test_des, tous_des: r.tous_des },
      ...par,
    },
    { cle: "paie_plafond_ligne", valeur: r.plafond_ligne, ...par },
    { cle: "paie_plafond_jour", valeur: r.plafond_jour, ...par },
  ]);
  if (error) throw error;
}

/** Prompt 21, B3-B6 : la paie automatique d'une semaine (table paie_auto, 0416). */
export interface EtatPaieAuto {
  semaine: string;
  statut: "attente" | "en_cours" | "fini" | "arrete";
  lance_at: string | null;
  canari_ok: boolean | null;
  canari_detail: { poster?: string | null; contrat?: string | null; ecarts?: string[]; aucun?: string } | null;
  arret_raison: string | null;
  dernier_bilan: { payees?: number; reessais?: number; a_verifier?: number; refusees?: number } | null;
  maj_at: string;
}

export async function lireEtatPaieAuto(semaine: string): Promise<EtatPaieAuto | null> {
  const { data, error } = await supabase.from("paie_auto").select("*").eq("semaine", semaine).maybeSingle();
  if (error) throw error;
  return (data as EtatPaieAuto | null) ?? null;
}

/** « Pay now » : la paie automatique part tout de suite (canari d'abord), si paie_api est sur « on ». */
export async function lancerPaieAuto(): Promise<{ ignore?: string; payees?: number; canari?: unknown }> {
  const r = await invoke<{ ok: boolean; error?: string; ignore?: string; payees?: number; canari?: unknown }>("upwork", {
    action: "paie_auto_lancer",
    confirmer: true,
  });
  if (!r.ok && r.error) throw new Error(r.error);
  return r;
}
