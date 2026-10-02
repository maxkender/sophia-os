/**
 * Multi-applications côté admin : décisions pures des écrans Posters / détail
 * slideshow / pages post (répartition d'un compte, applications servies par un
 * label, nom de l'application promue par un post).
 *
 * Tout ce qui décide « quelle application » s'appuie sur `multiApp.ts` (la même
 * logique que le moteur, copiée à l'octet côté Deno) : l'écran montre ce que le
 * moteur fera, pas une approximation.
 */
import { nomApplication } from "../applications";
import {
  applicationsDuLabel,
  applicationsEligiblesCompte,
  applicationsServies,
  ID_SOPHIA,
  normaliserParts,
  partsEffectives,
  SLUG_SOPHIA,
  type ApplicationMoteur,
  type LabelRef,
  type LienLabelApplication,
  type PartsApplications,
} from "../multiApp";

/** Pas des curseurs de répartition : 10 % = 1 post sur la fenêtre de 10. */
export const PAS_PARTS = 10;

/**
 * Nom de l'application promue par un post (`posts.application_id`). Absent
 * (post d'avant 0256, colonne pas encore là) ou inconnu : Sophia — c'est ce
 * que tous les posts promouvaient jusqu'ici.
 */
export function nomApplicationPromue(
  applicationId: string | null | undefined,
  applications: ReadonlyArray<{ id: string; nom?: string | null; slug?: string | null }>,
): string {
  if (!applicationId) return "Sophia";
  const app = applications.find((a) => a.id === applicationId);
  return app ? nomApplication(app) : "Sophia";
}

/** Noms des applications servies par un label (règle « sans ligne = Sophia »). */
export function nomsApplicationsDuLabel(
  labelId: string,
  liens: readonly LienLabelApplication[],
  applications: ReadonlyArray<{ id: string; nom?: string | null; slug?: string | null }>,
): string[] {
  return applicationsDuLabel(labelId, liens).map((id) => nomApplicationPromue(id, applications));
}

/**
 * Filtre « application » de la page Posters : un créateur passe si au moins un
 * de ses comptes a des labels qui servent cette application. Un compte sans
 * label sert Sophia (même règle que le moteur).
 */
export function posterServiApplication(
  labelsParCompte: ReadonlyArray<readonly LabelRef[]>,
  liens: readonly LienLabelApplication[],
  applicationId: string,
): boolean {
  return labelsParCompte.some((labels) => applicationsServies(labels, liens).includes(applicationId));
}

export type AvertissementParts =
  /** Application servie mais éteinte : sa part revient aux autres. */
  | { type: "inactive"; app: string }
  /** Application qui ne cible pas la langue du compte. */
  | { type: "langue"; app: string; langue: string }
  /** Compte UGC : Unswipe = slideshows classiques uniquement, il reste Sophia. */
  | { type: "ugc" }
  /** Aucun label du compte ne sert Sophia : le reste ira aux autres applications. */
  | { type: "sophiaNonServie" }
  /** Répartition enregistrée pour une application que les labels ne servent plus. */
  | { type: "obsolete"; app: string };

export interface EtatPartsCompte {
  /** Applications servies par les labels du compte (Sophia d'abord). */
  servies: ApplicationMoteur[];
  /** Applications servies hors Sophia : un curseur chacune. */
  autres: ApplicationMoteur[];
  /** `comptes.parts_applications` lu ; `null` = 100 % Sophia. */
  stockees: PartsApplications | null;
  /** Valeur initiale des curseurs (slug → %, multiples de 10, total ≤ 100). */
  curseurs: Record<string, number>;
  /** Ce que le moteur appliquera aujourd'hui (restreint aux éligibles, renormalisé). */
  effectives: PartsApplications;
  avertissements: AvertissementParts[];
  /**
   * Le bloc a quelque chose à dire : plusieurs applications servies, ou une
   * répartition enregistrée qui n'a plus d'objet (à réinitialiser).
   */
  afficher: boolean;
}

/** Arrondit au pas de 10 et borne chaque curseur pour que le total reste ≤ 100. */
export function curseursBornes(brut: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let reste = 100;
  for (const [slug, valeur] of Object.entries(brut)) {
    const v = Math.min(reste, Math.max(0, Math.round((Number(valeur) || 0) / PAS_PARTS) * PAS_PARTS));
    out[slug] = v;
    reste -= v;
  }
  return out;
}

