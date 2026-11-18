/**
 * 18/11 (Max) : la galerie de la Bible des comptes. Une carte par compte (fiche de la bible en attente, ou
 * compte de référence déjà importé), regroupées par app puis par label. Pur : testé sans réseau.
 */
import type { AppBible, CompteImporte, FicheBible, LabelBible, LabelPropose, NicheStatut, StatutBible } from "./types";

export type Vue = "a_trier" | "importes" | "attente" | "tous";

export interface Carte {
  cle: string;
  kind: "bible" | "importe";
  handle: string;
  bibleId: string | null;
  refId: string | null;
  appIds: string[];
  appsAttente: string[];
  labelId: string | null;
  labelProposeId: string | null;
  labelNom: string | null;
  statut: StatutBible;
  nicheStatut: NicheStatut | null;
  niche: string | null;
  polyvalent: boolean;
  langue: string | null;
  pays: string | null;
  abonnes: number | null;
  vuesMediane: number | null;
  note: string | null;
  angle: string | null;
  miniatures: string[];
  /** Le post TikTok de chaque miniature (même ordre), pour l'ouvrir d'un clic. */
  liensPosts: (string | null)[];
  miniaturesManquantes: boolean;
  /** « Autre app / idée » : l'app imaginée (texte libre). */
  autreApp: string | null;
  ajoutePar: string | null;
  ajouteAt: string;
}

function miniaturesFiche(f: FicheBible): { urls: string[]; liens: (string | null)[] } {
  const avec = (f.posts ?? []).filter((p) => p.miniature_url).slice(0, 3);
  return { urls: avec.map((p) => p.miniature_url!), liens: avec.map((p) => p.url ?? null) };
}

/** Ni app, ni app en attente, ni label, ni idée d'app : « Non trié ». */
export function estNonTrie(c: Carte): boolean {
  return c.kind === "bible" && !c.appIds.length && !c.appsAttente.length && !c.labelId && !c.labelProposeId && !c.autreApp;
}

/** « Autre app / idée » : une app imaginée, sans app actuelle ni label. */
export function estAutreApp(c: Carte): boolean {
  return c.kind === "bible" && Boolean(c.autreApp) && !c.appIds.length && !c.labelId && !c.labelProposeId;
}

export function cartes(fiches: FicheBible[], importes: CompteImporte[], labels: LabelBible[], proposes: LabelPropose[], vue: Vue): Carte[] {
  const nomLabel = new Map(labels.map((l) => [l.id, l]));
  const nomPropose = new Map(proposes.map((p) => [p.id, p.nom]));
  const ficheParRef = new Map(fiches.filter((f) => f.compte_reference_id).map((f) => [f.compte_reference_id!, f]));
  const ficheParHandle = new Map(fiches.map((f) => [f.handle, f]));
  const out: Carte[] = [];

  if (vue !== "importes") {
    for (const f of fiches) {
      if (f.statut === "importe" || f.compte_reference_id) continue;
      const mins = miniaturesFiche(f);
      out.push({
        cle: `b:${f.id}`, kind: "bible", handle: f.handle, bibleId: f.id, refId: null,
        appIds: f.application_ids ?? [], appsAttente: f.apps_attente ?? [],
        labelId: f.label_id, labelProposeId: f.label_propose_id,
        labelNom: f.label_id ? nomLabel.get(f.label_id)?.nom ?? null : f.label_propose_id ? nomPropose.get(f.label_propose_id) ?? null : null,
        statut: f.statut, nicheStatut: f.niche_statut, niche: f.niche, polyvalent: f.polyvalent, langue: f.langue, pays: f.pays,
        abonnes: f.abonnes, vuesMediane: f.vues_mediane, note: f.note_import, angle: f.angle,
        miniatures: mins.urls, liensPosts: mins.liens, miniaturesManquantes: mins.urls.length < 3, autreApp: f.autre_app ?? null,
        ajoutePar: f.ajoute_par, ajouteAt: f.ajoute_at,
      });
    }
  }
  if (vue !== "attente") {
    for (const r of importes) {
      const f = ficheParRef.get(r.compte_reference_id) ?? ficheParHandle.get(r.handle) ?? null;
      const label = r.labels[0] ?? null;
      const appsLabels = [...new Set(r.labels.flatMap((l) => nomLabel.get(l.id)?.apps ?? []))];
      const minsFiche = f ? miniaturesFiche(f) : { urls: [], liens: [] };
      const mins = minsFiche.urls.length >= 3 ? minsFiche : { urls: r.slides.slice(0, 3), liens: (r.slides_posts ?? []).slice(0, 3) };
      out.push({
        cle: `r:${r.compte_reference_id}`, kind: "importe", handle: r.handle, bibleId: f?.id ?? null, refId: r.compte_reference_id,
        appIds: f?.application_ids?.length ? f.application_ids : appsLabels.length ? appsLabels : r.application_id ? [r.application_id] : [],
        appsAttente: f?.apps_attente ?? [],
        labelId: label?.id ?? null, labelProposeId: null, labelNom: label?.nom ?? null,
        statut: "importe", nicheStatut: f?.niche_statut ?? null, niche: f?.niche ?? r.niche, polyvalent: f?.polyvalent ?? r.labels.length > 1,
        langue: f?.langue ?? r.langue, pays: f?.pays ?? null, abonnes: f?.abonnes ?? null, vuesMediane: f?.vues_mediane ?? r.vues_mediane,
        note: f?.note_import ?? null, angle: f?.angle ?? null, miniatures: mins.urls, liensPosts: mins.liens,
        miniaturesManquantes: mins.urls.length < 3, autreApp: f?.autre_app ?? null,
        ajoutePar: f?.ajoute_par ?? null, ajouteAt: f?.ajoute_at ?? r.ajoute_at,
      });
    }
  }
  return vue === "a_trier" ? out.filter((c) => estNonTrie(c) || estAutreApp(c)) : out;
}

