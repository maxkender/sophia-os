import { supabase } from "@/lib/supabase/client";

/** Une ligne de `paie_semaines` (0362), avec le posteur. */
export interface LignePaie {
  id: string;
  poster_id: string;
  semaine: string;
  nb_comptes: number;
  comptes_payes: number;
  prevus: number;
  faits: number;
  manques: number;
  tarif: number | null;
  retenue: number;
  montant: number;
  statut: "ok" | "a_voir";
  raison: string | null;
  paye_at: string | null;
  paye_par: string | null;
  poster: {
    prenom: string | null;
    nom: string | null;
    email: string | null;
    upwork_contrat_url: string | null;
    manager_id: string | null;
  } | null;
}

/** Les lignes d'une semaine (la RLS ne rend à la HM que ses posteurs). */
export async function lirePaie(semaine: string): Promise<LignePaie[]> {
  const { data, error } = await supabase
    .from("paie_semaines")
    .select(
      "id, poster_id, semaine, nb_comptes, comptes_payes, prevus, faits, manques, tarif, retenue, montant, statut, raison, paye_at, paye_par, poster:profiles!paie_semaines_poster_id_fkey(prenom, nom, email, upwork_contrat_url, manager_id)",
    )
    .eq("semaine", semaine);
  if (error) throw error;
  return ((data ?? []) as unknown as LignePaie[]).map((l) => ({
    ...l,
    tarif: l.tarif === null ? null : Number(l.tarif),
    retenue: Number(l.retenue),
    montant: Number(l.montant),
  }));
}

export async function marquerPayee(id: string, paye: boolean): Promise<void> {
  const { error } = await supabase.rpc("paie_marquer_payee", { p_id: id, p_paye: paye });
  if (error) throw error;
}

export async function enregistrerContrat(posterId: string, url: string): Promise<void> {
  const { error } = await supabase.rpc("paie_enregistrer_contrat", { p_poster: posterId, p_url: url });
  if (error) throw error;
}

/** Recalcule une semaine (admin) : les lignes déjà payées ne bougent pas. */
export async function genererPaie(semaine: string): Promise<number> {
  const { data, error } = await supabase.rpc("paie_generer", { p_lundi: semaine });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function lireTarif(posterId: string): Promise<number | null> {
  const { data, error } = await supabase.from("profiles").select("tarif_hebdo").eq("id", posterId).single();
  if (error) throw error;
  const t = (data as { tarif_hebdo: number | string | null }).tarif_hebdo;
  return t === null ? null : Number(t);
}

export async function modifierTarif(posterId: string, tarif: number | null): Promise<void> {
  const { error } = await supabase.rpc("paie_modifier_tarif", { p_poster: posterId, p_tarif: tarif });
  if (error) throw error;
}

/** Prénom + nom des HMs (admin). */
export async function nomsHms(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, prenom, nom, email").in("id", ids);
  if (error) throw error;
  return new Map(
    (data ?? []).map((p) => [p.id as string, [p.prenom, p.nom].filter(Boolean).join(" ") || (p.email as string)]),
  );
}
