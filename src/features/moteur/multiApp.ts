/**
 * Multi-applications : décisions pures du moteur (labels → applications
 * servies, répartition d'un compte, application d'un créneau).
 *
 * Module source : la copie Deno `supabase/functions/_shared/multi_app.ts` doit
 * rester identique (hors en-tête) — `multiApp.test.ts` compare les deux.
 */

/**
 * Sophia : application d'origine, identité des comptes, et repli d'un compte
 * dont la répartition lui laisse une part (toute la flotte, répartition NULL).
 */
export const ID_SOPHIA = "00000000-0000-4000-8000-000000000001";
export const SLUG_SOPHIA = "sophia";

/**
 * Taille de la fenêtre glissante de répartition : les N derniers posts du
 * compte. À 2 posts/jour, 10 posts ≈ 5 jours — assez court pour qu'un 70/30 se
 * voie dans la semaine, assez long pour ne pas osciller.
 */
export const FENETRE_REPARTITION_DEFAUT = 10;

/**
 * Écart minimal entre deux publications du MÊME contenu sur le MÊME compte
 * pour deux applications différentes. Deux decks quasi identiques à quelques
 * heures d'écart se volent leurs stats au rapprochement (rattrapage) et
 * passent pour du doublon aux yeux de TikTok.
 */
export const ECART_MIN_JOURS_AUTRE_APPLICATION = 7;

/** Labels système : ils ne servent aucune application, ne vont sur aucun compte. */
export const SLUGS_LABELS_SYSTEME: readonly string[] = ["hook", "ugc-ai-video"];

export interface ApplicationMoteur {
  id: string;
  slug: string;
  nom: string;
  /** Langues de compte ciblées ; `null` = toutes. */
  langues: string[] | null;
  actif: boolean;
}

/**
 * Lien label → application. Pas d'angle par label : le prompt de placement de
 * l'application suffit (la colonne `label_applications.angle` reste en base,
 * inutilisée, ni lue ni écrite).
 */
export interface LienLabelApplication {
  label_id: string;
  application_id: string;
}

export interface LabelRef {
  id: string;
  slug?: string | null;
  nom?: string | null;
}

/** Répartition d'un compte : slug d'application → pourcentage. */
export type PartsApplications = Record<string, number>;

export interface EntreeFenetre {
  /** Slug de l'application promue par ce post. */
  application: string;
  /** 1 pour un post mono-application ; 0,5 + 0,5 pour un post double (phase 2). */
  poids: number;
}

export function estLabelSystemeSlug(slug: string | null | undefined): boolean {
  const s = (slug ?? "").trim().toLowerCase();
  return SLUGS_LABELS_SYSTEME.includes(s);
}

/**
 * Applications servies par UN label.
 *
 * Règle d'héritage : un label sans aucune ligne `label_applications` sert
 * Sophia. Un backfill oublié, ou un label créé par un vieux front, ne peut donc
 * jamais vider le stock Sophia — c'est le seul sens d'erreur acceptable.
 */
export function applicationsDuLabel(
  labelId: string,
  liens: readonly LienLabelApplication[],
): string[] {
  const ids = new Set<string>();
  for (const l of liens) {
    if (l.label_id === labelId) ids.add(l.application_id);
  }
  return ids.size > 0 ? [...ids].sort() : [ID_SOPHIA];
}

/**
 * Pour chaque application, les labels (parmi `labels`) qui la servent. Les
 * labels système sont ignorés.
 */
export function labelsParApplication(
  labels: readonly LabelRef[],
  liens: readonly LienLabelApplication[],
): Map<string, string[]> {
  const parApp = new Map<string, string[]>();
  for (const label of labels) {
    if (estLabelSystemeSlug(label.slug)) continue;
    for (const app of applicationsDuLabel(label.id, liens)) {
      const liste = parApp.get(app) ?? [];
      if (!liste.includes(label.id)) liste.push(label.id);
      parApp.set(app, liste);
    }
  }
  return parApp;
}

/**
 * Applications servies par un ensemble de labels (union, triée). Sans label
 * utile : Sophia — c'est le comportement historique d'un contenu non tagué.
 */
export function applicationsServies(
  labels: readonly LabelRef[],
  liens: readonly LienLabelApplication[],
): string[] {
  const apps = [...labelsParApplication(labels, liens).keys()].sort();
  return apps.length > 0 ? apps : [ID_SOPHIA];
}

/**
 * Applications qu'un compte peut promouvoir aujourd'hui : servies par au moins
 * un de ses labels, actives, ciblant sa langue. Un compte UGC reste sur Sophia
 * (Unswipe = slideshows classiques uniquement).
 */
