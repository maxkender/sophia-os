/**
 * 19/11 (Max) : la Bible en moodboard. Les comptes rangés par app (Atala, Micabo, Sophia, Idées, puis Sans label),
 * puis par carte de label (labels_proposes : section, badge, DA). Lectures, écritures et rangement.
 *
 * 19/11 (Adrien) : la Bible est le chemin de l'import, de bout en bout. Deux étapes à la main (À importer, Prochain
 * batch), puis « Lancer l'import » crée les sources ; la suite (En import, À l'essai, Weekly update, Arrêtées) est
 * calculée depuis l'état réel de la source (voir `sources.ts`), plus jamais cochée à la main.
 *
 * 19/11 (soir) : l'appli de running a son nom, Atala, et existe dans l'OS (migration 0764). La section « runvik »
 * (nom de travail, appli « en attente ») est devenue « atala », reliée à la vraie application (0765) : ses cartes se
 * valident comme celles de Sophia et de Micabo (« Créer ce label » crée un label Atala).
 */
import { idApplication } from "@/features/moteur/catalogueApplications";
import { supabase } from "@/lib/supabase/client";

import { handleDe } from "./parse";

/** L'étape enregistrée sur le compte. « importe » est posée par le lancement ; l'onglet, lui, vient de la source. */
export type Etape = "a_importer" | "prochain_batch" | "importe";
/** Les deux étapes à la main, avant l'import. */
export type EtapeManuelle = "a_importer" | "prochain_batch";
/** Les étapes d'une source, calculées depuis son état réel. */
export type EtapeSource = "en_import" | "essai" | "weekly" | "arretees";
/** Un onglet de la page : une étape du chemin, ou la corbeille. */
export type Vue = EtapeManuelle | EtapeSource | "corbeille";
export type Section = "atala" | "micabo" | "sophia" | "idees";
export type Badge = "existe" | "nouveau" | "propose" | "a_confirmer" | "idee";

/**
 * Le chemin, dans l'ordre. `chemin` : une étape du parcours (les autres sont des sorties) ; `auto` : calculée depuis
 * la source. `regle` dit en une phrase comment on entre dans l'étape et comment on en sort.
 */
export const VUES: readonly { cle: Vue; libelle: string; chemin: boolean; auto: boolean }[] = [
  { cle: "a_importer", libelle: "À importer", chemin: true, auto: false },
  { cle: "prochain_batch", libelle: "Prochain batch", chemin: true, auto: false },
  { cle: "en_import", libelle: "En import", chemin: true, auto: true },
  { cle: "essai", libelle: "À l'essai", chemin: true, auto: true },
  { cle: "weekly", libelle: "Weekly update", chemin: true, auto: true },
  { cle: "arretees", libelle: "Arrêtées", chemin: false, auto: true },
  { cle: "corbeille", libelle: "Corbeille", chemin: false, auto: false },
];

export const estVueSource = (v: Vue): v is EtapeSource => v === "en_import" || v === "essai" || v === "weekly" || v === "arretees";

