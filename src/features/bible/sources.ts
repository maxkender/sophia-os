/**
 * 19/11 (Adrien) : les sources dans la Bible. Après « Lancer l'import », un compte est une source, et son onglet se
 * CALCULE depuis son état réel : En import (dans la file ou en cours), À l'essai (ses 30 premiers posts, pas encore
 * jugée), Weekly update (mise à jour chaque lundi si elle marche), Arrêtées (essai raté ou désactivée).
 *
 * Aucune règle n'est décidée ici : elles sont en base (0667, 0686, 0721, 0763). Ce fichier rassemble les lectures
 * que la page Sources fait déjà (stock, r, file, décision du lundi) et dit, en une phrase, où en est chaque source.
 */
import { contenusParSource, listerSources, performanceSources, type SemaineSources, type SourceLundi, sourcesDeLaSemaine } from "@/features/moteur/api";
import { type FileSources, lireFileSources, type SourceEnAttente } from "@/features/moteur/fileSources";
import type { PerfSource } from "@/features/moteur/perfSource";
import type { CompteReference } from "@/features/moteur/types";
import { supabase } from "@/lib/supabase/client";

import { lireImportes, lireLabels } from "./api";
import type { CarteLabel, EtapeSource, ResultatLancement, Section, SourceDuCompte, Vue } from "./moodboard";
import type { CompteImporte, LabelBible } from "./types";

const SOPHIA = "00000000-0000-4000-8000-000000000001";
const MICABO = "00000000-0000-4000-8000-000000000002";

/** Le handle tel que la Bible le range : minuscules, sans @ (comme `bible_handle` en base). */
export const handleNormal = (h: string | null | undefined): string => (h ?? "").trim().replace(/^@+/, "").toLowerCase();

/** Les seuils de l'import (`reglages.bleo.sources`), pour dire les règles avec les vrais chiffres. */
export interface ReglesSources {
  rMin: number;
  rVsLabelMin: number;
  vuesCoup: number;
  postsMin: number;
  lotMax: number;
  essaiPosts: number;
  essaiMesuresMin: number;
  postsMaxParMaj: number;
}

/** Les valeurs que les fonctions SQL prennent quand le réglage est absent. */
export const REGLES_DEFAUT: ReglesSources = {
  rMin: 1, rVsLabelMin: 1, vuesCoup: 100_000, postsMin: 5, lotMax: 6, essaiPosts: 30, essaiMesuresMin: 10, postsMaxParMaj: 100,
};

export function versRegles(brut: Record<string, unknown> | null | undefined): ReglesSources {
  const n = (cle: string, defaut: number) => {
    const v = Number(brut?.[cle]);
    return brut?.[cle] !== null && brut?.[cle] !== undefined && Number.isFinite(v) ? v : defaut;
  };
  return {
    rMin: n("r_min", REGLES_DEFAUT.rMin),
    rVsLabelMin: n("r_vs_label_min", REGLES_DEFAUT.rVsLabelMin),
    vuesCoup: n("vues_coup", REGLES_DEFAUT.vuesCoup),
    postsMin: n("posts_min", REGLES_DEFAUT.postsMin),
    lotMax: n("lot_max", REGLES_DEFAUT.lotMax),
    essaiPosts: n("essai_posts", REGLES_DEFAUT.essaiPosts),
    essaiMesuresMin: n("essai_mesures_min", REGLES_DEFAUT.essaiMesuresMin),
    postsMaxParMaj: n("posts_max_par_maj", REGLES_DEFAUT.postsMaxParMaj),
  };
}

export async function lireReglesSources(): Promise<ReglesSources> {
  const { data, error } = await supabase.from("reglages").select("valeur").eq("cle", "bleo").maybeSingle();
  if (error) throw new Error(error.message);
  return versRegles(((data?.valeur as { sources?: Record<string, unknown> } | null)?.sources ?? null));
}

