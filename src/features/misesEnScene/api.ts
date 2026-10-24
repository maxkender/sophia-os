// Banque des captures d'applis, de leurs intégrateurs et de leurs mises en
// scène (migration 0344, fonction `mises-en-scene`). Onglets Captures,
// Intégrateurs et Mises en scène de la Bibliothèque, tous rangés par support.
// Seules les images validées servent aux podz.

import { supabase } from "@/lib/supabase/client";
import { invoke } from "@/features/moteur/api";

export type StatutBanque = "a_valider" | "validee" | "rejetee";
export type Support = "iphone" | "tablette" | "ordinateur";

export const APPLICATIONS_BANQUE = ["micabo", "sophia", "unswipe"] as const;
export const SUPPORTS: Support[] = ["iphone", "tablette", "ordinateur"];
export const ECRANS_CONNUS = ["parcours", "notes", "a-retenir", "lecons", "site"] as const;

export interface CaptureApp {
  id: string;
  application: string | null;
  application_id: string;
  ecran: string;
  support: Support;
  langue: string;
  nature: "originale" | "traduite";
  originale_id: string | null;
  url: string;
  largeur: number | null;
  hauteur: number | null;
  statut: StatutBanque;
  motif_rejet: string | null;
  remplace_id: string | null;
  remplacee_par: string | null;
  created_at: string;
}

export interface Integrateur {
  id: string;
  media_id: string;
  support: Support;
  note: string | null;
  statut: StatutBanque;
  motif_rejet: string | null;
  url: string | null;
  caption: string | null;
  created_at: string;
}

export interface Couple {
  capture_id: string;
  integrateur_id: string;
}

export interface MiseEnScene {
  id: string;
  capture_id: string;
  integrateur_id: string;
  scene_id: string;
  application: string | null;
  application_id: string;
  ecran: string;
  langue: string;
  support: Support;
  url: string;
  largeur: number | null;
  hauteur: number | null;
  statut: StatutBanque;
  motif_rejet: string | null;
  essai: number;
  relance_de: string | null;
  /** Version traduite : la mise en scène d'origine (même photo, même écran). */
  version_de: string | null;
  used_count: number;
  a_refaire: boolean;
  created_at: string;
}

export interface BudgetFal {
  depense_semaine: number;
  budget_semaine: number;
  prix_image: number;
  reste: number;
  possible: boolean;
}

export interface FiltresBanque {
  application?: string;
  support?: Support;
  ecran?: string;
  langue?: string;
  statut?: StatutBanque;
}

export interface SceneCandidate {
  id: string;
  url: string;
  caption: string | null;
}

const FONCTION = "mises-en-scene";

function filtres(f: FiltresBanque): Record<string, string> {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => Boolean(v))) as Record<string, string>;
}

export async function listerCaptures(f: FiltresBanque = {}): Promise<CaptureApp[]> {
  const r = await invoke<{ captures: CaptureApp[] }>(FONCTION, { action: "captures", ...filtres(f) });
  return r.captures ?? [];
}

export async function listerMisesEnScene(f: FiltresBanque = {}): Promise<MiseEnScene[]> {
  const r = await invoke<{ mises_en_scene: MiseEnScene[] }>(FONCTION, {
    action: "mises_en_scene",
    limite: 500,
    ...filtres(f),
  });
  return r.mises_en_scene ?? [];
}

export async function listerIntegrateurs(f: { support?: Support; statut?: StatutBanque } = {}): Promise<Integrateur[]> {
  const r = await invoke<{ integrateurs: Integrateur[] }>(FONCTION, { action: "integrateurs", ...filtres(f) });
  return r.integrateurs ?? [];
}

/** Captures validées × intégrateurs validés du même support, sans mise en scène, ordre varié. */
export async function couplesManquants(application: string, support?: Support, langue = "fr"): Promise<Couple[]> {
  const r = await invoke<{ couples: Couple[] }>(FONCTION, {
    action: "couples_manquants",
    application,
    langue,
    ...(support ? { support } : {}),
  });
  return r.couples ?? [];
}

export async function ajouterIntegrateur(media_id: string, support: Support, note?: string): Promise<Integrateur> {
  const r = await invoke<{ integrateur: Integrateur }>(FONCTION, { action: "ajouter_integrateur", media_id, support, note });
  return r.integrateur;
}

export async function lireBudgetFal(): Promise<BudgetFal> {
  const r = await invoke<{ budget: BudgetFal }>(FONCTION, { action: "budget" });
  return r.budget;
}

