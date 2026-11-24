/**
 * 19/11 (Max) : la Bible en moodboard. Les comptes rangés par app (Atala, Micabo, Sophia, Idées, puis Sans label),
 * puis par carte de label (labels_proposes : section, badge, DA). Lectures, écritures et rangement.
 *
 * 19/11 (Adrien) : la Bible est le chemin de l'import, de bout en bout. Deux étapes à la main (À importer, Prochain
 * batch), puis « Lancer l'import » crée les sources ; la suite (En import, À l'essai, Mise à jour hebdo, Essai raté, Arrêtées) est
 * calculée depuis l'état réel de la source (voir `sources.ts`), plus jamais cochée à la main.
 *
 * 19/11 (soir) : l'appli de running a son nom, Atala, et existe dans l'OS (migration 0764). La section « runvik »
 * (nom de travail, appli « en attente ») est devenue « atala », reliée à la vraie application (0765) : ses cartes se
 * valident comme celles de Sophia et de Micabo (« Créer ce label » crée un label Atala).
 */
import { CATALOGUE_APPLICATIONS } from "@/features/moteur/catalogueApplications";
import { supabase } from "@/lib/supabase/client";

import { handleDe } from "./parse";

/** L'étape enregistrée sur le compte. « importe » est posée par le lancement ; l'onglet, lui, vient de la source. */
export type Etape = "a_importer" | "prochain_batch" | "importe";
/** Les deux étapes à la main, avant l'import. */
export type EtapeManuelle = "a_importer" | "prochain_batch";
/** Les étapes d'une source, calculées depuis son état réel. */
export type EtapeSource = "en_import" | "essai" | "weekly" | "essai_rate" | "arretees";
/** Un onglet de la page : les propositions de l'éclaireur, une étape du chemin, ou la corbeille. */
export type Vue = "propositions" | EtapeManuelle | EtapeSource | "corbeille";
/**
 * La section d'un bloc : le slug d'une application de l'OS, ou « idees ». Plus de liste figée (0850) : une
 * application créée dans l'OS a sa section toute seule.
 */
export type Section = string;
export type Badge = "existe" | "nouveau" | "propose" | "a_confirmer" | "idee";

/**
 * Le chemin, dans l'ordre. `chemin` : une étape du parcours (les autres sont des sorties) ; `auto` : calculée depuis
 * la source. `regle` dit en une phrase comment on entre dans l'étape et comment on en sort.
 */
export const VUES: readonly { cle: Vue; libelle: string; chemin: boolean; auto: boolean }[] = [
  { cle: "propositions", libelle: "Propositions", chemin: true, auto: false },
  { cle: "a_importer", libelle: "À importer", chemin: true, auto: false },
  { cle: "prochain_batch", libelle: "Prochain batch", chemin: true, auto: false },
  { cle: "en_import", libelle: "En import", chemin: true, auto: true },
  { cle: "essai", libelle: "À l'essai", chemin: true, auto: true },
  { cle: "weekly", libelle: "Mise à jour hebdo", chemin: true, auto: true },
  { cle: "essai_rate", libelle: "Essai raté", chemin: false, auto: true },
  { cle: "arretees", libelle: "Arrêtées", chemin: false, auto: true },
  { cle: "corbeille", libelle: "Corbeille", chemin: false, auto: false },
];

export const estVueSource = (v: Vue): v is EtapeSource =>
  v === "en_import" || v === "essai" || v === "weekly" || v === "essai_rate" || v === "arretees";

export interface SectionBible { cle: Section | "sans"; libelle: string; sous?: string; applicationId?: string }

/** L'ordre historique de la Bible ; les autres applications suivent, dans l'ordre où elles ont été créées. */
const ORDRE_HISTORIQUE = ["atala", "micabo", "sophia"];
/** Les applications qui n'ont pas de section dans la Bible : UnSwipe est arrêtée depuis le 4/11. */
const HORS_BIBLE = new Set(["unswipe"]);
const SOUS: Record<string, string> = { atala: "running" };
const rangApp = (slug: string) => { const i = ORDRE_HISTORIQUE.indexOf(slug); return i < 0 ? ORDRE_HISTORIQUE.length : i; };

