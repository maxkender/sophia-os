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
import { decisionDepuisEtat } from "../tierlist";
import type { ContenuTierEtat, ReglagesTierlist } from "../types";
import {
  applicationsDuLabel,
  applicationsEligiblesCompte,
  applicationsServies,
  estLabelSystemeSlug,
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
  /** Répartition enregistrée pour une application que les labels ne servent plus. */
  | { type: "obsolete"; app: string };

export interface EtatPartsCompte {
  /** Applications servies par les labels du compte (Sophia d'abord). */
  servies: ApplicationMoteur[];
  /** Applications servies hors Sophia : un curseur chacune (quand Sophia est servie). */
  autres: ApplicationMoteur[];
  /**
   * Au moins un label du compte sert Sophia. Sinon (compte « 100 % Unswipe ») :
   * pas de curseur — Sophia ne prend pas le reste — et pas de repli Sophia, une
   * application éteinte ou hors langue ne « revient » à personne.
   */
  sophiaServie: boolean;
  /**
   * Le moteur peut se replier sur Sophia (son `labelsSophia` n'est pas vide) :
   * un label sert Sophia ET la répartition lui laisse une part — par défaut
   * (NULL), ou explicitement > 0 et effective. Faux pour un compte réglé
   * 100 % Unswipe, même si son label sert aussi Sophia : DEUX NIVEAUX, les
   * labels disent ce qu'il peut promouvoir, la répartition ce qu'il promeut.
   */
  repliSophia: boolean;
  /**
   * Aucune application à publier ET pas de repli Sophia : le moteur ne publie
   * rien sur ce compte (application éteinte, langue non ciblée, compte UGC,
   * répartition qui ne vise que des applications que rien ne sert).
   */
  bloque: boolean;
  /** `comptes.parts_applications` lu ; `null` = 100 % Sophia. */
  stockees: PartsApplications | null;
  /** Valeur initiale des curseurs (slug → %, multiples de 10, total ≤ 100). */
  curseurs: Record<string, number>;
  /** Ce que le moteur appliquera aujourd'hui (restreint aux éligibles, renormalisé). */
  effectives: PartsApplications;
  avertissements: AvertissementParts[];
  /**
   * Le bloc a quelque chose à dire : une application autre que Sophia servie
   * — y compris seule, c'est là que se lit « Unswipe est désactivée » —, ou
   * une répartition enregistrée, quelle qu'elle soit : c'est elle qui décide,
   * même sur un compte dont les labels ne servent que Sophia. Un compte
   * Sophia pur SANS répartition ne l'affiche jamais.
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

  const sophiaServie = idsServis.includes(ID_SOPHIA);
  const avertissements: AvertissementParts[] = [];
  if (ugc && autres.length > 0) avertissements.push({ type: "ugc" });
  // Les deux causes à la fois quand les deux valent (état laissé par 0258 :
  // désactivée ET sans langue) : n'en dire qu'une ferait croire qu'il suffit
  // d'allumer l'application, comme le dit le moteur (`raisonCompteNonServable`).
  for (const app of autres) {
    if (!app.actif) avertissements.push({ type: "inactive", app: app.nom });
    if (app.langues !== null && !app.langues.includes(compte.langue)) {
      avertissements.push({ type: "langue", app: app.nom, langue: compte.langue });
    }
  }
  const slugsServis = new Set(servies.map((a) => a.slug));
  for (const [slug, part] of Object.entries(stockees ?? {})) {
    // Une part Sophia n'est un reliquat que si plus aucun label ne la sert :
    // sur un compte qui la sert, c'est le défaut.
    if ((slug === SLUG_SOPHIA && sophiaServie) || part <= 0 || slugsServis.has(slug)) continue;
    const app = applications.find((a) => a.slug === slug);
    avertissements.push({ type: "obsolete", app: app ? app.nom : slug });
  }

  const obsolete = avertissements.some((a) => a.type === "obsolete");
  // Même règle que `preparerRepartition` : NULL → les labels Sophia, comme
  // avant ; explicite → seulement si Sophia y garde une part effective.
  const repliSophia = sophiaServie && (stockees === null || (effectives[SLUG_SOPHIA] ?? 0) > 0);
  return {
    servies,
    autres,
    sophiaServie,
    repliSophia,
    bloque: !repliSophia && Object.keys(effectives).length === 0,
    stockees,
    curseurs,
    effectives,
    avertissements,
    afficher:
      servies.length > 1 || autres.length > 0 || !sophiaServie || obsolete || stockees !== null,
  };
}

/**
 * Panneau Minuit, faute de journal de la nuit : pourquoi un compte SANS repli
 * Sophia n'a pas publié. Le diagnostic historique compte le pool Sophia, que
 * ce compte ne touche jamais : il annoncerait « pool OK, timeout batch, baisse
 * auto du quota » à tort. Sans repli Sophia : aucun label ne la sert (« 100 %
 * Unswipe »), ou une répartition EXPLICITE lui donne 0 % (deux niveaux, comme
 * le moteur : la répartition choisit parmi ce que les labels permettent).
 *
 * `null` quand le moteur peut se replier sur Sophia — un label la sert et la
 * répartition (NULL, ou une part Sophia > 0) le permet : le diagnostic
 * historique s'applique alors tel quel, rien ne change pour ces comptes. Même
 * règle que le moteur (`applicationsServies`, `applicationsEligiblesCompte`,
 * `partsEffectives`) : un label sans ligne sert Sophia, les labels système
 * sont ignorés.
 */
export function diagnosticCompteSansSophia(args: {
  compte: { langue: string; ugc: boolean; parts_applications?: unknown };
  labels: readonly LabelRef[];
  liens: readonly LienLabelApplication[];
  /** Au moins les applications servies par les labels du compte. */
  applications: readonly ApplicationMoteur[];
  /** Noms des labels, pour le message. */
  labelsTxt: string;
}): string | null {
  const { compte, labels, liens, applications, labelsTxt } = args;
  const idsServis = applicationsServies(labels, liens);
  const parts = normaliserParts(compte.parts_applications);
  if (parts !== null) return diagnosticRepartitionSansSophia({ ...args, parts, idsServis });
  if (idsServis.includes(ID_SOPHIA)) return null;

  const servies = applications
    .filter((a) => idsServis.includes(a.id))
    .sort((a, b) => a.nom.localeCompare(b.nom));
  const noms = servies.length > 0 ? servies.map((a) => a.nom).join(", ") : `${idsServis.length} application(s)`;
  const langue = compte.langue.toUpperCase();
  const tete =
    `Aucun label de ce compte (« ${labelsTxt} ») ne sert Sophia : il ne publie que pour ${noms}, ` +
    `sans repli possible sur Sophia.`;

  const eligibles = applicationsEligiblesCompte({
    applications,
    servies: idsServis,
    langue: compte.langue,
    ugc: compte.ugc,
  });
  if (eligibles.length > 0) {
    const nomsEligibles = eligibles.map((a) => a.nom).join(", ");
    return (
      `${tete} ${nomsEligibles} peut le servir (active, ${langue} ciblé) : réserve à vérifier ` +
      `— Pilotage → Labels, badge ${nomsEligibles} de ces labels.`
    );
  }

  const causes: string[] = [];
  if (compte.ugc) {
    causes.push("compte UGC (les applications autres que Sophia ne passent que par les slideshows classiques)");
  }
  // Toutes les causes, pas la première : une application désactivée ET sans
  // langue (l'état laissé par 0258) ne publie toujours rien une fois allumée.
  for (const app of servies) {
    if (!app.actif) causes.push(`${app.nom} est désactivée`);
    if (app.langues !== null && app.langues.length === 0) {
      causes.push(`${app.nom} ne cible encore aucune langue (à cocher dans Pilotage → Applications)`);
    } else if (app.langues !== null && !app.langues.includes(compte.langue)) {
      causes.push(`${app.nom} ne cible pas le ${langue}`);
    }
  }
  if (causes.length === 0) causes.push("application(s) introuvable(s)");
  return `${tete} Aucune application ne peut servir ce compte, il ne publiera rien : ${causes.join(" ; ")}.`;
}

/**
 * `diagnosticCompteSansSophia` pour une répartition EXPLICITE : seules ses
 * applications à part > 0 peuvent être publiées. `null` quand Sophia y garde
 * une part effective (le moteur s'y replie : diagnostic historique).
 */
function diagnosticRepartitionSansSophia(args: {
  compte: { langue: string; ugc: boolean };
  applications: readonly ApplicationMoteur[];
  labelsTxt: string;
  parts: PartsApplications;
  idsServis: readonly string[];
}): string | null {
  const { compte, applications, labelsTxt, parts, idsServis } = args;
  const eligibles = applicationsEligiblesCompte({
    applications,
    servies: idsServis,
    langue: compte.langue,
    ugc: compte.ugc,
  });
  const effectives = partsEffectives(parts, eligibles.map((a) => a.slug));
  const sophiaServie = idsServis.includes(ID_SOPHIA);
  if (sophiaServie && (effectives[SLUG_SOPHIA] ?? 0) > 0) return null;

  const visees = Object.keys(parts)
    .filter((slug) => parts[slug] > 0)
    .sort((a, b) => (a === SLUG_SOPHIA ? -1 : b === SLUG_SOPHIA ? 1 : a.localeCompare(b)));
  const parSlug = new Map(applications.map((a) => [a.slug, a]));
  const nom = (slug: string) => {
    const app = parSlug.get(slug);
    return app ? app.nom : nomApplication({ slug });
  };
  const noms = visees.map(nom).join(", ");
  const tete = sophiaServie
    ? `La répartition de ce compte donne 0 % à Sophia : il ne publie que pour ${noms}, ` +
      `sans repli possible sur Sophia.`
    : `Aucun label de ce compte (« ${labelsTxt} ») ne sert Sophia : il ne publie que pour ${noms} ` +
      `(sa répartition), sans repli possible sur Sophia.`;

  const servables = eligibles.filter((a) => (effectives[a.slug] ?? 0) > 0);
  const langue = compte.langue.toUpperCase();
  if (servables.length > 0) {
    const nomsServables = servables.map((a) => a.nom).join(", ");
    return (
      `${tete} ${nomsServables} peut le servir (active, ${langue} ciblé) : réserve à vérifier ` +
      `— Pilotage → Labels, badge ${nomsServables} de ces labels.`
    );
  }

  const causes: string[] = [];
  for (const slug of visees) {
    const app = parSlug.get(slug);
    if (!app || !idsServis.includes(app.id)) {
      causes.push(`aucun label de ce compte ne sert ${nom(slug)}`);
      continue;
    }
    if (compte.ugc && app.id !== ID_SOPHIA) {
      causes.push(`compte UGC (${app.nom} ne passe que par les slideshows classiques)`);
    }
    if (!app.actif) causes.push(`${app.nom} est désactivée`);
    if (app.langues !== null && app.langues.length === 0) {
      causes.push(`${app.nom} ne cible encore aucune langue (à cocher dans Pilotage → Applications)`);
    } else if (app.langues !== null && !app.langues.includes(compte.langue)) {
      causes.push(`${app.nom} ne cible pas le ${langue}`);
    }
  }
  if (causes.length === 0) causes.push("application(s) introuvable(s)");
  return (
    `${tete} Aucune application de sa répartition ne peut le servir, il ne publiera rien : ` +
    `${causes.join(" ; ")}.`
  );
}

/**
 * Panneau Minuit, faute de journal, compte MIXTE (un label sert Sophia, un
 * autre ne sert que d'autres applications) : les labels où minuit pioche le
 * pool Sophia. Le moteur n'y prend que les labels qui servent Sophia
 * (`labelsSophia`, labels système exclus) ; compter le pool sur TOUS ses
 * labels annoncerait « pool OK… timeout batch » là où il a vu un pool Sophia
 * vide.
 *
 * `null` dès qu'aucun label utile ne sert autre chose que Sophia : le
 * diagnostic historique garde alors exactement ses labels (système compris),
 * rien ne change pour un compte Sophia pur.
 */
export function labelsPoolSophiaCompteMixte(
  labels: readonly LabelRef[],
  liens: readonly LienLabelApplication[],
): LabelRef[] | null {
  const utiles = labels.filter((l) => !estLabelSystemeSlug(l.slug));
  const servent = (l: LabelRef) => applicationsDuLabel(l.id, liens).includes(ID_SOPHIA);
  if (utiles.every(servent)) return null;
  return utiles.filter(servent);
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

/**
 * Où en est la requalification d'un cycle, en clair — pour le tier d'une
 * application autre que Sophia (0270). Même décision que minuit
 * (`decisionDepuisEtat`) et mêmes clés de phrases (`slideshows.requalif.*`)
 * que le bloc Tierlist Sophia de la fiche, dont c'est le pendant par
 * application. `null` tant que le cycle n'a pas fini ses passages.
 */
export function etatRequalifCycle(
  etat: ContenuTierEtat | null | undefined,
  tierlist: Pick<ReglagesTierlist, "recul_jours" | "requalif_max_jours"> | undefined,
): { cle: string; alerte: boolean; echeance: string | null } | null {
  if (!etat || !tierlist) return null;
  const d = decisionDepuisEtat(etat, tierlist);
  if (!d.requalifier && d.motif === "passages") return null;
  if (!d.requalifier && d.motif === "recul") {
    return { cle: "recul", alerte: false, echeance: null };
  }
  if (!d.requalifier) {
    const dernier = etat.dernier_publie_at ? Date.parse(etat.dernier_publie_at) : Number.NaN;
    const echeance = Number.isFinite(dernier)
      ? new Date(dernier + tierlist.requalif_max_jours * 86_400_000).toISOString().slice(0, 10)
      : null;
    return { cle: "mesure", alerte: true, echeance };
  }
  return {
    cle: d.surMesure ? "prete" : `sansMesure_${d.motif}`,
    alerte: !d.surMesure,
    echeance: null,
  };
}

/**
 * Aucun label du contenu ne sert Sophia : il n'a pas de rang Sophia (0270 —
 * import « hors Sophia »). Même règle que le moteur (`applicationsServies` :
 * un label sans ligne sert Sophia, labels système ignorés, aucun label utile =
 * Sophia). Faux tant que les liens ne sont pas lisibles : dans le doute, la
 * fiche garde l'affichage d'avant.
 */
export function contenuHorsSophia(
  labels: readonly LabelRef[],
  liens: readonly LienLabelApplication[] | undefined,
): boolean {
  if (!liens) return false;
  return !applicationsServies(labels, liens).includes(ID_SOPHIA);
}