export interface Filtres {
  app: string;
  label: string;
  statut: string;
  niche: "" | "oui" | "non";
  langue: string;
  ajoutePar: string;
  recherche: string;
}

export const FILTRES_VIDES: Filtres = { app: "", label: "", statut: "", niche: "", langue: "", ajoutePar: "", recherche: "" };

export function filtrer(liste: Carte[], f: Filtres): Carte[] {
  const q = f.recherche.trim().toLowerCase().replace(/^@/, "");
  return liste.filter((c) =>
    (!f.app || (f.app === "attente" ? c.appsAttente.length > 0 : c.appIds.includes(f.app))) &&
    (!f.label || c.labelId === f.label || c.labelProposeId === f.label) &&
    (!f.statut || c.statut === f.statut) &&
    (!f.niche || (f.niche === "oui" ? c.nicheStatut === "oui" : c.nicheStatut !== "oui")) &&
    (!f.langue || c.langue === f.langue || c.pays === f.langue) &&
    (!f.ajoutePar || c.ajoutePar === f.ajoutePar) &&
    (!q || c.handle.includes(q) || (c.note ?? "").toLowerCase().includes(q) || (c.niche ?? "").toLowerCase().includes(q)));
}

export interface GroupeLabel {
  cle: string;
  nom: string;
  description: string | null;
  propose: boolean;
  cartes: Carte[];
}

export interface GroupeApp {
  cle: string;
  nom: string;
  slug: string | null;
  labels: GroupeLabel[];
  total: number;
}

/** App → label → cartes. Un compte qui sert plusieurs apps apparaît sous chacune. */
export function grouper(liste: Carte[], apps: AppBible[], labels: LabelBible[], proposes: LabelPropose[]): GroupeApp[] {
  const parApp = new Map<string, GroupeApp>();
  const descLabel = new Map(labels.map((l) => [l.id, l.style_theme]));
  const descPropose = new Map(proposes.map((p) => [p.id, p.description_da]));
  const ajouter = (cleApp: string, nomApp: string, slug: string | null, c: Carte) => {
    let g = parApp.get(cleApp);
    if (!g) parApp.set(cleApp, (g = { cle: cleApp, nom: nomApp, slug, labels: [], total: 0 }));
    const cleLabel = c.labelId ?? (c.labelProposeId ? `p:${c.labelProposeId}` : "sans");
    let gl = g.labels.find((x) => x.cle === cleLabel);
    if (!gl) {
      gl = {
        cle: cleLabel, nom: c.labelNom ?? "Sans label", propose: !c.labelId && Boolean(c.labelProposeId),
        description: c.labelId ? descLabel.get(c.labelId) ?? null : c.labelProposeId ? descPropose.get(c.labelProposeId) ?? null : null,
        cartes: [],
      };
      g.labels.push(gl);
    }
    gl.cartes.push(c);
    g.total++;
  };
  for (const c of liste) {
    // « Non trié » et « Autre app / idée » ont leurs propres sections, en haut de la galerie.
    if (estNonTrie(c) || estAutreApp(c)) continue;
    let place = false;
    for (const id of c.appIds) {
      const a = apps.find((x) => x.id === id);
      if (a) {
        ajouter(a.id, a.nom, a.slug, c);
        place = true;
      }
    }
    for (const a of c.appsAttente) {
      ajouter(`attente:${a}`, `${a} (en attente)`, null, c);
      place = true;
    }
    if (!place) ajouter("sans", "Sans app", null, c);
  }
  const ordreApp = (g: GroupeApp) => (g.cle === "sans" ? 3 : g.cle.startsWith("attente:") ? 2 : 1);
  return [...parApp.values()]
    .map((g) => ({ ...g, labels: g.labels.sort((a, b) => Number(a.cle === "sans") - Number(b.cle === "sans") || a.nom.localeCompare(b.nom)) }))
    .sort((a, b) => ordreApp(a) - ordreApp(b) || apps.findIndex((x) => x.id === a.cle) - apps.findIndex((x) => x.id === b.cle) || a.nom.localeCompare(b.nom));
}

/** La couleur d'une app (classes Tailwind) : Sophia violet, micabo rose, Unswipe ambre, app en attente vert. */
export function couleurApp(slug: string | null, cle: string): { pastille: string; bord: string; fond: string } {
  if (slug === "sophia") return { pastille: "bg-violet-500", bord: "border-violet-200 dark:border-violet-900", fond: "bg-violet-50/60 dark:bg-violet-950/20" };
  if (slug === "micabo") return { pastille: "bg-pink-500", bord: "border-pink-200 dark:border-pink-900", fond: "bg-pink-50/60 dark:bg-pink-950/20" };
  if (slug === "unswipe") return { pastille: "bg-amber-500", bord: "border-amber-200 dark:border-amber-900", fond: "bg-amber-50/60 dark:bg-amber-950/20" };
  if (cle.startsWith("attente:")) return { pastille: "bg-emerald-500", bord: "border-emerald-200 dark:border-emerald-900", fond: "bg-emerald-50/60 dark:bg-emerald-950/20" };
  return { pastille: "bg-slate-400", bord: "border-slate-200 dark:border-slate-800", fond: "bg-slate-50/60 dark:bg-slate-900/20" };
}

export function nombreCourt(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(".0", "")} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(".0", "")} k`;
  return String(n);
}
