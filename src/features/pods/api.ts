// Pods — file de validation des livraisons (migration 0259, fonction `pods`).

import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";
import { LANGUES_CIBLES } from "@/features/moteur/langues";

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

/** Pod 4 : une référence de la preuve, telle que vérifiée par l'OS au dépôt. */
export type ReferencePreuve =
  | { type: "tiktok"; url: string; vues: number; publie_le: string; enregistrements: number | null }
  | { type: "os"; contenu_id: string; publies: number; r_median: number | null };

/** Pod 4 : pourquoi cet original devrait faire des vues (schéma d'accroche et ses preuves). */
export interface PreuveOriginal {
  schema: string;
  verifiee_le: string;
  references: ReferencePreuve[];
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
  /**
   * Variantes par application autre que Sophia (0276), par langue. Label hors
   * Sophia (pod 6, UnSwipe seul) : la seule version servie, tirée du deck déposé.
   */
  decks_applications?: Record<string, Record<string, { hashtags?: string; slides: SlideLivraison[] }>> | null;
  statut: StatutLivraison;
  motif: string | null;
  note_import: number | null;
  tier: string | null;
  contenu_id: string | null;
  created_at: string;
  /** Heure du DERNIER dépôt (0323) : le délai de la validation automatique en part. */
  depose_le?: string | null;
  /** Validée par la validation automatique d'un podz sûr, pas par une personne. */
  decide_auto?: boolean;
  /** La validation automatique a échoué : la livraison est à décider à la main. */
  auto_erreur?: string | null;
  decide_le: string | null;
  /** Original d'un pod à preuve (pod 4) : rangée dans `transcription.preuve`. */
  preuve?: PreuveOriginal | null;
}

const COLONNES =
  "id, pod, type, source_url, source_vues, titre, langue_source, musique_titre, musique_url, decks, decks_applications, statut, motif, note_import, tier, contenu_id, created_at, depose_le, decide_auto, auto_erreur, decide_le, preuve:transcription->preuve";

export interface Pod {
  slug: string;
  nom: string;
  actif: boolean;
  label: string | null;
  /** Podz sûr (0323) : ses livraisons en attente sont validées en B au bout de `auto_validation_heures`. */
  auto_validation: boolean;
  auto_validation_heures: number;
}

