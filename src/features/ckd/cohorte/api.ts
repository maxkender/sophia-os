import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

/**
 * Check, Kill or Double, suivi par cohorte (0356). Une cohorte = les nouveaux
 * posteurs dont les premiers posts tombent le même lundi. `ckd_cohorte` rend,
 * compte par compte, ses posts du lundi au vendredi et les relevés de son
 * profil TikTok pendant la semaine de warm-up.
 */

export interface PostCohorte {
  jour: string;
  vues: number | null;
  url: string | null;
  /** Vues relevées assez tard pour compter (âge minimum du post). */
  mesure: boolean;
}

export interface ReleveWarmup {
  at: string;
  /** null : la page TikTok n'a pas pu être lue. */
  existe: boolean | null;
  cree_tiktok_at: string | null;
  abonnements: number | null;
  likes: number | null;
  abonnes: number | null;
  videos: number | null;
}

export interface CompteCohorte {
  compte_id: string;
  poster_id: string;
  hm_id: string | null;
  handle: string | null;
  pays: string | null;
  langue: string | null;
  application: string | null;
  is_active: boolean;
  cree_le: string;
  warmup_lance_le: string | null;
  warmup_fin: string | null;
  premier_jour: string | null;
  /** Le lundi où il aurait dû démarrer, s'il démarre plus tard. */
  glisse_de: string | null;
  seuil_mort: number;
  seuil_bon: number;
  posts: PostCohorte[];
  releves: ReleveWarmup[];
}

export async function lireCohorte(lundi: string): Promise<CompteCohorte[]> {
  const { data, error } = await supabase.rpc("ckd_cohorte", { p_lundi: lundi });
  if (error) throw error;
  return ((data ?? []) as CompteCohorte[]).map((c) => ({
    ...c,
    seuil_mort: Number(c.seuil_mort),
    seuil_bon: Number(c.seuil_bon),
    posts: c.posts ?? [],
    releves: c.releves ?? [],
  }));
}

export interface ResultatReleve {
  ok: boolean;
  comptes: number;
  existent: number;
  introuvables: number;
  illisibles: number;
}

/** Relit tout de suite le profil TikTok des comptes en warm-up (sinon : 8 h et 20 h). */
export async function releverWarmup(): Promise<ResultatReleve> {
  return await invoke("ckd", { action: "releve_warmup" });
}
