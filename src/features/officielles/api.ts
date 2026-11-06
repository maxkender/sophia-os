import { supabase } from "@/lib/supabase/client";

/**
 * 6/11 (0548) : les « Réponses officielles » : une question, la réponse en
 * anglais, validée par Max. Le bot FAQ et les 3 bots les donnent en priorité ;
 * les posteurs les lisent sous « FAQ ». La base filtre : un posteur ne voit
 * que les réponses validées et actives ; toute modification du texte repasse
 * « à valider ».
 */
export interface ReponseOfficielle {
  id: string;
  question: string;
  reponse: string;
  ordre: number;
  actif: boolean;
  valide_at: string | null;
  maj_at: string;
}

const COLONNES = "id, question, reponse, ordre, actif, valide_at, maj_at";

export async function lireReponsesOfficielles(): Promise<ReponseOfficielle[]> {
  const { data, error } = await supabase
    .from("reponses_officielles")
    .select(COLONNES)
    .order("ordre", { ascending: true })
    .order("cree_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReponseOfficielle[];
}

/** Une nouvelle réponse (ou une modification) : validée tout de suite si `valider`. */
export async function enregistrerReponseOfficielle(r: {
  id: string | null;
  question: string;
  reponse: string;
  ordre: number;
  valider: boolean;
}): Promise<void> {
  const champs = {
    question: r.question.trim(),
    reponse: r.reponse.trim(),
    ordre: r.ordre,
    ...(r.valider ? { valide_at: new Date().toISOString() } : {}),
  };
  const { error } = r.id
    ? await supabase.from("reponses_officielles").update(champs).eq("id", r.id)
    : await supabase.from("reponses_officielles").insert(champs);
  if (error) throw error;
}

export async function validerReponseOfficielle(id: string): Promise<void> {
  const { error } = await supabase.from("reponses_officielles").update({ valide_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function activerReponseOfficielle(id: string, actif: boolean): Promise<void> {
  const { error } = await supabase.from("reponses_officielles").update({ actif }).eq("id", id);
  if (error) throw error;
}

/** Ce que voit un posteur : validées et actives, dans l'ordre. */
export function reponsesVisibles(liste: readonly ReponseOfficielle[]): ReponseOfficielle[] {
  return liste.filter((r) => r.actif && r.valide_at);
}
