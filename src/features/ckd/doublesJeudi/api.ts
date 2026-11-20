/**
 * 18/11 (Max) : le doublement du jeudi (0756). Les propositions de la semaine (40 au plus), la décision OUI / NON
 * avec le label du 2e compte, la création du compte (fonction ckd), et ce qui démarre lundi par pays.
 */
import { invoke } from "@/features/moteur/api";
import { supabase } from "@/lib/supabase/client";

export interface PropositionDouble {
  id: string;
  compte_id: string;
  poster_id: string;
  poster_nom: string | null;
  hm_nom: string | null;
  pays: string | null;
  langue: string | null;
  handle: string | null;
  label_nom: string | null;
  app_nom: string | null;
  /** 0761 : upwork ou ruul. */
  canal_paie?: string | null;
  star: boolean;
  vues_med: number | null;
  /** 0761 : posts viraux (≥ 5 × la médiane de la langue) sur les 7 derniers jours. */
  viraux?: number | null;
  bons: number | null;
  posts: number | null;
  meilleur_url: string | null;
  meilleur_vues: number | null;
  label_propose_id: string | null;
  /** 0761 : le nom du label proposé (affiché sans ouvrir la liste). */
  label_propose_nom?: string | null;
  label_choisi_id: string | null;
  decision: "oui" | "non" | null;
  statut: "propose" | "refuse" | "a_creer" | "cree" | "erreur" | "annule";
  erreur: string | null;
  nouveau_compte_id: string | null;
  rang: number | null;
}

export interface LabelPossible {
  label_id: string;
  nom: string;
  app_nom: string | null;
  autre_app: boolean;
  vues_med: number | null;
}

export interface LigneLundi {
  pays: string;
  nouveaux: number;
  doubles: number;
  total: number;
}

async function rpc<T>(nom: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(nom, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const lirePropositions = (jeudi: string) => rpc<PropositionDouble[]>("jeudi_doubles_lire_v2", { p_jeudi: jeudi }).then((d) => d ?? []);

/** Le % de posts viraux d'une proposition (0 à 100), ou null. */
export const pctViraux = (p: Pick<PropositionDouble, "viraux" | "posts">): number | null =>
  p.viraux == null || !p.posts ? null : Math.round((100 * p.viraux) / p.posts);
export const preparerPropositions = (jeudi: string) => rpc<number>("jeudi_doubles_preparer", { p_jeudi: jeudi });
export const lireLabelsPossibles = (compte: string) => rpc<LabelPossible[]>("jeudi_labels_possibles", { p_compte: compte }).then((d) => d ?? []);
export const decider = (id: string, decision: "oui" | "non", label: string | null) =>
  rpc<void>("jeudi_double_decider", { p_id: id, p_decision: decision, p_label: label });
export const toutRefuser = (jeudi: string) => rpc<number>("jeudi_doubles_tout_refuser", { p_jeudi: jeudi });
export const lireLundi = (jeudi: string) => rpc<LigneLundi[]>("jeudi_lundi_resume", { p_jeudi: jeudi }).then((d) => d ?? []);
export const creerDeuxieme = (id: string) => invoke<{ ok: boolean; error?: string; attente?: string }>("ckd", { action: "double_jeudi", id });

/** 0802 : la réponse du posteur à la proposition (envoyée après le OUI de Max). */
export interface ReponseDouble {
  id: string;
  reponse: "oui" | "non" | "expire" | null;
  repondu_at: string | null;
  repondu_via: string | null;
  offre_envoyee_at: string | null;
  offre_canaux: string[] | null;
  offre_erreur: string | null;
  demarrage_message_at: string | null;
}
export const lireReponses = (jeudi: string) => rpc<ReponseDouble[]>("jeudi_doubles_reponses", { p_jeudi: jeudi }).then((d) => d ?? []);

/** Le libellé de l'état d'une proposition validée OUI, côté posteur. */
export function etatReponse(r: ReponseDouble | undefined): { texte: string; ton: "ok" | "attente" | "non" } {
  if (!r) return { texte: "Proposition à envoyer", ton: "attente" };
  if (r.reponse === "oui") return { texte: r.repondu_via === "warmup" ? "Accepté (warm-up lancé)" : "Accepté par le posteur", ton: "ok" };
  if (r.reponse === "non") return { texte: "Refusé par le posteur", ton: "non" };
  if (r.reponse === "expire") return { texte: "Expiré (pas de réponse)", ton: "non" };
  if (r.offre_envoyee_at) return { texte: `Proposé (${(r.offre_canaux ?? []).filter((c) => c !== "dashboard").join(", ") || "dashboard"}) · en attente`, ton: "attente" };
  return { texte: r.offre_erreur ? `Proposition pas partie : ${r.offre_erreur}` : "Proposition à envoyer", ton: "attente" };
}

/** Le jeudi (AAAA-MM-JJ) de la semaine d'un jour donné. */
export function jeudiDeLaSemaine(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  const isodow = ((d.getUTCDay() + 6) % 7) + 1;
  d.setUTCDate(d.getUTCDate() + (4 - isodow));
  return d.toISOString().slice(0, 10);
}

export const ajouterJours = (jour: string, n: number): string => {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Les compteurs du haut : proposés, OUI, NON, à décider. */
export function compteurs(l: PropositionDouble[]) {
  return {
    total: l.length,
    oui: l.filter((p) => p.decision === "oui").length,
    non: l.filter((p) => p.decision === "non").length,
    reste: l.filter((p) => !p.decision).length,
  };
}

export const formaterVues = (n: number | null | undefined): string =>
  n == null ? "—" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".0", "")} M` : n >= 1_000 ? `${(n / 1_000).toFixed(1).replace(".0", "")} k` : String(n);