export interface SourceBible {
  id: string;
  /** Normalisé (minuscules, sans @) : c'est lui qui relie la source à son compte de la Bible. */
  handle: string;
  langue: string | null;
  actif: boolean;
  labels: { id: string; nom: string }[];
  /** 3 slides de nos médias (la 1re slide de ses posts les plus vus), avec le lien du post TikTok. */
  slides: { url: string; post: string | null }[];
  /** Slideshows importés (tous statuts) et gardés (validés). */
  importes: number;
  valides: number;
  perf: PerfSource | null;
  essaiMax: number | null;
  essaiVerdict: "tient" | "ne_tient_pas" | null;
  dernierImport: string | null;
  /** Dans la file d'attente (source neuve, ou mise à jour retenue dont le lot n'est pas parti). */
  attente: SourceEnAttente | null;
  /** Dans la séquence qui tourne : c'est son tour, ou elle suit. */
  sequence: "en_cours" | "a_suivre" | null;
  /** Slideshows encore dans la file quand c'est son tour. */
  restant: number;
  /** Sa décision du dernier lundi (ou son ajout de la semaine). */
  semaine: SourceLundi | null;
  etape: EtapeSource;
}

/**
 * L'onglet d'une source. « En import » ne concerne que ce qui arrive : une source neuve dans la file, ou dont le
 * premier import tourne. Une source établie qui passe sa mise à jour du lundi reste dans « Weekly update ».
 */
export function etapeDeLaSource(s: Omit<SourceBible, "etape">): EtapeSource {
  if (!s.actif || s.essaiVerdict === "ne_tient_pas") return "arretees";
  if (s.attente?.sorte === "neuve") return "en_import";
  if (s.sequence && (s.semaine?.raison === "ajout" || s.importes === 0)) return "en_import";
  if (!s.dernierImport && s.importes === 0) return "en_import";
  if (s.essaiMax !== null && s.essaiVerdict === null) return "essai";
  return "weekly";
}

/** Rassemble les lectures en une liste de sources (pur : testé sans base). */
export function assemblerSources(o: {
  refs: CompteReference[];
  importes: CompteImporte[];
  perf: Record<string, PerfSource>;
  stocks: Record<string, { importes: number; valides: number }>;
  file: FileSources;
  semaine: SemaineSources | null;
}): SourceBible[] {
  const parId = new Map(o.importes.map((i) => [i.compte_reference_id, i]));
  const attente = new Map(o.file.attente.map((a) => [a.compteReferenceId, a]));
  const semaine = new Map((o.semaine?.sources ?? []).map((l) => [l.compteReferenceId, l]));
  const tour = handleNormal(o.file.enCours?.handle);
  const suite = new Set((o.file.enCours?.aSuivre ?? []).map(handleNormal));
  return o.refs.map((r) => {
    const handle = handleNormal(r.handle_tiktok);
    const imp = parId.get(r.id);
    const sequence = !o.file.enCours ? null : tour && tour === handle ? "en_cours" : suite.has(handle) ? "a_suivre" : null;
    const base: Omit<SourceBible, "etape"> = {
      id: r.id,
      handle,
      langue: r.langue || null,
      actif: r.is_active,
      labels: imp?.labels ?? [],
      slides: (imp?.slides ?? []).map((url, i) => ({ url, post: imp?.slides_posts?.[i] ?? null })),
      importes: o.stocks[r.id]?.importes ?? 0,
      valides: o.stocks[r.id]?.valides ?? 0,
      perf: o.perf[r.id] ?? null,
      essaiMax: r.essai_max ?? null,
      essaiVerdict: r.essai_verdict ?? null,
      dernierImport: r.dernier_scrape_at,
      attente: attente.get(r.id) ?? null,
      sequence,
      restant: sequence === "en_cours" ? (o.file.enCours?.restant ?? 0) : 0,
      semaine: semaine.get(r.id) ?? null,
    };
    return { ...base, etape: etapeDeLaSource(base) };
  });
}

export interface DonneesSources {
  sources: SourceBible[];
  file: FileSources;
  semaine: SemaineSources | null;
  regles: ReglesSources;
  labels: LabelBible[];
}

/** Tout ce que les onglets des sources affichent, en une lecture. */
export async function lireSources(): Promise<DonneesSources> {
  const [refs, importes, perf, stocks, file, semaine, regles, labels] = await Promise.all([
    listerSources(), lireImportes(), performanceSources(), contenusParSource(), lireFileSources(), sourcesDeLaSemaine(), lireReglesSources(), lireLabels(),
  ]);
  return { sources: assemblerSources({ refs, importes, perf, stocks, file, semaine }), file, semaine, regles, labels };
}

