// Pods — file de validation des livraisons (migration 0259, fonction `pods`).

import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

export type StatutLivraison = "a_valider" | "validee" | "rejetee" | "ecartee_note";

export interface SlideLivraison {
  position: number;
  media_id: string;
  url: string;
  position_sophia: boolean;
  /** Original traduisible : le texte que le poster posera (image sans texte). */
  texte_overlay?: string;
  /** Original : la version Sophia de cette slide (langue source). */
  texte_sophia?: string | null;
  /** Original : slide TikTok d'inspiration, modèle de mise en page du poster. */
  reference_url?: string;
}

export interface Livraison {
  id: string;
  pod: string;
  /**
   * nouveau : un post neuf (images finies) ; langues : nouvelles langues d'un
   * post déjà validé ; original : texte + images de la banque, traduit et placé
   * par l'OS à l'assignation.
   */
  type: "nouveau" | "langues" | "original";
  source_url: string | null;
  source_vues: number | null;
  titre: string | null;
  langue_source: string;
  musique_titre: string | null;
  decks: Record<string, { hashtags: string; slides: SlideLivraison[] }>;
  statut: StatutLivraison;
  motif: string | null;
  note_import: number | null;
  tier: string | null;
  contenu_id: string | null;
  created_at: string;
  decide_le: string | null;
}

const COLONNES =
  "id, pod, type, source_url, source_vues, titre, langue_source, musique_titre, decks, statut, motif, note_import, tier, contenu_id, created_at, decide_le";

export interface Pod {
  slug: string;
  nom: string;
  actif: boolean;
  label: string | null;
}

/** Les pods déclarés (table `pods`) avec le nom de leur label. */
export async function listerPods(): Promise<Pod[]> {
  const { data, error } = await supabase.from("pods").select("slug, nom, actif, labels(nom)").order("created_at");
  if (error) throw error;
  return (data ?? []).map((p) => {
    const label = p.labels as unknown as { nom: string } | { nom: string }[] | null;
    return {
      slug: p.slug as string,
      nom: p.nom as string,
      actif: p.actif as boolean,
      label: (Array.isArray(label) ? label[0]?.nom : label?.nom) ?? null,
    };
  });
}

/** Regroupe des livraisons par pod, dans l'ordre des pods connus (les inconnus à la fin). */
export function parPod(pods: Pick<Pod, "slug">[], livraisons: Livraison[]): Map<string, Livraison[]> {
  const groupes = new Map<string, Livraison[]>(pods.map((p) => [p.slug, []]));
  for (const l of livraisons) {
    if (!groupes.has(l.pod)) groupes.set(l.pod, []);
    groupes.get(l.pod)!.push(l);
  }
  return groupes;
}

/** File d'attente (la plus ancienne d'abord) + les 30 dernières décidées. */
export async function listerLivraisons(): Promise<{ aValider: Livraison[]; decidees: Livraison[] }> {
  const [attente, faites] = await Promise.all([
    supabase.from("pod_livraisons").select(COLONNES).eq("statut", "a_valider").order("created_at").limit(100),
    supabase
      .from("pod_livraisons")
      .select(COLONNES)
      .neq("statut", "a_valider")
      .order("decide_le", { ascending: false })
      .limit(30),
  ]);
  if (attente.error) throw attente.error;
  if (faites.error) throw faites.error;
  return { aValider: (attente.data ?? []) as Livraison[], decidees: (faites.data ?? []) as Livraison[] };
}

export function validerLivraison(id: string) {
  return invoke<{ ok: boolean; statut: StatutLivraison; tier?: string; note?: number }>("pods", { action: "valider", id });
}

export function rejeterLivraison(id: string, motif: string) {
  return invoke<{ ok: boolean }>("pods", { action: "rejeter", id, motif: motif || null });
}

/** Ordre d'affichage des langues : la langue source d'abord, puis l'alphabet. */
export function languesOrdonnees(l: Pick<Livraison, "decks" | "langue_source">): string[] {
  return Object.keys(l.decks ?? {}).sort((a, b) =>
    a === l.langue_source ? -1 : b === l.langue_source ? 1 : a.localeCompare(b),
  );
}
