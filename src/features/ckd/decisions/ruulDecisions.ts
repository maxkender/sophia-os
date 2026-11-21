/**
 * 19/11 (Max) : Décisions pour les posteurs RUUL (0773). Un posteur Ruul n'a pas de contrat Upwork : son contrat, c'est
 * la signature sur le Hub. Ses pastilles Ruul (inscrit, KYC, banque, prêt, payable lundi), son contexte (emails envoyés,
 * relances Ruul, ses réponses, ses demandes au support), et son nudge du jeudi (email + bandeau, jamais de DM Slack).
 */
import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

export interface EvenementRuul { at: string; [k: string]: unknown }

export interface InfoRuul {
  poster_id: string;
  signe_at: string | null;
  inscrit: boolean;
  kyc: boolean;
  banque: boolean;
  pret: boolean;
  statut_api: string | null;
  tarif: number | null;
  emails: { objet: string | null; at: string; statut: string | null }[];
  relances: { etape: string | null; at: string; canaux: string[] | null; erreur: string | null }[];
  reponses: { canal: string | null; at: string; texte: string | null }[];
  demandes: { categorie: string | null; statut: string | null; at: string; source: string | null; texte: string | null }[];
  dernier_nudge: { at: string | null; canaux: string[] | null; erreur: string | null } | null;
}

export async function lireDecisionsRuul(posteurs: string[]): Promise<Map<string, InfoRuul>> {
  if (!posteurs.length) return new Map();
  const { data, error } = await supabase.rpc("decisions_ruul", { p_posteurs: posteurs });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as InfoRuul[]).map((r) => [r.poster_id, r]));
}

export interface BilanNudgeRuul { ok: boolean; envoyes?: number; deja?: number; email?: number; slack?: number; bandeau?: number; sans_canal?: number; erreurs?: string[]; error?: string }

/** Le nudge du jeudi des posteurs Ruul : email + bandeau sur le dashboard (fonction support). */
export async function nudgerRuul(lundi: string, comptes: string[]): Promise<BilanNudgeRuul> {
  if (!comptes.length) return { ok: true, envoyes: 0, deja: 0, erreurs: [] };
  const r = await invoke<BilanNudgeRuul>("support", { action: "nudge_jeudi_ruul", lundi, comptes });
  if (!r.ok) throw new Error(r.error ?? "nudge Ruul impossible");
  return r;
}

/** « Payable lundi » : Ruul ne paie que les comptes READY. */
export const payableLundi = (i: Pick<InfoRuul, "pret">) => i.pret;

/** Un email revenu (adresse invalide, refusé) : à corriger avant de compter dessus. */
export const emailRevenu = (statut: string | null | undefined) => /bounce|blocked|invalid|spam|error|echec/i.test(statut ?? "");

/** Un canal en pause (ex. les DM Slack) n'est pas un échec : on le dit simplement. */
export const enPause = (erreur: string | null | undefined) => /pause/i.test(erreur ?? "");

/** JJ/MM. */
export const jjmm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");

/** 21/11 (Max, point 5) : sur une carte Décisions Ruul, les absences, l'attente d'une réponse, un compte jamais trouvé. */
export interface PeriodeAbsence { debut: string; fin: string; raison: string | null; source: "absence" | "pause" | "panne" }

export interface CarteRuul {
  poster_id: string;
  absences: PeriodeAbsence[];
  attend_reponse: boolean;
  jamais_trouve: boolean;
}

export async function lireCartesRuul(posteurs: string[], lundi: string): Promise<Map<string, CarteRuul>> {
  if (!posteurs.length) return new Map();
  const { data, error } = await supabase.rpc("ruul_cartes_decisions", { p_posteurs: posteurs, p_lundi: lundi });
  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as CarteRuul[]).map((r) => [r.poster_id, r]));
}

const jours = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
const plus = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

/** Une absence (déclarée ou pause) de plus de 7 jours qui touche la semaine ou les 7 jours qui suivent. */
export function absenceLongue(c: CarteRuul | undefined, lundi: string): PeriodeAbsence | null {
  const samedi = plus(lundi, 5);
  return (c?.absences ?? []).find((a) => a.source !== "panne" && jours(a.debut, a.fin) > 7 && a.fin >= lundi && a.debut <= plus(samedi, 7)) ?? null;
}

/** Le choix imposé pour un posteur Ruul : Keep s'il est absent plus de 7 jours, s'il attend notre réponse, ou si son compte n'a jamais été trouvé. */
export function choixRuulImpose(c: CarteRuul | undefined, lundi: string): "keep" | null {
  if (!c) return null;
  return absenceLongue(c, lundi) || c.attend_reponse || c.jamais_trouve ? "keep" : null;
}

/** « Away du 20/11 au 23/11 (Holiday) » ; une panne : « Panne de notre côté le 20/11 ». */
export function texteAway(a: PeriodeAbsence): string {
  if (a.source === "panne") return `Panne de notre côté le ${jjmm(a.debut)} (jour compté comme fait)`;
  return `Away du ${jjmm(a.debut)} au ${jjmm(a.fin)}${a.raison ? ` (${a.raison})` : ""}`;
}
