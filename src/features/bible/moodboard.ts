/**
 * 19/11 (Max) : la Bible en moodboard. Les comptes rangés par app (Runvik, Micabo, Sophia, Idées, puis Sans label),
 * puis par carte de label (labels_proposes : section, badge, DA) ; le process en 3 étapes (À importer → Prochain
 * batch → Importé), qui ne change que l'étape dans la Bible. Lectures, écritures et rangement.
 */
import { supabase } from "@/lib/supabase/client";

import { handleDe } from "./parse";

export type Etape = "a_importer" | "prochain_batch" | "importe";
export type Section = "runvik" | "micabo" | "sophia" | "idees";
export type Badge = "existe" | "nouveau" | "propose" | "a_confirmer" | "idee";

export const ETAPES: readonly { cle: Etape; libelle: string }[] = [
  { cle: "a_importer", libelle: "À importer" },
  { cle: "prochain_batch", libelle: "Prochain batch" },
  { cle: "importe", libelle: "Importés" },
];

export const SECTIONS: readonly { cle: Section | "sans"; libelle: string; sous?: string }[] = [
  { cle: "runvik", libelle: "Runvik", sous: "running" },
  { cle: "micabo", libelle: "Micabo" },
  { cle: "sophia", libelle: "Sophia" },
  { cle: "idees", libelle: "Idées" },
  { cle: "sans", libelle: "Sans label" },
];

export const LIBELLE_BADGE: Record<Badge, string> = {
  existe: "existe",
  nouveau: "nouveau",
  propose: "proposé",
  a_confirmer: "à confirmer",
  idee: "idée",
};

const APP_SECTION: Record<Section, { application_ids: string[]; apps_attente: string[] }> = {
  runvik: { application_ids: [], apps_attente: ["Runvik – running"] },
  micabo: { application_ids: ["00000000-0000-4000-8000-000000000002"], apps_attente: [] },
  sophia: { application_ids: ["00000000-0000-4000-8000-000000000001"], apps_attente: [] },
  idees: { application_ids: [], apps_attente: [] },
};

export interface Miniature {
  url: string;
  miniature_url?: string | null;
  miniature_path?: string | null;
  vues?: number | null;
  erreur?: string | null;
}

export interface CompteBible {
  id: string;
  handle: string;
  etape: Etape;
  label_propose_id: string | null;
  autres_cartes: string[];
  note_import: string | null;
  posts: Miniature[];
  miniatures_statut: "a_faire" | "ok" | "partiel" | "sans_liens" | "erreur" | null;
  miniatures_erreur: string | null;
  vues_mediane: number | null;
  meilleur_post_vues: number | null;
  abonnes: number | null;
  ajoute_at: string;
}

export interface CarteLabel {
  id: string;
  nom: string;
  titre: string | null;
  section: Section;
  badge: Badge;
  description_da: string | null;
  label_id: string | null;
  ordre: number | null;
  statut: string;
  /** Le nom du vrai label (carte « existe »). */
  label_nom?: string | null;
}

const COLONNES = "id, handle, etape, label_propose_id, autres_cartes, note_import, posts, miniatures_statut, miniatures_erreur, vues_mediane, meilleur_post_vues, abonnes, ajoute_at";

export async function lireComptes(): Promise<CompteBible[]> {
  const { data, error } = await supabase.from("bible_comptes").select(COLONNES).order("ajoute_at").limit(3000);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CompteBible[];
}

export async function lireCartes(): Promise<CarteLabel[]> {
  const { data, error } = await supabase.from("labels_proposes")
    .select("id, nom, titre, section, badge, description_da, label_id, ordre, statut, labels(nom)")
    .not("section", "is", null).neq("statut", "refuse").order("ordre");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as (CarteLabel & { labels: { nom: string } | null })[])
    .map(({ labels, ...c }) => ({ ...c, label_nom: labels?.nom ?? null }));
}

export const nomCarte = (c: CarteLabel): string => c.titre ?? c.label_nom ?? c.nom;

export async function changerEtape(ids: string[], etape: Etape): Promise<void> {
  const { error } = await supabase.from("bible_comptes").update({ etape, etape_at: new Date().toISOString() }).in("id", ids);
  if (error) throw new Error(error.message);
}

