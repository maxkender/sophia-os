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
  type: "nouveau" | "langues" | "original" | "video";
  source_url: string | null;
  source_vues: number | null;
  titre: string | null;
  langue_source: string;
  musique_titre: string | null;
  musique_url: string | null;
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
  "id, pod, type, source_url, source_vues, titre, langue_source, musique_titre, musique_url, decks, statut, motif, note_import, tier, contenu_id, created_at, decide_le";

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

/** `tier` : rang imposé (la note d'import est calculée mais ne décide plus). */
export function validerLivraison(id: string, tier?: "A" | "B" | "C") {
  return invoke<{ ok: boolean; statut: StatutLivraison; tier?: string; note?: number }>("pods", {
    action: "valider",
    id,
    ...(tier ? { tier } : {}),
  });
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

// ---------------------------------------------------------------------------
// Pod 3 — réactions UGC vidéo (migration 0263)
// ---------------------------------------------------------------------------

/** Le pod dont les livraisons sont des vidéos par compte. */
export const POD_VIDEO = "reactions_ugc";

/** Livraison vidéo : `decks` est indexé par compte. */
export interface ItemVideoLivraison {
  langue: string;
  reaction_url: string;
  texte_ecran: string;
  legende: string;
}

export function itemsVideo(l: Pick<Livraison, "decks">): [string, ItemVideoLivraison][] {
  return Object.entries((l.decks ?? {}) as unknown as Record<string, ItemVideoLivraison>);
}

export interface PersonaPod {
  id: string;
  compte_id: string;
  image_url: string;
  description: string;
  statut: "a_valider" | "valide" | "rejete";
  compte: { persona_nom: string | null; langue: string | null; handle_tiktok: string | null } | null;
}

export async function listerPersonas(pod: string): Promise<PersonaPod[]> {
  const { data, error } = await supabase
    .from("pod_personas")
    .select("id, compte_id, image_url, description, statut, comptes(persona_nom, langue, handle_tiktok)")
    .eq("pod", pod)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((p) => {
    const c = p.comptes as unknown as PersonaPod["compte"] | PersonaPod["compte"][];
    return { ...(p as unknown as PersonaPod), compte: Array.isArray(c) ? (c[0] ?? null) : c };
  });
}

export function deciderPersona(id: string, valide: boolean) {
  return invoke<{ ok: boolean }>("pods", { action: valide ? "valider_persona" : "rejeter_persona", id });
}

/** Noms des comptes d'une livraison vidéo (pour l'aperçu). */
export async function nomsComptes(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from("comptes").select("id, persona_nom, handle_tiktok").in("id", ids).limit(ids.length);
  if (error) throw error;
  return new Map((data ?? []).map((c) => [c.id as string, (c.handle_tiktok ? `@${c.handle_tiktok}` : c.persona_nom) ?? c.id]));
}

export interface DemoApp {
  id: string;
  langue: string;
  video_url: string;
}

export async function listerDemos(): Promise<DemoApp[]> {
  const { data, error } = await supabase
    .from("pod_demos")
    .select("id, langue, video_url")
    .eq("application", "sophia")
    .order("langue");
  if (error) throw error;
  return (data ?? []) as DemoApp[];
}

/** Démo Sophia d'une langue : la vidéo remplace la précédente (même chemin). */
export async function enregistrerDemo(langue: string, fichier: File): Promise<void> {
  const code = langue.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) throw new Error("langue : 2 lettres (fr, en, es…)");
  const chemin = `pods/demos/sophia/${code}.mp4`;
  const { error: upErr } = await supabase.storage.from("medias").upload(chemin, fichier, {
    contentType: fichier.type || "video/mp4",
    upsert: true,
    cacheControl: "3600",
  });
  if (upErr) throw upErr;
  const url = `${supabase.storage.from("medias").getPublicUrl(chemin).data.publicUrl}?v=${Date.now()}`;
  const { error } = await supabase
    .from("pod_demos")
    .upsert({ application: "sophia", langue: code, video_url: url, video_path: chemin }, { onConflict: "application,langue" });
  if (error) throw error;
}
