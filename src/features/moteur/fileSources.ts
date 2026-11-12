import { supabase } from "@/lib/supabase/client";

/**
 * La file d'import des sources (0686) : ce qui tourne, ce qui attend avec son
 * jour au plus tôt, et les essais des sources neuves. Une source neuve
 * n'importe d'abord que ses meilleurs posts ; la suite ne vient que si elle
 * tient chez nous, par tranches, un lundi après l'autre.
 */

export interface SourceEnAttente {
  compteReferenceId: string;
  handle: string;
  /** `neuve` : première importation (essai). `maj` : mise à jour de la semaine. */
  sorte: "neuve" | "maj";
  essaiMax: number | null;
  /** Jour au plus tôt (AAAA-MM-JJ) ; nul si les sources neuves sont à l'arrêt. */
  prevuLe: string | null;
}

export type VerdictEssai = "tient" | "ne_tient_pas" | null;

export interface EssaiSource {
  compteReferenceId: string;
  handle: string;
  label: string | null;
  essaiMax: number | null;
  essaiDepuis: string | null;
  verdict: VerdictEssai;
  importes: number;
  valides: number;
  /** Posts de la source mesurés chez nous. */
  posts: number;
  r: number | null;
  rVsLabel: number | null;
}

export interface FileSources {
  enCours: { handle: string | null; restant: number; faits: number; total: number; aSuivre: string[] } | null;
  attente: SourceEnAttente[];
  essais: EssaiSource[];
  reglages: { lotMax: number; nouvellesParJour: number; essaiPosts: number; essaiMesuresMin: number; postsMaxParMaj: number };
}

const nombre = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v));
const texte = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function versFileSources(brut: Record<string, unknown>): FileSources {
  const cours = brut.en_cours as Record<string, unknown> | null | undefined;
  const reg = (brut.reglages ?? {}) as Record<string, unknown>;
  const liste = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  return {
    enCours: cours
      ? {
          handle: texte(cours.handle),
          restant: nombre(cours.restant) ?? 0,
          faits: nombre(cours.faits) ?? 0,
          total: nombre(cours.total) ?? 0,
          aSuivre: Array.isArray(cours.a_suivre) ? (cours.a_suivre as string[]) : [],
        }
      : null,
    attente: liste(brut.attente).map((l) => ({
      compteReferenceId: String(l.compte_reference_id),
      handle: String(l.handle ?? ""),
      sorte: l.sorte === "neuve" ? "neuve" : "maj",
      essaiMax: nombre(l.essai_max),
      prevuLe: texte(l.prevu_le),
    })),
    essais: liste(brut.essais).map((l) => ({
      compteReferenceId: String(l.compte_reference_id),
      handle: String(l.handle ?? ""),
      label: texte(l.label),
      essaiMax: nombre(l.essai_max),
      essaiDepuis: texte(l.essai_depuis),
      verdict: l.verdict === "tient" || l.verdict === "ne_tient_pas" ? l.verdict : null,
      importes: nombre(l.importes) ?? 0,
      valides: nombre(l.valides) ?? 0,
      posts: nombre(l.posts) ?? 0,
      r: nombre(l.r),
      rVsLabel: nombre(l.r_vs_label),
    })),
    reglages: {
      lotMax: nombre(reg.lot_max) ?? 6,
      nouvellesParJour: nombre(reg.nouvelles_par_jour) ?? 2,
      essaiPosts: nombre(reg.essai_posts) ?? 30,
      essaiMesuresMin: nombre(reg.essai_mesures_min) ?? 10,
      postsMaxParMaj: nombre(reg.posts_max_par_maj) ?? 100,
    },
  };
}

/** Les sources en attente, regroupées par jour, dans l'ordre de la file. */
export function attenteParJour(attente: SourceEnAttente[]): { jour: string | null; sources: SourceEnAttente[] }[] {
  const jours: { jour: string | null; sources: SourceEnAttente[] }[] = [];
  for (const s of attente) {
    const dernier = jours[jours.length - 1];
    if (dernier && dernier.jour === s.prevuLe) dernier.sources.push(s);
    else jours.push({ jour: s.prevuLe, sources: [s] });
  }
  return jours;
}

export async function lireFileSources(): Promise<FileSources> {
  const { data, error } = await supabase.rpc("sources_file");
  if (error) throw error;
  return versFileSources((data ?? {}) as Record<string, unknown>);
}

/** Lève l'essai à la main : la suite du catalogue s'importe par la file, par tranches. */
export async function leverEssaiSource(compteReferenceId: string): Promise<void> {
  const { error } = await supabase.rpc("sources_essai_lever", { p_compte: compteReferenceId });
  if (error) throw error;
}
