import { supabase } from "@/lib/supabase/client";

/**
 * Parcours Ruul, point 11 : la vue visuelle. Par posteur, une ligne de pastilles
 * (Compte · Connecté · TikTok · Warm-up 5+ · Slack · Invité Ruul · Ruul Active ·
 * It's done · Prêt · Poste), la dernière et la prochaine relance, et 3 filtres.
 * Les données : ruul_parcours_etat (0688), la même lecture que le moteur.
 */

export interface EnvoiParcours {
  cle: string;
  type: string;
  at: string;
  ok: boolean;
}

export interface EtatParcoursRuul {
  poster_id: string;
  prenom: string | null;
  login: string | null;
  email: string | null;
  cohorte_lundi: string | null;
  cree_at: string;
  premiere_connexion_at: string | null;
  handle: string | null;
  tiktok_existe: boolean | null;
  warmup_started_at: string | null;
  abonnements: number | null;
  slack_user_id: string | null;
  ruul_statut: string | null;
  ruul_compte: string | null;
  ruul_email_a_at: string | null;
  ruul_email_b_at: string | null;
  relances_stop_at: string | null;
  posts: number;
  derniere_activite: string | null;
  envois: EnvoiParcours[];
}

export const lireParcoursRuul = async (): Promise<EtatParcoursRuul[]> => {
  const { data, error } = await supabase.rpc("ruul_parcours_etat" as never);
  if (error) throw new Error(error.message);
  return (data ?? []) as EtatParcoursRuul[];
};

export const FOLLOWS_MIN = 5;
export const RUUL_MAX = 6;
const JOUR = 86_400_000;

export type ClePastille = "compte" | "connecte" | "tiktok" | "warmup" | "slack" | "invite" | "active" | "done" | "pret" | "poste";

export const PASTILLES: { cle: ClePastille; libelle: string }[] = [
  { cle: "compte", libelle: "Compte" },
  { cle: "connecte", libelle: "Connecté" },
  { cle: "tiktok", libelle: "TikTok" },
  { cle: "warmup", libelle: "Warm-up 5+" },
  { cle: "slack", libelle: "Slack" },
  { cle: "invite", libelle: "Invité Ruul" },
  { cle: "active", libelle: "Ruul Active" },
  { cle: "done", libelle: "It's done" },
  { cle: "pret", libelle: "Prêt" },
  { cle: "poste", libelle: "Poste" },
];

const ruulFini = (e: EtatParcoursRuul) => e.ruul_statut === "pret" || e.ruul_statut === "paye_1x";
const warmupOk = (e: EtatParcoursRuul) => !!e.warmup_started_at && (e.abonnements ?? 0) >= FOLLOWS_MIN;
export const estPret = (e: EtatParcoursRuul) =>
  !!e.premiere_connexion_at && e.tiktok_existe === true && warmupOk(e) && !!e.slack_user_id && ruulFini(e);

export function pastilles(e: EtatParcoursRuul): Record<ClePastille, boolean> {
  const invite = !!e.ruul_compte || e.ruul_statut === "invite" || ruulFini(e) || !!e.ruul_email_a_at || !!e.ruul_email_b_at;
  return {
    compte: true,
    connecte: !!e.premiere_connexion_at,
    tiktok: e.tiktok_existe === true,
    warmup: warmupOk(e),
    slack: !!e.slack_user_id,
    invite,
    active: e.ruul_compte === "active",
    done: ruulFini(e),
    pret: estPret(e),
    poste: e.posts > 0,
  };
}

export const LIBELLES_ENVOI: Record<string, string> = {
  bienvenue: "Bienvenue",
  jamais_connecte: "Jamais connecté",
  tiktok: "TikTok",
  warmup: "Warm-up",
  slack: "Slack",
  ruul: "Ruul pas prêt",
  report: "Report d'une semaine",
  demain: "You start tomorrow",
  desactivation: "Désactivation",
  carte_ruul: "Carte Ruul jamais fini",
};

export function derniereRelance(e: EtatParcoursRuul): EnvoiParcours | null {
  const ok = e.envois.filter((x) => x.ok && x.type !== "carte_ruul");
  return ok.length ? ok[ok.length - 1] : null;
}

const envoye = (e: EtatParcoursRuul, cle: string) => e.envois.some((x) => x.ok && x.cle === cle);

/**
 * La prochaine relance prévue (même ordre que le moteur : une par étape, Ruul
 * tous les 2 jours, 6 au plus) ; `le` : la date au plus tôt quand on la connaît.
 */
export function prochaineRelance(e: EtatParcoursRuul, maintenant: Date): { type: string; le: string | null } | null {
  if (e.relances_stop_at) return null;
  const t = maintenant.getTime();
  const iso = (ms: number) => new Date(Math.max(ms, t)).toISOString();
  if (e.cohorte_lundi) {
    if (!e.premiere_connexion_at) {
      if (!envoye(e, "jamais_connecte")) return { type: "jamais_connecte", le: iso(new Date(e.cree_at).getTime() + JOUR) };
    } else {
      const co = new Date(e.premiere_connexion_at).getTime();
      if (e.tiktok_existe !== true && !envoye(e, "tiktok")) return { type: "tiktok", le: iso(co + JOUR) };
      if (e.tiktok_existe === true && !warmupOk(e) && !envoye(e, "warmup")) return { type: "warmup", le: iso(co + JOUR) };
      if (!e.slack_user_id && !envoye(e, "slack")) return { type: "slack", le: iso(co + 2 * JOUR) };
    }
  }
  const enCours = !ruulFini(e) && (!!e.ruul_email_a_at || !!e.ruul_email_b_at);
  if (enCours) {
    const ruul = e.envois.filter((x) => x.ok && x.type === "ruul");
    if (ruul.length >= RUUL_MAX) return envoye(e, "carte_ruul") ? null : { type: "carte_ruul", le: null };
    const depuis = ruul.length ? ruul[ruul.length - 1].at : [e.ruul_email_a_at, e.ruul_email_b_at].filter(Boolean).sort().pop()!;
    return { type: "ruul", le: iso(new Date(depuis).getTime() + 2 * JOUR) };
  }
  return null;
}

export type FiltreParcours = "tous" | "ruul_pas_pret" | "jamais_connectes" | "bientot_inactifs";

export const FILTRES: { cle: FiltreParcours; libelle: string }[] = [
  { cle: "tous", libelle: "Tous" },
  { cle: "ruul_pas_pret", libelle: "Ruul pas prêt" },
  { cle: "jamais_connectes", libelle: "Jamais connectés" },
  { cle: "bientot_inactifs", libelle: "Bientôt 14 jours inactifs" },
];

/** Aucune activité (ni connexion, ni TikTok, ni warm-up, ni post) depuis 10 jours ou plus : la désactivation arrive à 14. */
export function bientotInactif(e: EtatParcoursRuul, maintenant: Date): boolean {
  const jours = (maintenant.getTime() - new Date(e.cree_at).getTime()) / JOUR;
  return jours >= 10 && !e.premiere_connexion_at && e.tiktok_existe !== true && !e.warmup_started_at && e.posts === 0;
}

export function filtrer(liste: EtatParcoursRuul[], f: FiltreParcours, maintenant: Date): EtatParcoursRuul[] {
  if (f === "ruul_pas_pret") return liste.filter((e) => !ruulFini(e));
  if (f === "jamais_connectes") return liste.filter((e) => !e.premiere_connexion_at);
  if (f === "bientot_inactifs") return liste.filter((e) => bientotInactif(e, maintenant));
  return liste;
}

export const jourCourt = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "numeric", timeZone: "Europe/Paris" });
