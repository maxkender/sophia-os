import { supabase } from "@/lib/supabase/client";

import type { AnnonceUpwork, RecrutementCohorte, TableauPays } from "./logique";

/** Le tableau de décision par pays (0512, admin, lecture seule). */
export async function lireTableauPays(): Promise<TableauPays> {
  const { data, error } = await supabase.rpc("pays_tableau");
  if (error) throw error;
  const t = data as TableauPays;
  return {
    ...t,
    semaines: (t.semaines ?? []).map((s) => ({
      ...s,
      vues: Number(s.vues ?? 0),
      comptes: Number(s.comptes ?? 0),
      sous_seuil: Number(s.sous_seuil ?? 0),
      proceeds: Number(s.proceeds ?? 0),
      proceeds_new: s.proceeds_new === null || s.proceeds_new === undefined ? null : Number(s.proceeds_new),
      transactions: Number(s.transactions ?? 0),
      cout_reel: s.cout_reel === null || s.cout_reel === undefined ? null : Number(s.cout_reel),
      cout_estime: s.cout_estime === null || s.cout_estime === undefined ? null : Number(s.cout_estime),
      comptes_publies: Number(s.comptes_publies ?? 0),
    })),
    pays: (t.pays ?? []).map((p) => ({
      ...p,
      tarif: p.tarif === null || p.tarif === undefined ? null : Number(p.tarif),
      objectif: p.objectif === null || p.objectif === undefined ? null : Number(p.objectif),
    })),
    offres: t.offres ?? [],
    hms: t.hms ?? [],
    reglages: t.reglages ?? {},
  };
}

export interface ComptePays {
  compte_id: string;
  handle: string | null;
  poster_id: string | null;
  poster_nom: string | null;
  actif: boolean;
  cree_le: string | null;
  semaines: { semaine: string; vues: number }[];
}

/** Les comptes d'un pays et leurs vues des 8 dernières semaines. */
export async function lireComptesPays(pays: string): Promise<ComptePays[]> {
  const { data, error } = await supabase.rpc("pays_comptes", { p_pays: pays });
  if (error) throw error;
  return ((data ?? []) as ComptePays[]).map((c) => ({ ...c, semaines: (c.semaines ?? []).map((s) => ({ ...s, vues: Number(s.vues) })) }));
}

/** L'objectif de comptes d'un pays, réglé à la main (null : la suggestion s'applique). */
export async function fixerObjectifPays(pays: string, objectif: number | null, note: string | null): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("pays_objectifs")
    .upsert({ pays, objectif, note, maj_par: u.user?.id ?? null, maj_at: new Date().toISOString() }, { onConflict: "pays" });
  if (error) throw error;
}

export interface MetaPays {
  releve_posts: string | null;
  releve_comptes: string | null;
  releve_post_metrics: string | null;
  jalons: string | null;
  annonces: AnnonceUpwork[];
}

/** La date des derniers relevés de vues et les annonces Upwork (0514). */
export async function lireMetaPays(): Promise<MetaPays> {
  const { data, error } = await supabase.rpc("pays_meta");
  if (error) throw error;
  const m = data as MetaPays;
  return { ...m, annonces: (m.annonces ?? []).map((a) => ({ ...a, contrats_21j: Number(a.contrats_21j ?? 0) })) };
}

export interface CompteDetail {
  compte_id: string;
  handle: string | null;
  poster: string | null;
  actif: boolean;
  vues_7j: number;
  mediane_post: number | null;
  posts_28j: number;
}

export interface PostDetail {
  passage_id: string;
  url: string;
  vues: number;
  date: string;
  handle: string | null;
  app: string;
  j1: number | null;
  j3: number | null;
  j7: number | null;
}

/** Le détail d'un pays : ses comptes (vues 7 j, médiane par post) et ses 5 meilleurs posts des 28 derniers jours. */
export async function lireDetailPays(pays: string): Promise<{ comptes: CompteDetail[]; top_posts: PostDetail[] }> {
  const { data, error } = await supabase.rpc("pays_detail", { p_pays: pays });
  if (error) throw error;
  const d = (data ?? {}) as { comptes?: CompteDetail[]; top_posts?: PostDetail[] };
  return {
    comptes: (d.comptes ?? []).map((c) => ({ ...c, vues_7j: Number(c.vues_7j ?? 0), mediane_post: c.mediane_post === null ? null : Number(c.mediane_post) })),
    top_posts: (d.top_posts ?? []).map((p) => ({ ...p, vues: Number(p.vues ?? 0) })),
  };
}

/** 0516 : la cohorte d'un lundi : objectifs, HM par pays, recrues acceptées, offres en attente, alertes d'offres. */
export async function lireRecrutementCohorte(lundi: string): Promise<RecrutementCohorte> {
  const { data, error } = await supabase.rpc("recrutement_cohorte", { p_lundi: lundi });
  if (error) throw error;
  const d = (data ?? {}) as Partial<RecrutementCohorte>;
  return {
    lundi,
    objectifs: (d.objectifs ?? []).map((o) => ({ pays: o.pays, nombre: Number(o.nombre ?? 0) })),
    hm_pays: d.hm_pays ?? [],
    acceptees: d.acceptees ?? [],
    en_attente: d.en_attente ?? [],
    offres_lues_at: d.offres_lues_at ?? null,
    alertes: d.alertes ?? [],
  };
}