/**
 * Les sections, dans l'ordre : une par application, puis Idées, puis Sans label. La liste part du catalogue des
 * applications et se complète avec celles de la base (`declarerApplications`) : une application créée à l'écran
 * (Labels & applications), même inactive, apparaît sans toucher au code.
 */
export const SECTIONS: SectionBible[] = [
  ...CATALOGUE_APPLICATIONS.filter((a) => !HORS_BIBLE.has(a.slug))
    .map((a, i) => ({ a, i })).sort((x, y) => rangApp(x.a.slug) - rangApp(y.a.slug) || x.i - y.i)
    .map(({ a }): SectionBible => ({ cle: a.slug, libelle: a.nom.charAt(0).toUpperCase() + a.nom.slice(1), sous: SOUS[a.slug], applicationId: a.id })),
  { cle: "idees", libelle: "Idées" },
  { cle: "sans", libelle: "Sans label" },
];

/** Ajoute aux sections les applications de la base qui n'y sont pas encore (avant « Idées »). */
export function declarerApplications(apps: { id: string; slug: string; nom: string }[]): void {
  for (const a of apps) {
    if (HORS_BIBLE.has(a.slug) || a.slug === "idees" || a.slug === "sans" || SECTIONS.some((s) => s.cle === a.slug)) continue;
    SECTIONS.splice(SECTIONS.findIndex((s) => s.cle === "idees"), 0, { cle: a.slug, libelle: a.nom, applicationId: a.id });
  }
}

/** Les applications de l'OS (actives ou non), dans l'ordre de leur création : chacune a sa section dans la Bible. */
export async function lireApplications(): Promise<{ id: string; slug: string; nom: string }[]> {
  const { data, error } = await supabase.from("applications").select("id, slug, nom").order("created_at");
  if (error) throw new Error(error.message);
  const apps = (data ?? []) as { id: string; slug: string; nom: string }[];
  declarerApplications(apps);
  return apps;
}

/** Les sections qui sont une application (pas Idées, pas Sans label). */
export const sectionsApps = (): SectionBible[] => SECTIONS.filter((s) => s.applicationId);

export const LIBELLE_BADGE: Record<Badge, string> = {
  existe: "existe",
  nouveau: "nouveau",
  propose: "proposé",
  a_confirmer: "à confirmer",
  idee: "idée",
};

/** Les applications d'une section : l'id de son application ; aucune pour « Idées ». */
const appsDeSection = (section: Section): { application_ids: string[]; apps_attente: string[] } => {
  const id = SECTIONS.find((s) => s.cle === section)?.applicationId;
  return { application_ids: id ? [id] : [], apps_attente: [] };
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
  /**
   * Label « à podzer » (0786) : on en fait un podz (des originaux), on ne l'importe pas. Ses comptes servent
   * d'inspiration. Depuis le 20/11 c'est le LABEL qu'on marque, plus chaque compte.
   */
  a_podzer: boolean;
  /** Le podz est validé : le bloc et ses comptes se rangent dans « Mise à jour hebdo », catégorie Podz. */
  podz_valide_at: string | null;
  /** Le nom du vrai label (carte « existe »). */
  label_nom?: string | null;
  /**
   * Le dernier rattachement de ce bloc à un label de l'OS, tant qu'il peut s'annuler (0769). `fusion` : ses comptes ont
   * rejoint le bloc `vers` (celui du label) ; sinon c'est ce bloc qui a pris le label.
   */
  rattachement?: { label: string; fusion: boolean; vers: string | null; comptes: string[] } | null;
}

