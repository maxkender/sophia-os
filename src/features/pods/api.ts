// Pods — file de validation des livraisons (migration 0259, fonction `pods`).

import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";
import { ficheApplication, ficheApplicationParId } from "@/features/moteur/catalogueApplications";
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
   * Label hors Sophia de plusieurs applications (24/11, Atala + Artura) : une
   * variante par application, mêmes images, seule la slide de CETTE application marquée.
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
  label_id: string | null;
  /** Les langues que le podz livre lui-même (`pods.langues`, 0654) ; nul : l'OS traduit. */
  langues: string[] | null;
  /** Les langues que son atelier sait produire (`pods.langues_pretes`, 0781) ; nul avant la migration. */
  langues_pretes: string[] | null;
  /** Ses comptes modèles (`pods.modeles`, 0785), sans @ ; vide avant la migration. */
  modeles: string[];
  cree_le: string | null;
  /** Les applications servies par son label (slugs du catalogue), dans l'ordre du catalogue. */
  apps: string[];
}

type LabelDuPod = {
  nom: string;
  application_id: string | null;
  label_applications: { application_id: string }[] | null;
};

/** Les applications d'un label : `label_applications`, sinon l'application du label. */
function appsDuLabel(label: LabelDuPod | null): string[] {
  if (!label) return [];
  const ids = label.label_applications?.length
    ? label.label_applications.map((l) => l.application_id)
    : label.application_id
      ? [label.application_id]
      : [];
  const slugs = ids.map((id) => ficheApplicationParId(id)?.slug).filter((s): s is string => Boolean(s));
  return [...new Set(slugs)];
}

