import { supabase } from "@/lib/supabase/client";

/** 0559 (C1) : la décision du samedi précédent et ce qui s'est passé depuis, par posteur. */
export interface MemoireSamedi {
  jour: string;
  decision: "doubler" | "garder" | "pas_maintenant" | "ne_pas_renouveler" | string;
  action: string | null;
  posts: number;
  mediane: number | null;
  compte2: { handle: string | null; posts: number; mediane: number | null; mediane1: number | null } | null;
  offre: "oui" | "non" | null;
}

/** 0559 (C3) : « Ce qu'a donné samedi dernier ». */
export interface BilanSamedi {
  jour: string | null;
  kills: number;
  doubles: number;
  doubles_acceptes: number;
  gardes: number;
  cout_ajoute: number;
  verdicts: { bonne: number; a_revoir: number; erreur: number };
  lignes: { poster_id: string; nom: string; decision: string; verdict: "bonne" | "a_revoir" | "erreur"; detail: string }[];
}

export async function lireMemoireSamedi(jour?: string): Promise<Map<string, MemoireSamedi>> {
  const { data, error } = await supabase.rpc("samedi_memoire", jour ? { p_jour: jour } : {});
  if (error) throw error;
  return new Map(Object.entries((data ?? {}) as Record<string, MemoireSamedi>));
}

export async function lireBilanSamedi(jour?: string): Promise<BilanSamedi> {
  const { data, error } = await supabase.rpc("samedi_bilan", jour ? { p_jour: jour } : {});
  if (error) throw error;
  return data as BilanSamedi;
}

const LIBELLE: Record<string, string> = {
  doubler: "Doublé",
  garder: "Gardé",
  pas_maintenant: "Pas maintenant",
  ne_pas_renouveler: "Kill",
};

export function jj(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** « Gardé le 31/10 · 9 posts avec lien depuis, médiane 1 200 vues ». */
export function texteMemoire(m: MemoireSamedi): string {
  const base = `${LIBELLE[m.decision] ?? m.decision} le ${jj(m.jour)}`;
  if (m.decision === "doubler") {
    const offre = m.offre === "oui" ? "accepté" : m.offre === "non" ? "refusé" : "en attente";
    const c2 = m.compte2 ? ` · 2e compte : ${m.compte2.posts} post(s)${m.compte2.mediane !== null ? `, médiane ${Math.round(m.compte2.mediane)}` : ""}` : "";
    return `${base} (${offre})${c2}`;
  }
  const med = m.mediane !== null ? `, médiane ${Math.round(m.mediane)} vues` : "";
  return `${base} · ${m.posts} post(s) avec lien depuis${med}`;
}

/**
 * 0559 (C2) : ce que la mémoire pré-sélectionne.
 *  - gardé et toujours 0 post avec lien → Kill (« déjà gardé le JJ/MM ») ;
 *  - doublé il y a ≥ 2 semaines et 2e compte sous 50 % de la médiane du 1er → « Recréer ou retirer le 2e compte ».
 */
export function alerteMemoire(m: MemoireSamedi | undefined, aujourdhui: string): { choix: "kill" | null; texte: string } | null {
  if (!m) return null;
  if (m.decision === "garder" && m.posts === 0) return { choix: "kill", texte: `Kill : déjà gardé le ${jj(m.jour)}, 0 post avec lien depuis` };
  const jours = (Date.parse(`${aujourdhui}T12:00:00Z`) - Date.parse(`${m.jour}T12:00:00Z`)) / 86_400_000;
  const c2 = m.compte2;
  if (m.decision === "doubler" && jours >= 14 && c2 && c2.mediane !== null && c2.mediane1 && c2.mediane < 0.5 * c2.mediane1) {
    return { choix: null, texte: `2e compte sous 50 % du 1er (${Math.round(c2.mediane)} / ${Math.round(c2.mediane1)}) : recréer ou retirer le 2e compte` };
  }
  return null;
}