/** Les pods déclarés (table `pods`) avec le nom de leur label. */
export async function listerPods(): Promise<Pod[]> {
  const { data, error } = await supabase
    .from("pods")
    .select("slug, nom, actif, auto_validation, auto_validation_heures, labels(nom)")
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map((p) => {
    const label = p.labels as unknown as { nom: string } | { nom: string }[] | null;
    return {
      slug: p.slug as string,
      nom: p.nom as string,
      actif: p.actif as boolean,
      label: (Array.isArray(label) ? label[0]?.nom : label?.nom) ?? null,
      auto_validation: Boolean(p.auto_validation),
      auto_validation_heures: Number(p.auto_validation_heures ?? 12),
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

/** Marque un podz sûr (ou non) : ses livraisons en attente seront validées en B toutes seules. */
export async function majAutoValidation(slug: string, actif: boolean): Promise<void> {
  const { error } = await supabase.from("pods").update({ auto_validation: actif }).eq("slug", slug);
  if (error) throw error;
}

/** Heure à laquelle une livraison d'un podz sûr sera validée toute seule (le cron passe à la minute 20). */
export function echeanceAutoValidation(deposeLe: string | null | undefined, heures: number): Date | null {
  const depot = Date.parse(deposeLe ?? "");
  if (!Number.isFinite(depot) || !(heures > 0)) return null;
  return new Date(depot + heures * 3_600_000);
}

// ---------------------------------------------------------------------------
// Tableau de bord des podz (0324, fonction SQL `pods_tableau`)
// ---------------------------------------------------------------------------

export interface JourTableau {
  jour: string;
  publies: number;
  publies_pods: number;
  part: number | null;
}

export interface AutonomiePod {
  application: string;
  /** Passages en vol + restants du cycle. */
  a_publier: number;
  /** Passages publiés par jour, 7 derniers jours (hors rappels). */
  par_jour: number;
  /** a_publier / par_jour ; null sans rythme. */
  jours: number | null;
  reserve_label_jours: number | null;
}

export interface PodTableau {
  slug: string;
  nom: string;
  label: string | null;
  actif: boolean;
  auto_validation: boolean;
  auto_validation_heures: number;
  publies_30j: number;
  publies_7j: number;
  mures: number;
  vues_mediane: number | null;
  pct_10k: number | null;
  max_vues: number | null;
  r_mediane: number | null;
  contenus: number;
  contenus_actifs: number;
  coupes: number;
  en_tete: number;
  a_valider: number;
  auto_erreurs: number;
  validees_7j: number;
  auto_7j: number;
  autonomie: AutonomiePod[];
}

export interface PerceeTableau {
  contenu_id: string;
  pod: string;
  accroche: string | null;
  vues: number;
  compte: string | null;
  langue: string;
  application: string;
  rappel: boolean;
  jour: string;
  tier: string | null;
  url: string | null;
}

export interface TableauPods {
  genere_le: string;
  jours: JourTableau[];
  pods: PodTableau[];
  percees: PerceeTableau[];
}

export async function lireTableauPods(jours = 14): Promise<TableauPods> {
  const { data, error } = await supabase.rpc("pods_tableau", { p_jours: jours });
  if (error) throw error;
  return data as TableauPods;
}

/** Part des podz sur une période : posts des podz / posts publiés, en %. */
export function partSurPeriode(jours: Pick<JourTableau, "publies" | "publies_pods">[]): number | null {
  const publies = jours.reduce((n, j) => n + j.publies, 0);
  if (!publies) return null;
  return Math.round((1000 * jours.reduce((n, j) => n + j.publies_pods, 0)) / publies) / 10;
}

/** L'application la plus courte en autonomie (null : rien à publier ou pas de rythme). */
export function autonomieMin(autonomie: AutonomiePod[]): AutonomiePod | null {
  const mesurees = autonomie.filter((a) => a.jours != null);
  return mesurees.length ? mesurees.reduce((min, a) => (a.jours! < min.jours! ? a : min)) : null;
}

/** Ordre d'affichage des langues : la langue source d'abord, puis l'alphabet. */
export function languesOrdonnees(l: Pick<Livraison, "decks" | "langue_source">): string[] {
  return Object.keys(l.decks ?? {}).sort((a, b) =>
    a === l.langue_source ? -1 : b === l.langue_source ? 1 : a.localeCompare(b),
  );
}

const NOMS_APPLICATIONS: Record<string, string> = { sophia: "Sophia", unswipe: "UnSwipe", micabo: "micabo" };

/** Nom affiché d'une application à partir de son slug. */
export const nomApplication = (slug: string): string => NOMS_APPLICATIONS[slug] ?? slug;

/**
 * Versions montrables d'un deck dans une langue : le deck Sophia s'il porte la
 * slide Sophia (ou s'il n'y a rien d'autre), puis chaque application livrée.
 * Un pod hors Sophia (pod 6) n'a donc que sa version UnSwipe.
 */
export function variantesDeck(
  l: Pick<Livraison, "decks" | "decks_applications">,
  langue: string,
): { cle: string; hashtags: string; slides: SlideLivraison[] }[] {
  const base = l.decks?.[langue];
  const apps = Object.entries(l.decks_applications ?? {}).filter(([, parLangue]) => parLangue?.[langue]?.slides?.length);
  const sortie: { cle: string; hashtags: string; slides: SlideLivraison[] }[] = [];
  if (base && (base.slides.some((s) => s.position_sophia) || !apps.length)) {
    sortie.push({ cle: "sophia", hashtags: base.hashtags ?? "", slides: base.slides });
  }
  for (const [app, parLangue] of apps) {
    const deck = parLangue[langue];
    sortie.push({ cle: app, hashtags: deck.hashtags || base?.hashtags || "", slides: deck.slides });
  }
  return sortie;
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
  // Deux pièges avec les variantes régionales : `pt-BR` ne passe pas un test
  // « deux lettres », et le passer en minuscules donnerait `pt-br`, qui n'est
  // la langue de personne et pointerait vers un autre chemin de stockage. On
  // résout donc vers le code canonique de `LANGUES_CIBLES`.
  const saisi = langue.trim();
  const code = (LANGUES_CIBLES as readonly string[]).find(
    (l) => l.toLowerCase() === saisi.toLowerCase(),
  );
  if (!code) throw new Error(`langue inconnue : « ${saisi} » (fr, en, es, pt-BR…)`);
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