export async function marquerBatchImporte(): Promise<number> {
  const { data, error } = await supabase.rpc("bible_batch_importe");
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Range le compte sous une carte (et met ses apps d'après la section de la carte). */
export async function changerCarte(id: string, carte: CarteLabel): Promise<void> {
  const { error } = await supabase.from("bible_comptes")
    .update({ label_propose_id: carte.id, label_id: carte.label_id, ...APP_SECTION[carte.section] }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** « + nouveau label » : une proposition à valider (jamais un vrai label). */
export async function creerCarte(p: { nom: string; section: Section; description: string }): Promise<CarteLabel> {
  const { data, error } = await supabase.from("labels_proposes").insert({
    nom: p.nom, description_da: p.description || null, statut: "a_valider", section: p.section, badge: "nouveau", ordre: 99,
    ...APP_SECTION[p.section],
  }).select("id, nom, titre, section, badge, description_da, label_id, ordre, statut").single();
  if (error) throw new Error(error.message);
  return data as unknown as CarteLabel;
}

export async function modifierNote(id: string, note: string): Promise<void> {
  const { error } = await supabase.from("bible_comptes").update({ note_import: note.trim() || null }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function supprimerCompte(id: string): Promise<void> {
  const { error } = await supabase.from("bible_comptes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Ajoute (ou range, s'il y est déjà) chaque compte sous la carte choisie, à importer. Rend les ids touchés. */
export async function ajouterComptes(handles: string[], carte: CarteLabel | null, section: Section | null): Promise<{ crees: string[]; deja: string[]; ids: string[] }> {
  const apps = section ? APP_SECTION[section] : { application_ids: [], apps_attente: [] };
  const lien = carte ? { label_propose_id: carte.id, label_id: carte.label_id } : {};
  const { data: existants, error: e1 } = await supabase.from("bible_comptes").select("id, handle").in("handle", handles);
  if (e1) throw new Error(e1.message);
  const deja = (existants ?? []) as { id: string; handle: string }[];
  const nouveaux = handles.filter((h) => !deja.some((d) => d.handle === h));
  const ids: string[] = deja.map((d) => d.id);
  if (deja.length && (carte || section)) {
    const { error } = await supabase.from("bible_comptes").update({ ...lien, ...apps }).in("id", deja.map((d) => d.id));
    if (error) throw new Error(error.message);
  }
  if (nouveaux.length) {
    const { data, error } = await supabase.from("bible_comptes").insert(nouveaux.map((h) => ({
      handle: h, profil_url: `https://www.tiktok.com/@${h}`, statut: "a_trier", etape: "a_importer", miniatures_statut: "a_faire", ...lien, ...apps,
    }))).select("id");
    if (error) throw new Error(error.message);
    ids.push(...((data ?? []) as { id: string }[]).map((r) => r.id));
  }
  return { crees: nouveaux, deja: deja.map((d) => d.handle), ids };
}

export async function rafraichirMiniatures(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke("bible", { body: { action: "miniatures", id } });
  if (error) throw error;
}

/** Les handles d'un collage de liens (profils ou posts TikTok, ou @handle), sans doublon. */
export function handlesDuTexte(texte: string): { handles: string[]; courts: string[]; ignores: string[] } {
  const handles: string[] = [];
  const courts: string[] = [];
  const ignores: string[] = [];
  for (const brut of texte.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)) {
    if (/^https?:\/\/(vm|vt)\.tiktok\.com\/|tiktok\.com\/t\//i.test(brut)) { courts.push(brut); continue; }
    const h = handleDe(brut);
    if (h) {
      const n = h.toLowerCase();
      if (!handles.includes(n)) handles.push(n);
    } else ignores.push(brut);
  }
  return { handles, courts, ignores };
}

export interface Groupe {
  section: Section | "sans";
  cartes: { carte: CarteLabel | null; comptes: { compte: CompteBible; aussi: boolean }[] }[];
  total: number;
}

/** Range les comptes d'une étape : section → carte (dans l'ordre), « Sans label » en dernier. */
export function ranger(comptes: CompteBible[], cartes: CarteLabel[], filtre: { etape: Etape; recherche: string; section: Section | "sans" | "" }): Groupe[] {
  const q = filtre.recherche.trim().toLowerCase().replace(/^@/, "");
  const visibles = comptes.filter((c) => c.etape === filtre.etape && (!q || c.handle.includes(q) || (c.note_import ?? "").toLowerCase().includes(q)));
  const parId = new Map(cartes.map((c) => [c.id, c]));
  return SECTIONS
    .filter((s) => !filtre.section || filtre.section === s.cle)
    .map((s) => {
      if (s.cle === "sans") {
        const sans = visibles.filter((c) => !c.label_propose_id || !parId.has(c.label_propose_id));
        return { section: s.cle, cartes: sans.length ? [{ carte: null, comptes: sans.map((compte) => ({ compte, aussi: false })) }] : [], total: sans.length };
      }
      const liste = cartes.filter((c) => c.section === s.cle).sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99) || a.nom.localeCompare(b.nom))
        .map((carte) => ({
          carte,
          comptes: [
            ...visibles.filter((c) => c.label_propose_id === carte.id).map((compte) => ({ compte, aussi: false })),
            ...visibles.filter((c) => c.label_propose_id !== carte.id && c.autres_cartes?.includes(carte.id)).map((compte) => ({ compte, aussi: true })),
          ],
        }))
        .filter((g) => g.comptes.length > 0);
      const total = new Set(liste.flatMap((g) => g.comptes.filter((x) => !x.aussi).map((x) => x.compte.id))).size;
      return { section: s.cle, cartes: liste, total };
    })
    .filter((g) => g.cartes.length > 0);
}

export const compterEtapes = (comptes: CompteBible[]): Record<Etape, number> => ({
  a_importer: comptes.filter((c) => c.etape === "a_importer").length,
  prochain_batch: comptes.filter((c) => c.etape === "prochain_batch").length,
  importe: comptes.filter((c) => c.etape === "importe").length,
});

/** « 4,8 M », « 317k ». */
export function vuesCourtes(n: number | null | undefined): string | null {
  if (n == null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}