/** Les blocs dont les comptes ont été versés dans celui-ci par un rattachement : ils peuvent revenir. */
export const blocsVersesDans = (carte: CarteLabel, cartes: CarteLabel[]): CarteLabel[] =>
  cartes.filter((c) => c.rattachement?.fusion && c.rattachement.vers === carte.id && c.rattachement.comptes.length > 0);

const COLONNES = "id, handle, etape, label_propose_id, autres_cartes, note_import, remarque, supprime_at, langue, posts, miniatures_statut, miniatures_erreur, vues_mediane, meilleur_post_vues, abonnes, ajoute_at";
const COLONNES_CARTE = "id, nom, titre, section, badge, description_da, label_id, ordre, statut, a_podzer, podz_valide_at";

export async function lireComptes(): Promise<CompteBible[]> {
  const { data, error } = await supabase.from("bible_comptes").select(COLONNES).order("ajoute_at").limit(3000);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CompteBible[];
}

export async function lireCartes(): Promise<CarteLabel[]> {
  const { data, error } = await supabase.from("labels_proposes")
    .select(`${COLONNES_CARTE}, rattachement, labels(nom)`)
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

/** Ce que le lancement a fait d'un compte : parti, refusé (avec la raison) ou en erreur. « attente » ne revient plus depuis 0772. */
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
 * « Lancer l'import » : crée la source de chaque compte (label de sa carte, langue donnée) et lance son import
 * tout de suite, chacune de son côté (0763, 0772). Le serveur revérifie tout et rend un résultat par compte.
 */
export async function lancerBatch(comptes: { id: string; langue: string }[]): Promise<ResultatLancement[]> {
  const { data, error } = await supabase.rpc("bible_lancer_batch", { p_comptes: comptes });
  if (error) throw new Error(error.message);
  return ((data as { resultats?: ResultatLancement[] } | null)?.resultats ?? []) as ResultatLancement[];
}

/** Valide un label proposé : il devient un vrai label de l'OS, la carte passe à « existe ». Rend l'id du label. */
export async function validerCarte(id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("label_propose_valider", { p_id: id });
  if (error) throw new Error(error.message);
  return (data as { label_id?: string | null } | null)?.label_id ?? null;
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
  if (estPodzValide(carte)) return null;
  if (source && (!carte || (carte.label_id !== null && source.labelIds.includes(carte.label_id)))) return null;
  return c.etape === "prochain_batch" ? "prochain_batch" : "a_importer";
}

/**
 * Un label « à podzer » validé : on en fait un podz, il n'est jamais importé. Le bloc et ses comptes quittent les
 * onglets d'avant import et se rangent dans « Mise à jour hebdo », catégorie Podz, à titre indicatif (aucune source,
 * aucune mise à jour).
 */
export const estPodzValide = (carte: CarteLabel | null | undefined): boolean => Boolean(carte?.a_podzer && carte.podz_valide_at);

/** Marque un label « à podzer », ou retire la marque. Dans les deux sens, la validation du podz repart de zéro. */
export async function marquerPodz(carteId: string, aPodzer: boolean): Promise<void> {
  const { error } = await supabase.from("labels_proposes").update({ a_podzer: aPodzer, podz_valide_at: null }).eq("id", carteId);
  if (error) throw new Error(error.message);
}

/** Valide des labels à podzer (ils passent, avec leurs comptes, dans la catégorie Podz), ou les en retire. */
export async function validerPodz(carteIds: string[], valide = true): Promise<void> {
  const { error } = await supabase.from("labels_proposes")
    .update({ podz_valide_at: valide ? new Date().toISOString() : null }).in("id", carteIds).eq("a_podzer", true);
  if (error) throw new Error(error.message);
}

/** Pourquoi un compte du prochain batch peut partir à l'import, ou pas. */
export type Blocage = "pret" | "podz" | "deja_source" | "sans_label" | "label_a_creer";

export function blocageImport(carte: CarteLabel | null | undefined, source: SourceDuCompte | null | undefined): Blocage {
  if (carte?.a_podzer) return "podz";
  if (source) return "deja_source";
  if (!carte) return "sans_label";
  // Plus d'appli « à créer » depuis qu'Atala existe (0764) : il ne manque que le label, à créer depuis sa carte.
  if (!carte.label_id) return "label_a_creer";
  return "pret";
}

export const LIBELLE_BLOCAGE: Record<Blocage, string> = {
  pret: "prêt à importer",
  podz: "label à podzer : pas d'import",
  deja_source: "déjà une source",
  sans_label: "sans label",
  label_a_creer: "label à créer",
};

/** Une carte dont le label peut être créé d'ici : proposé ou nouveau, pour une app qui existe (toutes sauf « Idées »). */
export const carteValidable = (c: CarteLabel): boolean =>
  !c.label_id && (c.badge === "nouveau" || c.badge === "propose") && appsDeSection(c.section).application_ids.length > 0;

/** Range le compte sous une carte (et met ses apps d'après la section de la carte). */
export async function changerCarte(id: string, carte: CarteLabel): Promise<void> {
  const { error } = await supabase.from("bible_comptes")
    .update({ label_propose_id: carte.id, label_id: carte.label_id, ...appsDeSection(carte.section) }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Dans une liste de choix, un label de l'OS qui n'a pas encore de bloc : « label:<id> ». */
export const PREFIXE_LABEL = "label:";

/** La valeur qui désigne un label de l'OS dans la liste de choix : son bloc s'il en a un, sinon le label lui-même. */
export const valeurDuLabel = (labelId: string | null | undefined, cartes: CarteLabel[], labels: LabelOs[]): string => {
  if (!labelId) return "";
  const carte = cartes.find((c) => c.label_id === labelId);
  if (carte) return carte.id;
  return labels.some((l) => l.id === labelId) ? PREFIXE_LABEL + labelId : "";
};

/** Un label de l'OS, pour les listes de choix. */
export interface LabelOs {
  id: string;
  nom: string;
}

/** Les labels de l'OS qui n'ont pas encore de bloc dans la Bible. */
export const labelsSansBloc = (labels: LabelOs[], cartes: CarteLabel[]): LabelOs[] => labels.filter((l) => !cartes.some((c) => c.label_id === l.id));

/** La carte d'un label de l'OS, créée (« existe ») s'il n'en avait pas : pour ranger un compte sous n'importe quel label existant. */
export async function carteDuLabel(labelId: string): Promise<CarteLabel> {
  const { data, error } = await supabase.rpc("bible_carte_du_label", { p_label: labelId });
  if (error) throw new Error(error.message);
  return data as unknown as CarteLabel;
}

/**
 * Rattache un bloc sans vrai label à un label de l'OS : ses comptes prennent ce label et deviennent importables.
 * Si le label avait déjà son bloc, les comptes le rejoignent (`fusion`) ; le bloc d'origine reste, vide. Dans les deux
 * cas le rattachement s'annule (`detacherCarte`).
 */
export async function rattacherCarte(carteId: string, labelId: string): Promise<{ fusion: boolean; comptes: number; label: string }> {
  const { data, error } = await supabase.rpc("bible_carte_rattacher", { p_carte: carteId, p_label: labelId });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { fusion?: boolean; comptes?: number; label?: string };
  return { fusion: Boolean(r.fusion), comptes: Number(r.comptes ?? 0), label: r.label ?? "" };
}

/**
 * 23/11 : fusionne un label (bloc) dans un autre. Ses comptes prennent le bloc, le label et les apps de la cible ; le
 * bloc d'origine reste, vide. La fusion s'annule comme un rattachement (`detacherCarte` sur le bloc d'origine).
 */
export async function fusionnerCartes(sourceId: string, cibleId: string): Promise<{ comptes: number; label: string }> {
  const { data, error } = await supabase.rpc("bible_carte_fusionner", { p_source: sourceId, p_cible: cibleId });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { comptes?: number; label?: string };
  return { comptes: Number(r.comptes ?? 0), label: r.label ?? "" };
}

/** Annule le rattachement d'un bloc :ses comptes reviennent (sauf importés ou déplacés depuis), ou il redevient une proposition. */
export async function detacherCarte(carteId: string): Promise<{ comptes: number; label: string }> {
  const { data, error } = await supabase.rpc("bible_carte_detacher", { p_carte: carteId });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { comptes?: number; label?: string };
  return { comptes: Number(r.comptes ?? 0), label: r.label ?? "" };
}

/** Le nom, l'app et la DA d'un label encore proposé (un vrai label se modifie dans Labels & applications). */
export async function modifierCarte(id: string, p: { nom: string; section: Section; description: string }): Promise<void> {
  const { error } = await supabase.from("labels_proposes")
    .update({ nom: p.nom, description_da: p.description.trim() || null, section: p.section, ...appsDeSection(p.section) }).eq("id", id).is("label_id", null);
  if (error) throw new Error(error.message);
}

/** « + nouveau label » : une proposition à valider (jamais un vrai label). */
export async function creerCarte(p: { nom: string; section: Section; description: string }): Promise<CarteLabel> {
  const { data, error } = await supabase.from("labels_proposes").insert({
    nom: p.nom, description_da: p.description || null, statut: "a_valider", section: p.section, badge: "nouveau", ordre: 99,
    ...appsDeSection(p.section),
  }).select(COLONNES_CARTE).single();
  if (error) throw new Error(error.message);
  return data as unknown as CarteLabel;
}

export const REMARQUE_UGC = "UGC (vraie personne) : changer les images";

/** La note et la remarque d'un compte. */
export async function modifierCompte(id: string, p: { note: string; remarque: string }): Promise<void> {
  const { error } = await supabase.from("bible_comptes")
    .update({ note_import: p.note.trim() || null, remarque: p.remarque.trim() || null }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Les apps de plusieurs sections réunies (ids d'app et apps en attente, sans doublon). */
export function appsDe(sections: Section[]): { application_ids: string[]; apps_attente: string[] } {
  const u = (x: string[]) => [...new Set(x)];
  return {
    application_ids: u(sections.flatMap((s) => appsDeSection(s).application_ids)),
    apps_attente: u(sections.flatMap((s) => appsDeSection(s).apps_attente)),
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
 * plusieurs) et sa remarque. Rend les ids touchés.
 */
export async function ajouterComptes(
  handles: string[], carte: CarteLabel | null, sections: Section[],
  opts: { remarques?: Record<string, string> } = {},
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
    const maj = { supprime_at: null, ...lien, ...(apps ?? {}), ...(remarque(d.handle) ? { remarque: remarque(d.handle) } : {}) };
    const { error } = await supabase.from("bible_comptes").update(maj).eq("id", d.id);
    if (error) throw new Error(error.message);
  }
  if (nouveaux.length) {
    const { data, error } = await supabase.from("bible_comptes").insert(nouveaux.map((h) => ({
      handle: h, profil_url: `https://www.tiktok.com/@${h}`, statut: "a_trier", etape: "a_importer", miniatures_statut: "a_faire",
      remarque: remarque(h), ...lien, ...(apps ?? { application_ids: [], apps_attente: [] }),
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
  const parId = new Map(cartes.map((c) => [c.id, c]));
  // « À podzer » : les comptes dont le LABEL est à podzer (0786).
  const visibles = comptes.filter((c) => (filtre.etape === "corbeille" ? Boolean(c.supprime_at) : !c.supprime_at && etapeDe(c) === filtre.etape)
    && (!filtre.podzer || Boolean(c.label_propose_id && parId.get(c.label_propose_id)?.a_podzer))
    && (!q || c.handle.includes(q) || (c.note_import ?? "").toLowerCase().includes(q) || (c.remarque ?? "").toLowerCase().includes(q)));
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