export function etatPartsCompte(args: {
  compte: { langue: string; ugc_ai?: boolean | null; parts_applications?: unknown };
  labels: readonly LabelRef[];
  liens: readonly LienLabelApplication[];
  applications: readonly ApplicationMoteur[];
}): EtatPartsCompte {
  const { compte, labels, liens, applications } = args;
  const idsServis = applicationsServies(labels, liens);
  const servies = applications
    .filter((a) => idsServis.includes(a.id))
    .sort((a, b) => (a.id === ID_SOPHIA ? -1 : b.id === ID_SOPHIA ? 1 : a.nom.localeCompare(b.nom)));
  const autres = servies.filter((a) => a.id !== ID_SOPHIA);
  const stockees = normaliserParts(compte.parts_applications);
  const ugc = Boolean(compte.ugc_ai);

  const curseurs = curseursBornes(
    Object.fromEntries(autres.map((a) => [a.slug, stockees?.[a.slug] ?? 0])),
  );

  const eligibles = applicationsEligiblesCompte({
    applications,
    servies: idsServis,
    langue: compte.langue,
    ugc,
  }).map((a) => a.slug);
  const effectives = partsEffectives(stockees, eligibles);

  const avertissements: AvertissementParts[] = [];
  if (ugc && autres.length > 0) avertissements.push({ type: "ugc" });
  for (const app of autres) {
    if (!app.actif) {
      avertissements.push({ type: "inactive", app: app.nom });
    } else if (app.langues !== null && !app.langues.includes(compte.langue)) {
      avertissements.push({ type: "langue", app: app.nom, langue: compte.langue });
    }
  }
  if (autres.length > 0 && !idsServis.includes(ID_SOPHIA)) {
    avertissements.push({ type: "sophiaNonServie" });
  }
  const slugsServis = new Set(servies.map((a) => a.slug));
  for (const [slug, part] of Object.entries(stockees ?? {})) {
    if (slug === SLUG_SOPHIA || part <= 0 || slugsServis.has(slug)) continue;
    const app = applications.find((a) => a.slug === slug);
    avertissements.push({ type: "obsolete", app: app ? app.nom : slug });
  }

  const obsolete = avertissements.some((a) => a.type === "obsolete");
  return {
    servies,
    autres,
    stockees,
    curseurs,
    effectives,
    avertissements,
    afficher: servies.length > 1 || obsolete,
  };
}

/**
 * Répartition à enregistrer depuis les curseurs : Sophia = 100 − les autres.
 * Rien hors Sophia → `null` (« 100 % Sophia », le défaut des comptes), pour ne
 * pas semer des `{"sophia":100}` qui disent la même chose autrement.
 */
export function partsDepuisCurseurs(curseurs: Record<string, number>): PartsApplications | null {
  const bornes = curseursBornes(curseurs);
  const autres = Object.entries(bornes).filter(([slug, v]) => slug !== SLUG_SOPHIA && v > 0);
  if (autres.length === 0) return null;
  const total = autres.reduce((s, [, v]) => s + v, 0);
  const parts: PartsApplications = {};
  if (total < 100) parts[SLUG_SOPHIA] = 100 - total;
  for (const [slug, v] of autres) parts[slug] = v;
  return parts;
}

/** « Sophia 70 % · Unswipe 30 % », dans l'ordre Sophia d'abord. */
export function resumeParts(
  parts: PartsApplications,
  applications: ReadonlyArray<{ slug: string; nom?: string | null }>,
): string {
  const slugs = Object.keys(parts)
    .filter((s) => parts[s] > 0)
    .sort((a, b) => (a === SLUG_SOPHIA ? -1 : b === SLUG_SOPHIA ? 1 : a.localeCompare(b)));
  return slugs
    .map((slug) => {
      const app = applications.find((a) => a.slug === slug);
      const nom = app ? nomApplication(app) : nomApplication({ slug });
      return `${nom} ${Math.round(parts[slug])} %`;
    })
    .join(" · ");
}