/** La source de chaque handle, vue du compte de la Bible (pour savoir s'il reste quelque chose à importer). */
export function sourcesParHandle(sources: SourceBible[]): Map<string, SourceDuCompte> {
  return new Map(sources.map((s) => [s.handle, { labelIds: s.labels.map((l) => l.id), labels: s.labels.map((l) => l.nom) }]));
}

export const compterSources = (sources: SourceBible[]): Record<EtapeSource, number> => ({
  en_import: sources.filter((s) => s.etape === "en_import").length,
  essai: sources.filter((s) => s.etape === "essai").length,
  weekly: sources.filter((s) => s.etape === "weekly").length,
  arretees: sources.filter((s) => s.etape === "arretees").length,
});

const virgule = (n: number, decimales = 2): string => n.toLocaleString("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
/** « 0,95 », « 1 » : un seuil sans zéros inutiles. */
export const seuil = (n: number): string => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
export const nombre = (n: number): string => n.toLocaleString("fr-FR").replace(/[\u202f\u00a0]/g, " ");
export const r2 = (n: number | null | undefined): string | null => (n == null ? null : virgule(n));

/** « 20/11 » depuis une date AAAA-MM-JJ ou un instant ISO. */
export function jourCourt(iso: string | null | undefined): string {
  const m = (iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : "";
}

/** Pourquoi le lundi l'a retenue, en clair. */
export function raisonLundi(l: SourceLundi, regles: ReglesSources): string | null {
  switch (l.raison) {
    case "toujours": return "toujours mise à jour";
    case "ajout": return "source ajoutée cette semaine";
    case "neuve": return `moins de ${regles.postsMin} posts mesurés`;
    case "r": return `r au-dessus de ${seuil(regles.rMin)}`;
    case "label": return `au-dessus de ${seuil(regles.rVsLabelMin)} face à son label`;
    case "100k": return `un post à ${nombre(l.meilleurVues ?? regles.vuesCoup)} vues`;
    default: return null;
  }
}

export type TonEtat = "neutre" | "attente" | "bon" | "alerte";

/** Où en est la source, en une phrase. */
export function phraseEtat(s: SourceBible, regles: ReglesSources): { texte: string; ton: TonEtat } {
  if (!s.actif) return { texte: "Désactivée", ton: "neutre" };
  if (s.essaiVerdict === "ne_tient_pas") return { texte: `Essai raté : arrêtée à ${s.essaiMax ?? s.importes} posts`, ton: "alerte" };

  if (s.etape === "en_import") {
    if (s.sequence === "en_cours") {
      return { texte: s.restant > 0 ? `Import en cours : ${s.restant} slideshow${s.restant > 1 ? "s" : ""} encore dans la file` : "Import en cours", ton: "attente" };
    }
    if (s.sequence === "a_suivre") return { texte: "À suivre dans la séquence en cours", ton: "attente" };
    if (s.attente?.echec) return { texte: `Import en échec, repart au lot suivant (${s.attente.echec})`, ton: "alerte" };
    if (s.attente) return { texte: s.attente.prevuLe ? `Dans la file, départ prévu le ${jourCourt(s.attente.prevuLe)}` : "Dans la file", ton: "attente" };
    return { texte: "Jamais importée", ton: "neutre" };
  }

  if (s.etape === "essai") {
    const mesures = Math.min(s.perf?.posts ?? 0, regles.essaiMesuresMin);
    return { texte: `Essai : ${s.importes} sur ${s.essaiMax} importés, ${mesures} sur ${regles.essaiMesuresMin} mesurés`, ton: "attente" };
  }

  if (s.sequence === "en_cours") return { texte: "Mise à jour en cours", ton: "attente" };
  const l = s.semaine;
  if (!l) return { texte: "À jour", ton: "neutre" };
  if (l.decision === "pas_maj") return { texte: "Pas retenue cette semaine", ton: "alerte" };
  const raison = raisonLundi(l, regles);
  const suite = raison ? ` (${raison})` : "";
  if (s.attente?.echec) return { texte: `Mise à jour en échec, repart au lot suivant${suite}`, ton: "alerte" };
  if (l.lanceeLe) return { texte: `Mise à jour le ${jourCourt(l.lanceeLe)}${suite}`, ton: "bon" };
  return { texte: `Retenue, mise à jour ${s.attente?.prevuLe ? `prévue le ${jourCourt(s.attente.prevuLe)}` : "à venir"}${suite}`, ton: "attente" };
}

/**
 * Le bilan du dernier lundi, pour l'en-tête de « Weekly update ». Les sources ajoutées dans la semaine (raison
 * « ajout ») n'en font pas partie : ce sont des premiers imports, elles se lisent dans « En import ».
 */
export function bilanSemaine(semaine: SemaineSources | null): {
  semaine: string; retenues: number; faites: number; aVenir: number; pasRetenues: number; importes: number; valides: number;
} | null {
  if (!semaine) return null;
  const jugees = semaine.sources.filter((l) => l.raison !== "ajout");
  const retenues = jugees.filter((l) => l.decision !== "pas_maj");
  const faites = retenues.filter((l) => l.lanceeLe).length;
  return {
    semaine: semaine.semaine,
    retenues: retenues.length,
    faites,
    aVenir: retenues.length - faites,
    pasRetenues: jugees.length - retenues.length,
    importes: jugees.reduce((n, l) => n + l.importes, 0),
    valides: jugees.reduce((n, l) => n + l.valides, 0),
  };
}

export type FiltreSemaine = "toutes" | "retenues" | "pas_retenues";

export interface CarteSources {
  /** L'id du label, ou « sans ». */
  cle: string;
  nom: string;
  description: string | null;
}

export interface GroupeSources {
  section: Section | "sans";
  cartes: { carte: CarteSources | null; sources: { source: SourceBible; aussi: boolean }[] }[];
  total: number;
}

const ORDRE_SECTIONS: readonly (Section | "sans")[] = ["runvik", "micabo", "sophia", "idees", "sans"];

/**
 * Range les sources d'un onglet comme le moodboard : par app, puis par label (leurs VRAIS labels, pas la carte du
 * compte). La section d'un label est celle de sa carte de la Bible s'il en a une, sinon l'app qu'il sert.
 */
export function rangerSources(
  sources: SourceBible[], labels: LabelBible[], cartes: CarteLabel[],
  filtre: { etape: EtapeSource; recherche: string; section: Section | "sans" | ""; semaine?: FiltreSemaine },
): GroupeSources[] {
  const q = filtre.recherche.trim().toLowerCase().replace(/^@/, "");
  const visibles = sources.filter((s) => s.etape === filtre.etape
    && (!q || s.handle.includes(q) || s.labels.some((l) => l.nom.toLowerCase().includes(q)))
    && (!filtre.semaine || filtre.semaine === "toutes" || filtre.etape !== "weekly"
      || (filtre.semaine === "pas_retenues" ? s.semaine?.decision === "pas_maj" : Boolean(s.semaine) && s.semaine?.decision !== "pas_maj")));

  const carteDuLabel = new Map(cartes.filter((c) => c.label_id).map((c) => [c.label_id!, c]));
  const apps = new Map(labels.map((l) => [l.id, l.apps]));
  const sectionDe = (labelId: string): Section => {
    const carte = carteDuLabel.get(labelId);
    if (carte) return carte.section;
    const a = apps.get(labelId) ?? [];
    return !a.includes(SOPHIA) && a.includes(MICABO) ? "micabo" : "sophia";
  };
  const ordreDe = (labelId: string): number => carteDuLabel.get(labelId)?.ordre ?? 99;
  // Les meilleures d'abord là où le r compte ; sinon par nom.
  const tri = (a: SourceBible, b: SourceBible) =>
    (filtre.etape === "weekly" || filtre.etape === "essai" ? (b.perf?.r ?? -1) - (a.perf?.r ?? -1) : 0) || a.handle.localeCompare(b.handle);

  const parLabel = new Map<string, { carte: CarteSources; section: Section; ordre: number; sources: { source: SourceBible; aussi: boolean }[] }>();
  const sans: SourceBible[] = [];
  for (const s of [...visibles].sort(tri)) {
    if (s.labels.length === 0) { sans.push(s); continue; }
    [...s.labels].sort((a, b) => a.nom.localeCompare(b.nom)).forEach((l, i) => {
      const g = parLabel.get(l.id) ?? {
        carte: { cle: l.id, nom: l.nom, description: carteDuLabel.get(l.id)?.description_da ?? null }, section: sectionDe(l.id), ordre: ordreDe(l.id), sources: [],
      };
      g.sources.push({ source: s, aussi: i > 0 });
      parLabel.set(l.id, g);
    });
  }

  return ORDRE_SECTIONS
    .filter((sec) => !filtre.section || filtre.section === sec)
    .map((sec): GroupeSources => {
      if (sec === "sans") {
        return { section: sec, cartes: sans.length ? [{ carte: null, sources: sans.map((source) => ({ source, aussi: false })) }] : [], total: sans.length };
      }
      const liste = [...parLabel.values()].filter((g) => g.section === sec).sort((a, b) => a.ordre - b.ordre || a.carte.nom.localeCompare(b.carte.nom));
      return {
        section: sec,
        cartes: liste.map((g) => ({ carte: g.carte, sources: g.sources })),
        total: new Set(liste.flatMap((g) => g.sources.filter((x) => !x.aussi).map((x) => x.source.id))).size,
      };
    })
    .filter((g) => g.cartes.length > 0);
}

/** Comment on entre dans l'étape et comment on en sort, avec les vrais seuils. */
export function regleDeLaVue(vue: Vue, r: ReglesSources): string {
  switch (vue) {
    case "a_importer":
      return "Les comptes repérés. Passe dans « Prochain batch » ceux que tu veux importer.";
    case "prochain_batch":
      return "Les comptes choisis pour le prochain import. « Lancer l'import » crée leurs sources et les met dans la file : il faut un vrai label, et les comptes à podzer ne partent pas.";
    case "en_import":
      return "Les sources créées, dans la file ou en cours d'import, une à la fois. Elles passent seules à l'étape suivante.";
    case "essai":
      return `Dans un label que des comptes portent déjà, une source neuve n'importe d'abord que ses ${r.essaiPosts} posts les plus vus. Le lundi, dès ${r.essaiMesuresMin} posts mesurés chez nous : avec un r au-dessus de ${seuil(r.rMin)} (ou de ${seuil(r.rVsLabelMin)} face à son label) elle passe en Weekly update, sinon elle est arrêtée. Dans un label neuf, pas d'essai : la source va droit en Weekly update avec ses ${r.postsMaxParMaj} posts les plus vus.`;
    case "weekly":
      return `Chaque lundi à 6 h, une source est mise à jour si son r dépasse ${seuil(r.rMin)}, ou ${seuil(r.rVsLabelMin)} face à son label, si elle a un post à ${nombre(r.vuesCoup)} vues, ou moins de ${r.postsMin} posts mesurés. ${r.postsMaxParMaj} posts de plus au maximum par mise à jour, ${r.lotMax} sources par jour. Les autres attendent le lundi suivant.`;
    case "arretees":
      return "Les essais ratés et les sources désactivées : elles ne sont plus mises à jour.";
    case "corbeille":
      return "Les comptes supprimés de la Bible : à restaurer, ou à supprimer pour de bon.";
  }
}

/** Ce que le lancement a fait d'un compte, en une ligne. */
export function ligneResultat(r: ResultatLancement, regles: ReglesSources): { texte: string; ok: boolean } {
  const qui = `@${r.handle ?? "?"}`;
  const combien = typeof r.essai_max === "number" ? `essai de ${r.essai_max} posts` : `ses ${regles.postsMaxParMaj} posts les plus vus`;
  if (r.statut === "lancee") return { texte: `${qui} : dans la séquence d'import, ${combien}`, ok: true };
  if (r.statut === "attente") return { texte: `${qui} : dans la file${r.prevu_le ? `, départ au plus tôt le ${jourCourt(r.prevu_le)}` : ""}, ${combien}`, ok: true };
  return { texte: `${qui} : pas lancé (${r.raison ?? "erreur"})`, ok: false };
}
