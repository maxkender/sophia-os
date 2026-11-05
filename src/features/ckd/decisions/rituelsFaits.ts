import { supabase } from "@/lib/supabase/client";

/**
 * 0540 (5/11) : un rituel validé (Send du jeudi, Validate du samedi, check du
 * dimanche) reste « fait » jusqu'au même jour de la semaine suivante.
 */
export type RituelSemaine = "jeudi" | "samedi" | "dimanche";

export interface RituelFait {
  id: string;
  rituel: RituelSemaine;
  lundi: string;
  fait_at: string;
  resume: Record<string, unknown>;
}

/** Jour ISO (lundi = 1) de chaque rituel. */
const JOUR_ISO: Record<RituelSemaine, number> = { jeudi: 4, samedi: 6, dimanche: 7 };

const jourIso = (date: string) => {
  const j = new Date(`${date}T12:00:00Z`).getUTCDay();
  return j === 0 ? 7 : j;
};

const decaler = (date: string, jours: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
};

/** Le cycle d'un rituel : du dernier jour du rituel (aujourd'hui compris) au suivant. */
export function cycleRituel(rituel: RituelSemaine, aujourdhui: string): { debut: string; prochain: string } {
  const recul = (jourIso(aujourdhui) - JOUR_ISO[rituel] + 7) % 7;
  const debut = decaler(aujourdhui, -recul);
  return { debut, prochain: decaler(debut, 7) };
}

/** La date (Paris) d'un instant. */
export function dateParis(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Le rituel a-t-il été fait depuis le début du cycle en cours ? (le plus récent) */
export function faitDansCycle(liste: readonly RituelFait[], rituel: RituelSemaine, aujourdhui: string): RituelFait | null {
  const { debut } = cycleRituel(rituel, aujourdhui);
  return (
    [...liste]
      .filter((r) => r.rituel === rituel && dateParis(r.fait_at) >= debut)
      .sort((a, b) => b.fait_at.localeCompare(a.fait_at))[0] ?? null
  );
}

export async function lireRituelsFaits(): Promise<RituelFait[]> {
  const { data, error } = await supabase.rpc("rituels_faits_lire", {});
  if (error) throw error;
  return (data ?? []) as RituelFait[];
}

export async function marquerRituelFait(rituel: RituelSemaine, lundi: string, resume: Record<string, unknown> = {}): Promise<void> {
  const { error } = await supabase.rpc("rituel_marquer_fait", { p_rituel: rituel, p_lundi: lundi, p_resume: resume });
  if (error) throw error;
}

/** 0540 : Recreate d'un compte non recommandé (il fait des vues) : ajouté à la liste Shadowban, puis le parcours habituel. */
export async function recreerManuel(compteId: string, vues: number | null): Promise<void> {
  const { error } = await supabase.rpc("ckd_recreer_manuel", { p_compte: compteId, p_vues: vues });
  if (error) throw error;
}

/** Les vues d'un compte, pour la confirmation : la médiane de ses derniers posts mesurés. */
export function vuesCompte(vues: readonly { vues: number | null }[]): number | null {
  const v = vues.map((x) => x.vues).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : Math.round((v[m - 1]! + v[m]!) / 2);
}