/** Écran déduit d'un nom de fichier : « À retenir.PNG » → « a-retenir ». */
export function ecranDepuisNom(nom: string): string {
  return nom
    .replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

async function fichierEnBase64(fichier: File): Promise<string> {
  const octets = new Uint8Array(await fichier.arrayBuffer());
  let bin = "";
  for (let i = 0; i < octets.length; i += 0x8000) {
    bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export async function importerCapture(p: {
  application: string;
  ecran: string;
  support: Support;
  langue: string;
  fichier: File;
  remplace_id?: string | null;
}): Promise<CaptureApp> {
  const r = await invoke<{ capture: CaptureApp }>(FONCTION, {
    action: "importer_capture",
    application: p.application,
    ecran: p.ecran,
    support: p.support,
    langue: p.langue,
    remplace_id: p.remplace_id || undefined,
    image_base64: await fichierEnBase64(p.fichier),
  });
  return r.capture;
}

export async function traduireCapture(id: string, langue: string, forcer = false): Promise<CaptureApp> {
  const r = await invoke<{ capture: CaptureApp }>(FONCTION, { action: "traduire_capture", id, langue, forcer });
  return r.capture;
}

export async function mettreEnScene(p: {
  capture_id: string;
  integrateur_id: string;
  relance_de?: string;
}): Promise<MiseEnScene> {
  const r = await invoke<{ mise_en_scene: MiseEnScene }>(FONCTION, { action: "mettre_en_scene", ...p });
  return r.mise_en_scene;
}

export type EtapeTraduction = "capture_traduite" | "capture_a_valider" | "version";

/**
 * Version `langue` d'une mise en scène d'origine validée, en deux temps : la
 * capture est d'abord traduite à plat (à relire et valider dans Captures),
 * puis l'écran de la même image est remplacé par la capture traduite.
 */
export async function traduireMiseEnScene(id: string, langue: string, relance_de?: string): Promise<EtapeTraduction> {
  const r = await invoke<{ etape: EtapeTraduction }>(FONCTION, {
    action: "traduire_mise_en_scene",
    id,
    langue,
    ...(relance_de ? { relance_de } : {}),
  });
  return r.etape;
}

export interface VersionsManquantes {
  /** Mises en scène d'origine prêtes : capture traduite validée, pas encore de version. */
  pretes: string[];
  /** Captures d'origine encore à traduire (à plat) dans cette langue. */
  captures_a_traduire: string[];
  /** Captures traduites qui attendent leur relecture. */
  captures_a_valider: string[];
}

export async function versionsManquantes(application: string, langue: string, support?: Support): Promise<VersionsManquantes> {
  return await invoke<VersionsManquantes>(FONCTION, {
    action: "versions_manquantes",
    application,
    langue,
    ...(support ? { support } : {}),
  });
}

export interface CarteVersions {
  origine: MiseEnScene;
  /** Par langue, la version vivante (ou la dernière rejetée). Contient la langue d'origine. */
  versions: Record<string, MiseEnScene>;
}

/** Une carte par mise en scène d'origine ; ses versions traduites rangées par langue. */
export function grouperVersions(mises: MiseEnScene[]): CarteVersions[] {
  const cartes = new Map<string, CarteVersions>();
  for (const m of mises) {
    if (!m.version_de) cartes.set(m.id, { origine: m, versions: { [m.langue]: m } });
  }
  const recentes = [...mises].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const v of recentes) {
    const carte = v.version_de ? cartes.get(v.version_de) : undefined;
    if (!carte) continue;
    const deja = carte.versions[v.langue];
    // Une version vivante l'emporte sur une rejetée ; sinon la plus récente.
    if (!deja || deja.statut === "rejetee" || v.statut !== "rejetee") carte.versions[v.langue] = v;
  }
  return [...cartes.values()];
}

export async function deciderBanque(
  objet: "capture" | "integrateur" | "mise_en_scene",
  id: string,
  statut: "validee" | "rejetee",
  motif?: string,
): Promise<void> {
  await invoke(FONCTION, { action: "decider", objet, id, statut, motif });
}

/** Photos propres de la bibliothèque dont la description contient chaque mot (candidates intégrateurs). */
export async function chercherScenes(cherche: string): Promise<SceneCandidate[]> {
  const mots = cherche.toLowerCase().split(/\s+/).filter((m) => m.length >= 3);
  const prefixe = cherche.trim().toLowerCase().match(/^[0-9a-f]{8}/)?.[0];
  let q = supabase.from("media_library").select("id, url, caption").like("storage_path", "propre/%");
  if (prefixe && /^[0-9a-f-]+$/.test(cherche.trim().toLowerCase())) {
    // Un préfixe d'id (a56f6bb0…) : bornes d'uuid, LIKE ne s'applique pas à uuid.
    const { data, error } = await q
      .gte("id", `${prefixe}-0000-0000-0000-000000000000`)
      .lte("id", `${prefixe}-ffff-ffff-ffff-ffffffffffff`)
      .limit(24);
    if (error) throw error;
    return (data ?? []) as SceneCandidate[];
  }
  if (!mots.length) return [];
  for (const m of mots) q = q.ilike("caption", `%${m}%`);
  const { data, error } = await q.order("used_count", { ascending: true }).limit(24);
  if (error) throw error;
  return (data ?? []) as SceneCandidate[];
}
