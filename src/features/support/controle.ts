import { supabase } from "@/lib/supabase/client";

import { appeler } from "./api";

/** 13/11 (Max) : la page « Contrôle » (réglage `controle`, migration 0711). */

export type Mode = "eteint" | "proposer" | "agir";

export interface ReglageControle {
  stop: boolean;
  agents: Record<string, Mode>;
  canaux: Record<string, boolean>;
  actions: Record<string, Mode>;
  pay: { plafond_milestone: number; plafond_jour: number };
}

export interface LigneJournal {
  id: string;
  at: string;
  qui: string;
  quoi: string;
  mode: "agir" | "proposer" | "bloque";
  poster_id: string | null;
  nom: string | null;
  canal: string | null;
  montant: number | null;
  resultat: string | null;
  annulable: boolean;
  annule_at: string | null;
  source: "journal" | "bot_actions";
}

export interface EtatControle {
  reglage: ReglageControle;
  compteurs: Record<string, number>;
  propositions: Record<string, number>;
  journal: LigneJournal[];
}

export interface Proposition {
  id: string;
  at: string;
  qui: string;
  quoi: string;
  poster_id: string | null;
  canal: string | null;
  resultat: string | null;
  details: { action?: string; valeur?: string | null };
}

export const AGENTS: readonly { cle: string; libelle: string; detail: string }[] = [
  { cle: "cerveau_support", libelle: "Cerveau du support", detail: "Répond aux posteurs (Help, Slack, email, Upwork) et fait les actions ci-dessous." },
  { cle: "new_cohort_bot", libelle: "New Cohort Bot", detail: "Crée et suit les problèmes de la nouvelle cohorte." },
  { cle: "control_bot", libelle: "Auditeur (Control BOT)", detail: "Relit, signale ; ses « faire » passent par ici." },
  { cle: "pay_bot", libelle: "Pay BOT", detail: "Finance les milestones de la liste « à financer », dans les plafonds ci-dessous." },
  { cle: "ruul_bot", libelle: "Ruul Bot", detail: "Réinvite dans Ruul et règle sa file ; n'écrit jamais aux posteurs." },
];

export const LIBELLES_ACTIONS: Record<string, string> = {
  lien_mot_de_passe: "Envoyer le lien « choisir mon mot de passe »",
  lien_slack: "Donner le lien Slack",
  pseudo_tiktok: "Changer le @ TikTok",
  email_ruul: "Changer l'email Ruul",
  invitation_ruul: "Réinviter dans Ruul",
  arret: "Transmettre un STOP",
  renvoi_parrainage: "Renvoyer une invitation de parrainage",
  prevenir_max: "Prévenir Max d'un bug",
  ticket_os: "Créer un ticket OS (#a-os-tickets)",
  ticket_regle_prevenir: "Prévenir le posteur quand le ticket est réglé",
};

export const CANAUX: readonly { cle: string; libelle: string }[] = [
  { cle: "help", libelle: "Help (dashboard)" },
  { cle: "slack", libelle: "Slack" },
  { cle: "email", libelle: "Email" },
  { cle: "upwork", libelle: "Upwork" },
];

export async function lireControle(): Promise<EtatControle> {
  const { data, error } = await supabase.rpc("controle_lire");
  if (error) throw new Error(error.message);
  return data as EtatControle;
}

export async function regler(chemin: string[], valeur: unknown): Promise<void> {
  const { data, error } = await supabase.rpc("controle_regler", { p_chemin: chemin, p_valeur: valeur });
  if (error) throw new Error(error.message);
  const r = data as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error ?? "réglage refusé");
}

export async function annuler(id: string): Promise<void> {
  const { data, error } = await supabase.rpc("journal_annuler", { p_id: id });
  if (error) throw new Error(error.message);
  const r = data as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(r.error ?? "pas annulable");
}

/** Les actions proposées par le bot (mode « proposer ») pas encore faites ni ignorées. */
export async function lirePropositions(): Promise<Proposition[]> {
  const { data, error } = await supabase.from("journal_auto")
    .select("id, at, qui, quoi, poster_id, canal, resultat, details")
    .eq("mode", "proposer").is("annule_at", null).not("details->>action", "is", null).is("details->>fait", null)
    .order("at", { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as Proposition[];
}

export const traiterProposition = (id: string, faire: boolean) =>
  appeler<{ ok: boolean; resultat?: string; error?: string }>({ action: "proposition", id, faire });

/** Les actions à montrer : celles du réglage, dans l'ordre connu d'abord. */
export function listeActions(r: ReglageControle): string[] {
  const connues = Object.keys(LIBELLES_ACTIONS);
  return [...connues.filter((a) => a in r.actions || a.startsWith("ticket")), ...Object.keys(r.actions).filter((a) => !connues.includes(a))];
}
