/**
 * 23/11 (Max) : le plan de paie d'une semaine (carte « Plan W47 ») : chaque jalon à libérer par son NUMÉRO, libérer
 * puis fermer, Grok, bloqué, et les kills « n'a pas posté ». Rien ne part sans le clic de Max (fonction upwork,
 * plan_paie_executer). Le récap et les contrats ouverts sans posteur actif : lecture seule.
 */
import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

export type GroupePlan = "liberer" | "liberer_fermer" | "grok" | "bloque" | "kill";

export interface LignePlanPaie {
  id: string;
  groupe: GroupePlan;
  posteur: string;
  contrat_id: string;
  jalon_id: string | null;
  fermer: boolean;
  jamais_fermer: boolean;
  note: string | null;
  statut: string;
  resultat: string | null;
  jalon_libere: string | null;
  montant: number | null;
  /** Relu chez Upwork (plan_paie_lire). */
  etat?: "pret" | "deja_paye" | "pas_finance" | "a_voir" | "bloque" | "fait";
  raison?: string;
  jalon?: { id: string; nom: string; etat: string; montant: number | null };
  semaine_payee?: { payee: boolean; du: number };
}

export const GROUPES: { cle: GroupePlan; titre: string; bouton: string | null }[] = [
  { cle: "liberer", titre: "1. Libérer maintenant (déjà financé)", bouton: "Libérer" },
  { cle: "liberer_fermer", titre: "1 bis. Libérer puis fermer le contrat", bouton: "Libérer puis fermer" },
  { cle: "grok", titre: "2. Jalons W47 de Grok (dès qu'ils sont financés)", bouton: "Libérer" },
  { cle: "kill", titre: "4. Kill : n'a pas posté (fermeture seulement si W47 payée)", bouton: "Killer" },
  { cle: "bloque", titre: "3. Ne rien libérer", bouton: null },
];

const FINIS = ["libere", "ferme", "deja_paye", "kille_ferme"];

/** Une ligne est cochable si son clic peut encore faire quelque chose (jamais une ligne bloquée ou finie). */
export function executable(l: LignePlanPaie): boolean {
  if (l.groupe === "bloque" || FINIS.includes(l.statut)) return l.groupe === "liberer_fermer" && l.statut === "libere" && l.fermer && !l.jamais_fermer;
  if (l.groupe === "kill") return true;
  if (l.statut === "en_cours" || l.statut === "erreur") return false;
  return l.etat === "pret";
}

export async function lirePlan(plan = "W47"): Promise<LignePlanPaie[]> {
  const r = await invoke<{ ok: boolean; lignes?: LignePlanPaie[]; error?: string }>("upwork", { action: "plan_paie_lire", plan });
  if (!r.ok) throw new Error(r.error ?? "plan illisible");
  return r.lignes ?? [];
}

export async function executerPlan(ids: string[], plan = "W47") {
  const r = await invoke<{ ok: boolean; resultats?: Record<string, unknown>[]; error?: string }>("upwork", {
    action: "plan_paie_executer", plan, ids, confirmer: true,
  });
  if (!r.ok) throw new Error(r.error ?? "exécution impossible");
  return r.resultats ?? [];
}

export interface RecapPlan {
  plan: string;
  semaine: string | null;
  lignes: LignePlanPaie[];
  paie: { total: number; payees: number; exclues: number; a_verifier: number; a_payer: number } | null;
  a_decider: string[];
}

export async function lireRecap(plan = "W47"): Promise<RecapPlan> {
  const { data, error } = await supabase.rpc("paie_recap_plan", { p_plan: plan });
  if (error) throw new Error(error.message);
  return data as RecapPlan;
}

export interface ContratOuvert {
  contrat_id: string;
  freelancer: string | null;
  titre: string | null;
  cache_lu_at: string | null;
  jalons: { id: string; nom: string; etat: string; montant: number }[];
  total: number;
}

export async function lireContratsOuverts(): Promise<ContratOuvert[]> {
  const { data, error } = await supabase.rpc("paie_contrats_ouverts_sans_posteur");
  if (error) throw new Error(error.message);
  return ((data ?? []) as ContratOuvert[]).map((c) => ({ ...c, total: Number(c.total ?? 0) }));
}

/** Le CSV des contrats ouverts sans posteur actif (un jalon par ligne ; contrat sans jalon : une ligne vide). */
export function csvContrats(cs: readonly ContratOuvert[]): string {
  const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lignes = [["contrat_id", "freelancer", "titre", "jalon_id", "jalon_nom", "jalon_etat", "jalon_montant", "total_contrat", "cache_lu_at"].join(";")];
  for (const c of cs) {
    const js = c.jalons.length ? c.jalons : [null];
    for (const j of js) {
      lignes.push([c.contrat_id, c.freelancer, c.titre, j?.id, j?.nom, j?.etat, j?.montant, c.total, c.cache_lu_at].map(q).join(";"));
    }
  }
  return lignes.join("\n");
}