export function applicationsEligiblesCompte(args: {
  applications: readonly ApplicationMoteur[];
  /** Ids d'applications servies par les labels du compte. */
  servies: readonly string[];
  langue: string;
  ugc: boolean;
}): ApplicationMoteur[] {
  return args.applications.filter(
    (a) =>
      args.servies.includes(a.id) &&
      a.actif &&
      (a.langues === null || a.langues.includes(args.langue)) &&
      (!args.ugc || a.id === ID_SOPHIA),
  );
}

/**
 * Lit `comptes.parts_applications`. `null`, invalide ou vide → `null`, qui
 * signifie « répartition par défaut » (100 % Sophia pour un compte dont un
 * label sert Sophia — le défaut des comptes existants). Non `null` : une
 * répartition EXPLICITE, que `partsEffectives` applique à la lettre.
 */
export function normaliserParts(brut: unknown): PartsApplications | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const out: PartsApplications = {};
  for (const [slug, valeur] of Object.entries(brut as Record<string, unknown>)) {
    const n = Math.round(Number(valeur));
    if (!slug || !Number.isFinite(n) || n <= 0) continue;
    out[slug] = Math.min(100, n);
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Parts réellement appliquées, restreintes aux applications éligibles et
 * renormalisées à 100. DEUX NIVEAUX : les labels du compte disent ce qu'il
 * PEUT promouvoir (`eligibles`), sa répartition choisit parmi eux.
 *
 * - Pas de réglage (`null`) : 100 % Sophia si Sophia est éligible, sinon parts
 *   égales entre les éligibles — un compte dont les labels ne servent QUE
 *   Unswipe publie 100 % Unswipe sans aucun réglage. Inchangé : c'est toute
 *   la flotte.
 * - Répartition explicite : seules les applications à part > 0 peuvent être
 *   publiées. Une application à part > 0 inéligible (langue non ciblée,
 *   inactive, aucun label, compte UGC) voit sa part reportée sur les AUTRES
 *   applications à part > 0, jamais sur une application à 0 %.
 * - Répartition explicite dont aucune application à part > 0 n'est éligible :
 *   `{}`, le compte ne publie rien — pas de repli Sophia ni de parts égales.
 *   Un compte réglé 100 % Unswipe dont le label sert aussi Sophia ne fait que
 *   de l'Unswipe.
 */
export function partsEffectives(
  parts: PartsApplications | null,
  eligibles: readonly string[],
): PartsApplications {
  if (eligibles.length === 0) return {};
  const base: PartsApplications = parts ?? { [SLUG_SOPHIA]: 100 };
  const retenues = eligibles.filter((slug) => (base[slug] ?? 0) > 0);
  if (retenues.length === 0) {
    if (parts !== null) return {};
    if (eligibles.includes(SLUG_SOPHIA)) return { [SLUG_SOPHIA]: 100 };
    const egal = 100 / eligibles.length;
    return Object.fromEntries(eligibles.map((slug) => [slug, egal]));
  }
  const total = retenues.reduce((s, slug) => s + base[slug], 0);
  return Object.fromEntries(retenues.map((slug) => [slug, (base[slug] * 100) / total]));
}

/**
 * Application du prochain créneau, par DÉFICIT sur la fenêtre glissante.
 *
 * `fenetre` = les derniers posts du compte, du plus ancien au plus récent (on
 * n'en garde que les `taille − 1` derniers) : le créneau vient compléter une
 * fenêtre de `taille` posts. Pour chaque application, déficit = `part ×
 * (posts retenus + 1) − posts déjà faits pour elle` ; la plus en retard gagne,
 * égalité → la plus grosse part, puis Sophia, puis l'ordre alphabétique.
 * Déterministe : en 70/30, TOUTE suite de 10 posts consécutifs en compte 7/3.
 *
 * `null` quand aucune application n'a de part (aucune éligible).
 */
export function choisirApplicationCreneau(
  parts: PartsApplications,
  fenetre: readonly EntreeFenetre[],
  taille: number = FENETRE_REPARTITION_DEFAUT,
): string | null {
  const apps = Object.keys(parts).filter((slug) => parts[slug] > 0);
  if (apps.length === 0) return null;
  if (apps.length === 1) return apps[0];

  const retenue = fenetre.slice(-Math.max(0, Math.floor(taille) - 1));
  const total = apps.reduce((s, slug) => s + parts[slug], 0);
  const n = retenue.reduce((s, e) => s + e.poids, 0);
  const faits = (slug: string) =>
    retenue.reduce((s, e) => s + (e.application === slug ? e.poids : 0), 0);
  const deficit = (slug: string) => (parts[slug] / total) * (n + 1) - faits(slug);

  return [...apps].sort((a, b) => {
    const d = deficit(b) - deficit(a);
    if (Math.abs(d) > 1e-9) return d;
    if (parts[b] !== parts[a]) return parts[b] - parts[a];
    if (a === SLUG_SOPHIA) return -1;
    if (b === SLUG_SOPHIA) return 1;
    return a.localeCompare(b);
  })[0];
}
