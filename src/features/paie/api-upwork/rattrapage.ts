/**
 * 19/11 (Max) : les lignes de paie Upwork bloquées par le nom de la semaine des milestones (cohortes décalées).
 * L'OS propose une action par ligne ; rien ne part sans le clic de Max (fonction upwork, rattrapage_executer).
 */
import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

export type ActionRattrapage = "approuver" | "marquer_payee" | "financer_main" | "garder" | "rien" | "a_voir";

export interface LigneRattrapage {
  id: string;
  semaine: string;
  poster_id: string;
  poster_nom: string | null;
  contrat_id: string | null;
  action: ActionRattrapage;
  jalon_nom: string | null;
  jalon_etat: string | null;
  jalon_montant: number | null;
  du: number;
  faits: number;
  prevus: number;
  proposition: string;
  statut: "propose" | "fait" | "erreur" | "ignore";
  resultat: string | null;
  montant_paye: number | null;
  message_statut: string | null;
  decide_at: string | null;
}

export async function lireRattrapages(): Promise<LigneRattrapage[]> {
  const { data, error } = await supabase.rpc("paie_rattrapages_lire", {});
  if (error) throw new Error(error.message);
  return ((data ?? []) as LigneRattrapage[]).map((l) => ({
    ...l,
    du: Number(l.du ?? 0),
    jalon_montant: l.jalon_montant === null ? null : Number(l.jalon_montant),
    montant_paye: l.montant_paye === null ? null : Number(l.montant_paye),
  }));
}

export interface BilanRattrapage {
  ok: boolean;
  faits?: number;
  messages?: number;
  reste?: number;
  erreurs?: { id: string; raison?: string }[];
  error?: string;
}

export async function executerRattrapage(semaine: string): Promise<BilanRattrapage> {
  const r = await invoke<BilanRattrapage>("upwork", { action: "rattrapage_executer", semaine, confirmer: true });
  if (!r.ok) throw new Error(r.error ?? "rattrapage impossible");
  return r;
}

/** Les actions que le clic exécute (le reste se fait à la main sur Upwork). */
export const ACTIONS_AUTO: ActionRattrapage[] = ["approuver", "financer_main", "marquer_payee", "garder"];

/** Le récapitulatif d'une semaine : ce qui part (argent), ce qui est seulement noté, ce qui reste à la main. */
export function recap(lignes: LigneRattrapage[]) {
  const ouvertes = lignes.filter((l) => l.statut === "propose" || l.statut === "erreur");
  const somme = (a: ActionRattrapage) => ouvertes.filter((l) => l.action === a);
  const aPayer = [...somme("approuver"), ...somme("financer_main")];
  return {
    a_payer: aPayer.length,
    montant: Math.round(aPayer.reduce((s, l) => s + (l.action === "approuver" ? (l.jalon_montant ?? l.du) : l.du), 0) * 100) / 100,
    deja_payees: somme("marquer_payee").length,
    gardees: somme("garder").length,
    a_la_main: ouvertes.filter((l) => l.action === "a_voir").length,
    executables: ouvertes.filter((l) => ACTIONS_AUTO.includes(l.action)).length,
    messages_en_attente: lignes.filter((l) => l.statut === "fait" && (l.action === "approuver" || l.action === "financer_main") && !l.message_statut).length,
  };
}

export const LIBELLE_ACTION: Record<ActionRattrapage, string> = {
  approuver: "Approuver la milestone",
  marquer_payee: "Déjà payée sur Upwork : marquer payée",
  financer_main: "Paiement direct (rien de financé)",
  garder: "0 post : garder pour sa prochaine semaine",
  rien: "Rien à faire",
  a_voir: "À voir",
};