export const SECTIONS: readonly { cle: Section | "sans"; libelle: string; sous?: string }[] = [
  { cle: "atala", libelle: "Atala", sous: "running" },
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

/** Les applications d'une section : leurs ids viennent du catalogue des applications. */
const APP_SECTION: Record<Section, { application_ids: string[]; apps_attente: string[] }> = {
  atala: { application_ids: [idApplication("atala")], apps_attente: [] },
  micabo: { application_ids: [idApplication("micabo")], apps_attente: [] },
  sophia: { application_ids: [idApplication("sophia")], apps_attente: [] },
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
  /** Une remarque de Max (ex. « UGC (vraie personne) : changer les images »). */
  remarque: string | null;
  a_podzer: boolean;
  /** Mis à la corbeille (restaurable), null sinon. */
  supprime_at?: string | null;
  /** La langue de ses TikToks, si on la connaît déjà (demandée au lancement sinon). */
  langue?: string | null;
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

const COLONNES = "id, handle, etape, label_propose_id, autres_cartes, note_import, remarque, a_podzer, supprime_at, langue, posts, miniatures_statut, miniatures_erreur, vues_mediane, meilleur_post_vues, abonnes, ajoute_at";

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

export async function changerEtape(ids: string[], etape: EtapeManuelle): Promise<void> {
  const { error } = await supabase.from("bible_comptes").update({ etape, etape_at: new Date().toISOString() }).in("id", ids);
  if (error) throw new Error(error.message);
}

/** Ce que le lancement a fait d'un compte : parti, en attente du lot suivant, refusé (avec la raison) ou en erreur. */
export interface ResultatLancement {
  id: string;
  handle: string | null;
  statut: "lancee" | "attente" | "refuse" | "erreur";
  raison?: string | null;
  label?: string | null;
  /** Posé : la source démarre par un essai de tant de posts. Nul : ses 100 posts les plus vus. */
  essai_max?: number | null;
  /** En attente : le jour au plus tôt (AAAA-MM-JJ). */
  prevu_le?: string | null;
}

/**
 * « Lancer l'import » : crée la source de chaque compte (label de sa carte, langue donnée) et la met dans la file
 * d'import, tout le batch dans une même séquence (0763). Le serveur revérifie tout et rend un résultat par compte.
 */
export async function lancerBatch(comptes: { id: string; langue: string }[]): Promise<ResultatLancement[]> {
  const { data, error } = await supabase.rpc("bible_lancer_batch", { p_comptes: comptes });
  if (error) throw new Error(error.message);
  return ((data as { resultats?: ResultatLancement[] } | null)?.resultats ?? []) as ResultatLancement[];
}

/** Valide un label proposé : il devient un vrai label de l'OS, la carte passe à « existe ». */
export async function validerCarte(id: string): Promise<void> {
  const { error } = await supabase.rpc("label_propose_valider", { p_id: id });
  if (error) throw new Error(error.message);
}

/** Ce que la Bible sait de la source d'un compte (même handle), pour décider où il se range. */
export interface SourceDuCompte {
  /** Les labels que la source porte déjà. */
  labelIds: string[];
  labels: string[];
}

/**
 * L'onglet d'un compte AVANT l'import, ou `null` s'il n'a plus rien à y faire (sa source existe : il se lit dans les
 * onglets des sources). Un compte déjà source reste visible tant que sa carte vise un label que la source ne porte
 * pas encore (ex. une source Sophia qu'on veut aussi sous un label Micabo).
 */
export function etapeAvantImport(c: CompteBible, carte: CarteLabel | null | undefined, source: SourceDuCompte | null | undefined): EtapeManuelle | null {
  if (source && (!carte || (carte.label_id !== null && source.labelIds.includes(carte.label_id)))) return null;
  return c.etape === "prochain_batch" ? "prochain_batch" : "a_importer";
}

/** Pourquoi un compte du prochain batch peut partir à l'import, ou pas. */
export type Blocage = "pret" | "podz" | "deja_source" | "sans_label" | "label_a_creer";

export function blocageImport(c: CompteBible, carte: CarteLabel | null | undefined, source: SourceDuCompte | null | undefined): Blocage {
  if (c.a_podzer) return "podz";
  if (source) return "deja_source";
  if (!carte) return "sans_label";
  // Plus d'appli « à créer » depuis qu'Atala existe (0764) : il ne manque que le label, à créer depuis sa carte.
  if (!carte.label_id) return "label_a_creer";
  return "pret";
}

export const LIBELLE_BLOCAGE: Record<Blocage, string> = {
  pret: "prêt à importer",
  podz: "à podzer : pas d'import",
  deja_source: "déjà une source",
  sans_label: "sans label",
  label_a_creer: "label à créer",
};

/** Une carte dont le label peut être créé d'ici : proposé ou nouveau, pour une app qui existe (toutes sauf « Idées »). */
export const carteValidable = (c: CarteLabel): boolean =>
  !c.label_id && (c.badge === "nouveau" || c.badge === "propose") && APP_SECTION[c.section].application_ids.length > 0;

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

export const REMARQUE_UGC = "UGC (vraie personne) : changer les images";

/** La note, la remarque et la case « À podzer » d'un compte. */
export async function modifierCompte(id: string, p: { note: string; remarque: string; a_podzer: boolean }): Promise<void> {
  const { error } = await supabase.from("bible_comptes")
    .update({ note_import: p.note.trim() || null, remarque: p.remarque.trim() || null, a_podzer: p.a_podzer }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Les apps de plusieurs sections réunies (ids d'app et apps en attente, sans doublon). */
export function appsDe(sections: Section[]): { application_ids: string[]; apps_attente: string[] } {
  const u = (x: string[]) => [...new Set(x)];
  return {
    application_ids: u(sections.flatMap((s) => APP_SECTION[s].application_ids)),
    apps_attente: u(sections.flatMap((s) => APP_SECTION[s].apps_attente)),
  };
}

/** « Supprimer » : à la corbeille (restaurable). */
export async function mettreCorbeille(id: string): Promise<void> {
  const { error } = await supabase.from("bible_comptes").update({ supprime_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function restaurerCompte(id: string): Promise<void> {
  const { error } = await supabase.from("bible_comptes").update({ supprime_at: null }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Depuis la corbeille seulement : supprimé pour de bon. */
export async function supprimerDefinitivement(id: string): Promise<void> {
  const { error } = await supabase.from("bible_comptes").delete().eq("id", id).not("supprime_at", "is", null);
  if (error) throw new Error(error.message);
}

/**
 * Ajoute (ou range, s'il y est déjà) chaque compte sous la carte choisie, à importer, avec ses apps (une ou
 * plusieurs), sa remarque et la case « À podzer ». Rend les ids touchés.
 */
export async function ajouterComptes(
  handles: string[], carte: CarteLabel | null, sections: Section[],
  opts: { a_podzer?: boolean; remarques?: Record<string, string> } = {},
): Promise<{ crees: string[]; deja: string[]; ids: string[] }> {
  const apps = sections.length ? appsDe(sections) : null;
  const lien = carte ? { label_propose_id: carte.id, label_id: carte.label_id } : {};
  const remarque = (h: string) => opts.remarques?.[h]?.trim() || null;
  const { data: existants, error: e1 } = await supabase.from("bible_comptes").select("id, handle").in("handle", handles);
  if (e1) throw new Error(e1.message);
  const deja = (existants ?? []) as { id: string; handle: string }[];
  const nouveaux = handles.filter((h) => !deja.some((d) => d.handle === h));
  const ids: string[] = deja.map((d) => d.id);
  for (const d of deja) {
    const maj = { supprime_at: null, ...lien, ...(apps ?? {}), ...(remarque(d.handle) ? { remarque: remarque(d.handle) } : {}), ...(opts.a_podzer ? { a_podzer: true } : {}) };
    const { error } = await supabase.from("bible_comptes").update(maj).eq("id", d.id);
    if (error) throw new Error(error.message);
  }
  if (nouveaux.length) {
    const { data, error } = await supabase.from("bible_comptes").insert(nouveaux.map((h) => ({
      handle: h, profil_url: `https://www.tiktok.com/@${h}`, statut: "a_trier", etape: "a_importer", miniatures_statut: "a_faire",
      remarque: remarque(h), a_podzer: Boolean(opts.a_podzer), ...lien, ...(apps ?? { application_ids: [], apps_attente: [] }),
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

/** L'onglet d'un compte quand on ne sait rien des sources : son étape à la main. */
const etapeSimple = (c: CompteBible): EtapeManuelle | null => (c.etape === "prochain_batch" ? "prochain_batch" : "a_importer");

/**
 * Range les comptes d'un onglet d'avant import (ou de la corbeille) : section → carte (dans l'ordre), « Sans label »
 * en dernier. `etapeDe` donne l'onglet de chaque compte (`null` : déjà importé, il n'apparaît plus ici).
 */
export function ranger(
  comptes: CompteBible[], cartes: CarteLabel[], filtre: { etape: Vue; recherche: string; section: Section | "sans" | ""; podzer?: boolean },
  etapeDe: (c: CompteBible) => EtapeManuelle | null = etapeSimple,
): Groupe[] {
  const q = filtre.recherche.trim().toLowerCase().replace(/^@/, "");
  const visibles = comptes.filter((c) => (filtre.etape === "corbeille" ? Boolean(c.supprime_at) : !c.supprime_at && etapeDe(c) === filtre.etape)
    && (!filtre.podzer || c.a_podzer)
    && (!q || c.handle.includes(q) || (c.note_import ?? "").toLowerCase().includes(q) || (c.remarque ?? "").toLowerCase().includes(q)));
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

/** Les compteurs des onglets d'avant import et de la corbeille (ceux des sources viennent de `sources.ts`). */
export const compterEtapes = (
  comptes: CompteBible[], etapeDe: (c: CompteBible) => EtapeManuelle | null = etapeSimple,
): Record<EtapeManuelle | "corbeille", number> => {
  const vivants = comptes.filter((c) => !c.supprime_at);
  return {
    a_importer: vivants.filter((c) => etapeDe(c) === "a_importer").length,
    prochain_batch: vivants.filter((c) => etapeDe(c) === "prochain_batch").length,
    corbeille: comptes.length - vivants.length,
  };
};

/** « 4,8 M », « 317k ». */
export function vuesCourtes(n: number | null | undefined): string | null {
  if (n == null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",").replace(",0", "")} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}
