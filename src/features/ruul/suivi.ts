/**
 * 21/11 (Max, point 8) : la page Ruul, par posteur : étape (inscrit, identité vérifiée, banque, READY), dernier email
 * (adresse, livré ou non), dernier nudge et son canal, STOP, paie prévue au prochain lot et pourquoi. En haut : les
 * alertes (emails refusés, aucun canal qui marche, comptes jamais trouvés). RPC ruul_suivi (0808).
 */
import { supabase } from "@/lib/supabase/client";

export type EtapeRuul = "inscription" | "identite" | "banque" | "ready";

export interface LigneSuiviRuul {
  poster_id: string;
  nom: string | null;
  handle: string | null;
  etape: EtapeRuul;
  identite_refusee: boolean | null;
  adresse: string | null;
  dernier_email: { objet: string | null; at: string; destinataire: string; statut: string | null; livre: boolean } | null;
  dernier_nudge: { at: string; envoye: boolean; canaux: string[] | null; erreur: string | null } | null;
  stop_at: string | null;
  paie: { semaine: string; montant: number; statut: string; pourquoi: string | null } | null;
  jamais_trouve: boolean;
  slack_ok: boolean;
}

export interface AlertesRuul {
  emails_refuses: number;
  emails_refuses_7j: number;
  sans_email: number;
  aucun_canal: number;
  jamais_trouves: number;
}

export interface SuiviRuul {
  posteurs: LigneSuiviRuul[];
  alertes: AlertesRuul;
}

export async function lireSuiviRuul(): Promise<SuiviRuul> {
  const { data, error } = await supabase.rpc("ruul_suivi");
  if (error) throw new Error(error.message);
  const d = (data ?? null) as SuiviRuul | null;
  return d ?? { posteurs: [], alertes: { emails_refuses: 0, emails_refuses_7j: 0, sans_email: 0, aucun_canal: 0, jamais_trouves: 0 } };
}

export const ETAPES: Record<EtapeRuul, string> = {
  inscription: "Pas inscrit",
  identite: "Inscrit",
  banque: "Identité vérifiée",
  ready: "READY",
};

/** Le canal du dernier nudge, en clair (le bandeau seul ne compte pas comme « envoyé »). */
export function canalNudge(n: LigneSuiviRuul["dernier_nudge"]): string {
  if (!n) return "—";
  const c = (n.canaux ?? []).filter((x) => x !== "dashboard");
  if (!n.envoye || !c.length) return (n.canaux ?? []).includes("dashboard") ? "bandeau seulement (non envoyé)" : "non envoyé";
  return c.join(" + ") + ((n.canaux ?? []).includes("dashboard") ? " + bandeau" : "");
}

export function filtrerSuivi(l: LigneSuiviRuul[], filtre: "tous" | "pas_ready" | "probleme"): LigneSuiviRuul[] {
  if (filtre === "pas_ready") return l.filter((x) => x.etape !== "ready");
  if (filtre === "probleme") return l.filter((x) => !x.adresse || (x.dernier_email && !x.dernier_email.livre) || x.jamais_trouve || (x.dernier_nudge && !x.dernier_nudge.envoye));
  return l;
}