/** Les pods déclarés (table `pods`) avec leur label, ses applications et leurs langues. */
export async function listerPods(): Promise<Pod[]> {
  const colonnes = (pretes: boolean) =>
    `slug, nom, actif, auto_validation, auto_validation_heures, langues,${pretes ? " langues_pretes, modeles," : ""} created_at, label_id, labels(nom, application_id, label_applications(application_id))`;
  let { data, error } = await supabase.from("pods").select(colonnes(true)).order("created_at");
  // Avant les migrations 0781 et 0785, `langues_pretes` et `modeles` n'existent pas : on lit sans elles.
  if (error) ({ data, error } = await supabase.from("pods").select(colonnes(false)).order("created_at"));
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((p) => {
    const brut = p.labels as unknown as LabelDuPod | LabelDuPod[] | null;
    const label = (Array.isArray(brut) ? brut[0] : brut) ?? null;
    return {
      slug: p.slug as string,
      nom: p.nom as string,
      actif: p.actif as boolean,
      label: label?.nom ?? null,
      auto_validation: Boolean(p.auto_validation),
      auto_validation_heures: Number(p.auto_validation_heures ?? 12),
      label_id: (p.label_id as string | null) ?? null,
      langues: (p.langues as string[] | null) ?? null,
      langues_pretes: (p.langues_pretes as string[] | null | undefined) ?? null,
      modeles: (p.modeles as string[] | null | undefined) ?? [],
      cree_le: (p.created_at as string | null) ?? null,
      apps: appsDuLabel(label),
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

/**
 * File d'attente (la plus ancienne d'abord) + les 30 dernières décidées.
 * Plafond 500 (sous le max-rows de 1000) : le 16/11, 110 livraisons en attente,
 * les rattrapages de Kaja (au-delà des 100 premières) n'apparaissaient pas.
 */
export async function listerLivraisons(): Promise<{ aValider: Livraison[]; decidees: Livraison[] }> {
  const [attente, faites] = await Promise.all([
    supabase.from("pod_livraisons").select(COLONNES).eq("statut", "a_valider").order("created_at").limit(500),
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

/** Les livraisons d'UN podz : toute sa file d'attente et ses 30 dernières décidées (fiche du podz). */
export async function listerLivraisonsDuPod(pod: string): Promise<{ aValider: Livraison[]; decidees: Livraison[] }> {
  const [attente, faites] = await Promise.all([
    supabase.from("pod_livraisons").select(COLONNES).eq("pod", pod).eq("statut", "a_valider").order("created_at").limit(200),
    supabase
      .from("pod_livraisons")
      .select(COLONNES)
      .eq("pod", pod)
      .neq("statut", "a_valider")
      .order("decide_le", { ascending: false })
      .limit(30),
  ]);
  if (attente.error) throw attente.error;
  if (faites.error) throw faites.error;
  return { aValider: (attente.data ?? []) as Livraison[], decidees: (faites.data ?? []) as Livraison[] };
}

/** Qui a fait le geste : la soupape de nuit, Adrien ou Max sur la page, l'atelier du podz, Claude en SQL. */
export type AuteurLangue = "soupape" | "admin" | "podz" | "claude";

/** Une ligne du journal des langues (`bleo_langues_ouvertes`, 0722 et 0781). */
export interface OuvertureLangue {
  pod: string;
  langue: string;
  ouvert_le: string;
  action: "ouverte" | "fermee";
  par: AuteurLangue;
}

export async function listerOuverturesLangues(): Promise<OuvertureLangue[]> {
  const lire = (colonnes: string) =>
    supabase.from("bleo_langues_ouvertes").select(colonnes).order("ouvert_le").limit(1000);
  let { data, error } = await lire("pod, langue, ouvert_le, action, par");
  // Avant la migration 0781 : pas de colonnes `action` et `par`, tout est une ouverture de la soupape.
  if (error) ({ data, error } = await lire("pod, langue, ouvert_le"));
  if (error) throw error;
  return ((data ?? []) as unknown as Partial<OuvertureLangue>[]).map((o) => ({
    pod: String(o.pod),
    langue: String(o.langue),
    ouvert_le: String(o.ouvert_le),
    action: o.action ?? "ouverte",
    par: o.par ?? "soupape",
  }));
}

/** Ce que rend `podz_langue` (0781). */
export interface GesteLangue {
  ok: boolean;
  change: boolean;
  langue: string;
  langues: string[];
  /** Les comptes actifs du label dans cette langue. */
  comptes: number;
}

/** Ouvre ou ferme une langue d'un podz en images finies : le seul geste, noté au journal. */
export async function changerLanguePodz(pod: string, langue: string, action: "ouvrir" | "fermer"): Promise<GesteLangue> {
  const { data, error } = await supabase.rpc("podz_langue", { p_pod: pod, p_langue: langue, p_action: action, p_par: "admin" });
  if (error) throw error;
  return data as GesteLangue;
}

/** Les sources actives d'un label (comptes dont l'OS importe les posts) : leurs handles. */
export async function listerSourcesDuLabel(labelId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("compte_reference_labels")
    .select("comptes_reference!inner(handle_tiktok, is_active)")
    .eq("label_id", labelId)
    .eq("comptes_reference.is_active", true)
    .limit(200);
  if (error) throw error;
  return (data ?? [])
    .map((l) => {
      const c = l.comptes_reference as unknown as { handle_tiktok: string | null } | { handle_tiktok: string | null }[];
      return (Array.isArray(c) ? c[0]?.handle_tiktok : c?.handle_tiktok) ?? null;
    })
    .filter((h): h is string => Boolean(h))
    .sort((a, b) => a.localeCompare(b));
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
  /** Vues moyennes des posts mûrs (0717) ; absent avant la migration. */
  vues_moyenne?: number | null;
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

/** Nom affiché d'une application à partir de son slug : la marque du catalogue (« UnSwipe », « micabo »). */
export const nomApplication = (slug: string): string => ficheApplication(slug)?.marque ?? slug;

/**
 * Versions montrables d'un deck dans une langue : le deck Sophia s'il porte la
 * slide Sophia (ou s'il n'y a rien d'autre), puis chaque application livrée.
 * Un pod hors Sophia (pod 6) n'a donc que sa version UnSwipe ; un label hors
 * Sophia de plusieurs applications, une version par application.
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

/** Verdicts d'un podz de la voie 1 sur 21 jours et changement de rythme proposé (`bleo_rythme_resultats`, 0716). */
export interface ResultatsPod {
  verdicts: number;
  gagnants: number;
  taux: number | null;
  taux_flotte: number | null;
  full_tests_juges: number;
  full_tests_gagnants: number;
  declinaisons_jugees: number;
  declinaisons_gagnantes: number;
  en_attente: number;
  file_utilise: number | null;
  file_capacite: number | null;
  changement: number;
  raison: string;
}

/** La fiche d'un podz actif (`pods_fiches`, 0716). */
export interface FichePod {
  slug: string;
  nom: string;
  label: string;
  voie: 1 | 2;
  cent_podz: boolean;
  langues_pod: string[] | null;
  comptes: number;
  comptes_par_langue: Record<string, number>;
  publies_15j: number;
  aujourdhui: { full_test: number; declinaison: number; remake: number; a_valider: number; rejetees: number };
  boite: { familles: number; semaines: number; part_full_test: number; livre_par_jour: number } | null;
  resultats: ResultatsPod | null;
}

export async function lireFichesPods(): Promise<FichePod[]> {
  const { data, error } = await supabase.rpc("pods_fiches");
  if (error) throw error;
  return ((data ?? []) as FichePod[]).map((f) => ({
    ...f,
    boite: f.boite
      ? {
          familles: Number(f.boite.familles),
          semaines: Number(f.boite.semaines),
          part_full_test: Number(f.boite.part_full_test),
          livre_par_jour: Number(f.boite.livre_par_jour),
        }
      : null,
    resultats: f.resultats
      ? {
          ...f.resultats,
          taux: f.resultats.taux === null ? null : Number(f.resultats.taux),
          taux_flotte: f.resultats.taux_flotte === null ? null : Number(f.resultats.taux_flotte),
        }
      : null,
  }));
}

/** « +2 », « −1 », « 0 » : le changement de rythme tel qu'on le lit. */
export function libelleChangement(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "0";
}

/** Les langues des comptes, de la plus remplie à la moins remplie (puis par code). */
export function languesParComptes(parLangue: Record<string, number>): [string, number][] {
  return Object.entries(parLangue).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Un compte qui porte le label d'un podz (`pods_comptes`, 0717). */
export interface CompteDuPod {
  compte_id: string;
  handle: string | null;
  langue: string;
  pays: string | null;
  cree_le: string;
  posts_15j: number;
  mures: number;
  vues_moyenne: number | null;
  vues_max: number | null;
  dernier_post: string | null;
}

export async function listerComptesPod(pod: string): Promise<CompteDuPod[]> {
  const { data, error } = await supabase.rpc("pods_comptes", { p_pod: pod });
  if (error) throw error;
  return (data ?? []) as CompteDuPod[];
}

/** Un jour d'un podz (`pods_series`, 0727). */
export interface JourPod {
  pod: string;
  jour: string;
  posts: number;
  moy_j1: number | null;
  moy_j2: number | null;
  moy_j3: number | null;
  moy_j7: number | null;
  moy: number | null;
  p10k: number;
}

/** L'âge auquel on compare les jours entre eux. */
export type Jalon = "moy_j1" | "moy_j2" | "moy_j3" | "moy_j7";

export async function lireSeriesPods(jours = 21): Promise<JourPod[]> {
  const { data, error } = await supabase.rpc("pods_series", { p_jours: jours });
  if (error) throw error;
  return (data ?? []) as JourPod[];
}

/**
 * Les jours d'un podz, avec la moyenne à J+1 de tous les podz le même jour
 * (pondérée par les posts) pour comparer.
 */
export function serieDuPod(
  lignes: readonly JourPod[],
  pod: string,
  jalon: Jalon = "moy_j1",
): (JourPod & { valeur: number | null; flotte: number | null })[] {
  const flotte = new Map<string, { somme: number; n: number }>();
  for (const l of lignes) {
    const v = l[jalon];
    if (v == null) continue;
    const f = flotte.get(l.jour) ?? { somme: 0, n: 0 };
    f.somme += v * l.posts;
    f.n += l.posts;
    flotte.set(l.jour, f);
  }
  return lignes
    .filter((l) => l.pod === pod)
    .map((l) => {
      const f = flotte.get(l.jour);
      return { ...l, valeur: l[jalon], flotte: f && f.n > 0 ? Math.round(f.somme / f.n) : null };
    });
}

// ---------------------------------------------------------------------------
// Allocation des podz (0782) : places libres, candidats, déplacement d'un compte
// ---------------------------------------------------------------------------

/** Une place libre : une langue ouverte d'un podz où aucun compte de son label ne poste (`podz_places`). */
export interface PlaceLibre {
  pod: string;
  pod_nom: string;
  label_id: string;
  label: string;
  applications: string[] | null;
  langue: string;
  /** L'atelier du podz sait déjà produire cette langue. */
  prete: boolean;
  /** Les comptes actifs du label, toutes langues. */
  comptes_label: number;
  ouverte_le: string | null;
  ouverte_par: AuteurLangue | null;
}

export async function listerPlaces(): Promise<PlaceLibre[]> {
  const { data, error } = await supabase.rpc("podz_places");
  if (error) throw error;
  return (data ?? []) as PlaceLibre[];
}

/** Un compte qui pourrait prendre une place (`podz_candidats`). */
export interface CandidatPlace {
  compte_id: string;
  handle: string | null;
  langue: string;
  pays: string | null;
  cree_le: string;
  poster: string | null;
  labels: { id: string; nom: string }[];
  /** Les comptes actifs de son label actuel dans sa langue : plus il y en a, plus les mêmes posts tournent. */
  empilement: number;
  posts_15j: number;
  vues_moyenne: number | null;
  vues_max: number | null;
  dernier_post: string | null;
}

export async function listerCandidats(labelId: string, langue: string): Promise<CandidatPlace[]> {
  const { data, error } = await supabase.rpc("podz_candidats", { p_label: labelId, p_langue: langue });
  if (error) throw error;
  return ((data ?? []) as CandidatPlace[]).map((c) => ({ ...c, labels: c.labels ?? [] }));
}

/** Ce que rend `compte_deplacer`. */
export interface GesteDeplacement {
  ok: boolean;
  change: boolean;
  id?: number;
  label?: string;
  /** Faux : le label d'arrivée est en images finies et la langue du compte n'y est pas ouverte. */
  langue_ouverte?: boolean | null;
}

/** Change un compte de label : `de` le label qu'il quitte (nul : il n'en avait pas), `vers` celui qu'il prend. Noté au journal, annulable. */
export async function deplacerCompte(compteId: string, de: string | null, vers: string, raison?: string): Promise<GesteDeplacement> {
  const { data, error } = await supabase.rpc("compte_deplacer", { p_compte: compteId, p_de: de, p_vers: vers, p_raison: raison ?? null });
  if (error) throw error;
  return data as GesteDeplacement;
}

export async function annulerDeplacement(id: number): Promise<void> {
  const { error } = await supabase.rpc("compte_deplacement_annuler", { p_id: id });
  if (error) throw error;
}

/** Une ligne du journal des déplacements (`comptes_deplacements`). */
export interface Deplacement {
  id: number;
  compte_id: string;
  handle: string | null;
  langue: string | null;
  label_de: string | null;
  label_vers: string | null;
  deplace_le: string;
  annule_le: string | null;
}

export async function listerDeplacements(limite = 30): Promise<Deplacement[]> {
  const { data, error } = await supabase
    .from("comptes_deplacements")
    .select("id, compte_id, deplace_le, annule_le, comptes(handle_tiktok, langue), de:labels!comptes_deplacements_label_de_fkey(nom), vers:labels!comptes_deplacements_label_vers_fkey(nom)")
    .order("deplace_le", { ascending: false })
    .limit(limite);
  if (error) throw error;
  const un = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? (x[0] ?? null) : x);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((d) => {
    const compte = un(d.comptes as { handle_tiktok: string | null; langue: string | null } | null);
    return {
      id: Number(d.id),
      compte_id: String(d.compte_id),
      handle: compte?.handle_tiktok ?? null,
      langue: compte?.langue ?? null,
      label_de: un(d.de as { nom: string } | null)?.nom ?? null,
      label_vers: un(d.vers as { nom: string } | null)?.nom ?? null,
      deplace_le: String(d.deplace_le),
      annule_le: (d.annule_le as string | null) ?? null,
    };
  });
}

/** Une commande de rattrapage (`bleo_rattrapage_du_pod`, 0654) : un post gagnant qui manque dans des langues où le label a un compte. */
export interface CommandeRattrapage {
  rang: number;
  contenu_id: string;
  source_id: string | null;
  titre: string | null;
  accroche: string | null;
  langues: string[];
  vues_famille: number | null;
  /** Déjà déposé par le podz, attend la validation. */
  en_attente: boolean;
}

export async function listerRattrapage(pod: string): Promise<CommandeRattrapage[]> {
  const { data, error } = await supabase.rpc("bleo_rattrapage_du_pod", { p_pod: pod });
  if (error) throw error;
  return ((data ?? []) as CommandeRattrapage[]).map((c) => ({ ...c, langues: c.langues ?? [] }));
}
