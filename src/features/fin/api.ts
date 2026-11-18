/**
 * 18/11 (Max) : kills, parties 1 et 2, côté posteur. Les textes viennent du serveur (0753, posteur_textes), déjà
 * traduits dans sa langue, les mêmes que ceux du bot Help et du message de fin.
 */
import { supabase } from "@/lib/supabase/client";

export interface MaFin {
  cas: "kill" | "demande";
  le: string | null;
  /** Le texte complet dans sa langue (null tant que la traduction n'est pas prête). */
  texte: string | null;
}

export interface BandeauCompte {
  cle: string;
  texte: string;
}

export async function lireMaFin(): Promise<MaFin | null> {
  const { data, error } = await supabase.rpc("ma_fin_collaboration");
  if (error) throw new Error(error.message);
  const d = data as Partial<MaFin> | null;
  return d && (d.cas === "kill" || d.cas === "demande") ? { cas: d.cas, le: d.le ?? null, texte: d.texte ?? null } : null;
}

export async function lireMesBandeaux(): Promise<BandeauCompte[]> {
  const { data, error } = await supabase.rpc("mes_bandeaux_compte");
  if (error) throw new Error(error.message);
  return ((data ?? []) as BandeauCompte[]).filter((b) => b.texte);
}

export async function marquerBandeauVu(cle: string): Promise<void> {
  const { error } = await supabase.rpc("bandeau_compte_vu", { p_cle: cle });
  if (error) throw new Error(error.message);
}

/** Le texte en lignes : la 1re est le titre, la dernière le remerciement, les autres (raison, paiement) au milieu. */
export function decouper(texte: string): { titre: string; lignes: string[]; fin: string | null } {
  const l = texte.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  if (l.length <= 1) return { titre: l[0] ?? "", lignes: [], fin: null };
  if (l.length === 2) return { titre: l[0]!, lignes: [], fin: l[1]! };
  return { titre: l[0]!, lignes: l.slice(1, -1), fin: l[l.length - 1]! };
}
