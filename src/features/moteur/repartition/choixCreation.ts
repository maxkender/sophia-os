/**
 * Création du compte d'un créateur (admin, Head of Ops, DM, HM) : choix de
 * l'APPLICATION du compte, décisions pures (le composant
 * `ChoixApplicationsCreation` ne fait qu'afficher ce qui se décide ici).
 *
 * On ne choisit PAS le label. On choisit seulement l'application que le compte
 * promeut — un choix EXPLICITE : aucune application n'est cochée d'avance, et
 * l'envoi exige un clic dès qu'il y a au moins deux applications actives. Le
 * label est ensuite tiré par manage-users :
 * File des créateurs DE CETTE APPLICATION (file de la langue du compte, puis sa
 * file générale), et à défaut un choix équilibré (stock × vues, par langue)
 * parmi les labels qui servent l'application (`label_applications` ; un label
 * sans application cochée ne sert personne — `applicationsDuLabel`).
 *
 * Contrat manage-users :
 * - Sophia → AUCUNE clé de plus : corps identique à celui d'avant, à l'octet
 *   près (File Sophia de la langue, puis File générale, puis choix équilibré
 *   parmi les labels Sophia) ;
 * - autre application → `parts_applications = { <slug>: 100 }`, jamais
 *   `label_id`.
 */
import { nomApplication } from "../applications";
import { estLabelFileSlideshow, type LabelFileSlideshow } from "../fileLabelsSlideshow";
import {
  applicationsDuLabel,
  SLUG_SOPHIA,
  type ApplicationMoteur,
  type LienLabelApplication,
  type PartsApplications,
} from "../multiApp";

/**
 * Rôles qui peuvent choisir l'application à la création : l'admin et le Head
 * of Ops seulement (et encore, le bloc se cache quand le choix automatique est
 * allumé). Les HM et les DM ne choisissent jamais (ticket de Max du 26/10) :
 * leur formulaire n'envoie aucune application et manage-users la tire de la
 * répartition (`choix_application_auto`), comme quand rien n'est choisi. Ils
 * ne restent donc plus bloqués par « choisis l'application » quand la lecture
 * de l'interrupteur tarde ou échoue.
 */
export function peutChoisirApplicationsCompte(role: string | null | undefined): boolean {
  return role === "admin" || role === "head_of_ops";
}

export interface ChoixCreation {
  /** Slug de l'application du compte ; `null` = pas encore choisie (il faut cliquer). */
  application: string | null;
}

/** Rien de choisi : pas d'application par défaut, le recruteur doit cliquer. */
export const CHOIX_CREATION_DEFAUT: ChoixCreation = { application: null };

/**
 * Le choix est-il exigé ? Oui dès que le formulaire le permet, sauf quand on
 * SAIT qu'il n'y a qu'une application active (Sophia seule n'est pas un choix).
 * Catalogue encore en lecture ou illisible : exigé aussi — jamais de choix
 * implicite faute d'avoir pu montrer les applications.
 */
export function choixApplicationRequis(
  actif: boolean,
  applications: readonly ApplicationMoteur[] | null | undefined,
): boolean {
  if (!actif) return false;
  return applications ? choixApplicationVisible(applications) : true;
}

/** Ce qui part dans le corps manage-users (clé absente = Sophia, chemin d'avant). */
export interface OptionsChoixCreation {
  partsApplications?: PartsApplications | null;
}

/**
 * Applications proposées : les actives, Sophia d'abord puis par nom. Une
 * application éteinte ne peut rien publier — la proposer serait créer un
 * compte muet.
 */
export function applicationsProposees<T extends ApplicationMoteur>(applications: readonly T[]): T[] {
  return applications
    .filter((a) => a.actif)
    .sort((a, b) =>
      a.slug === SLUG_SOPHIA ? -1 : b.slug === SLUG_SOPHIA ? 1 : a.nom.localeCompare(b.nom),
    );
}

/**
 * Le choix n'a de sens qu'avec au moins deux applications actives : seule,
 * Sophia n'est pas un choix (et rien n'est envoyé de toute façon).
 */
export function choixApplicationVisible(applications: readonly ApplicationMoteur[] | null | undefined): boolean {
  return applicationsProposees(applications ?? []).length >= 2;
}

/**
 * Labels qui servent une application : ceux que la File a le droit de poser
 * sur un créateur slideshow (ni système, ni UGC AI vidéo) ET dont les
 * applications servies (cochées dans `label_applications`) la contiennent.
 * La colonne historique `labels.application_id` n'est PAS lue.
 */
export function labelsDeLApplication<T extends LabelFileSlideshow & { id: string }>(
  applicationId: string,
  labels: readonly T[],
  liens: readonly LienLabelApplication[],
): T[] {
  return labels.filter(
    (l) => estLabelFileSlideshow(l) && applicationsDuLabel(l.id, liens).includes(applicationId),
  );
}

/**
 * Options du corps : Sophia (ou rien de choisi — l'envoi est alors bloqué en
 * amont quand le choix est exigé) → {} (corps d'avant à l'octet près) ; autre
 * application → { partsApplications: { slug: 100 } }.
 */
export function optionsDuChoix(choix: ChoixCreation): OptionsChoixCreation {
  const slug = String(choix.application ?? "").trim();
  if (!slug || slug === SLUG_SOPHIA) return {};
  return { partsApplications: { [slug]: 100 } };
}

export type ErreurChoixCreation =
  /** L'application choisie n'est plus active (ou n'existe plus). */
  | { type: "applicationInactive"; app: string }
  /** Aucun label slideshow ne sert l'application choisie : manage-users n'aurait rien à poser. */
  | { type: "aucunLabel"; app: string };

export type InfoChoixCreation =
  /** L'application ne cible pas la langue du compte : rien ne sera publié pour elle. */
  { type: "langue"; app: string; langue: string };

export interface ValidationChoixCreation {
  /** Application choisie (fiche), `null` tant que le catalogue n'est pas lu. */
  application: ApplicationMoteur | null;
  erreurs: ErreurChoixCreation[];
  infos: InfoChoixCreation[];
  /** Envoi permis. Sophia l'est toujours (rien n'est envoyé). */
  ok: boolean;
}

/**
 * Validation locale, avant envoi. Sophia ne bloque jamais (chemin d'avant).
 * Les lectures absentes (`null`, encore en cours ou en erreur) ne bloquent
 * rien : manage-users revalide de toute façon (NO_LABELS_APPLICATION…). Seul
 * ce qui est SÛR d'échouer bloque.
 */
export function validerChoixCreation(args: {
  choix: ChoixCreation;
  applications: readonly ApplicationMoteur[] | null;
  liens: readonly LienLabelApplication[] | null;
  labels: ReadonlyArray<LabelFileSlideshow & { id: string }> | null;
  /** Langue du compte créé (information seulement). */
  langue?: string | null;
}): ValidationChoixCreation {
  const { choix, applications, liens, labels, langue } = args;
  const erreurs: ErreurChoixCreation[] = [];
  const infos: InfoChoixCreation[] = [];
  const slug = String(choix.application ?? "").trim();
  // Rien de choisi : pas une erreur de CE choix (l'exigence d'un clic est
  // portée par `choixApplicationRequis`, au moment d'envoyer).
  if (!slug) return { application: null, erreurs, infos, ok: true };
  const app = applications?.find((a) => a.slug === slug) ?? null;

  if (slug !== SLUG_SOPHIA && applications) {
    if (!app || !app.actif) {
      erreurs.push({ type: "applicationInactive", app: app ? nomApplication(app) : slug });
    } else {
      if (liens && labels && labelsDeLApplication(app.id, labels, liens).length === 0) {
        erreurs.push({ type: "aucunLabel", app: nomApplication(app) });
      }
      if (langue && app.langues !== null && !app.langues.includes(langue)) {
        infos.push({ type: "langue", app: nomApplication(app), langue });
      }
    }
  }

  return { application: app, erreurs, infos, ok: erreurs.length === 0 };
}

/** Codes d'erreur de manage-users propres à ce choix (contrat d'API). */
export const CODES_ERREUR_CHOIX_COMPTE = [
  "CHOIX_COMPTE_ADMIN",
  "REPARTITION_INVALIDE",
  "LABEL_INCOMPATIBLE",
  "CHOIX_COMPTE_INCOMPATIBLE",
  "NO_LABELS_APPLICATION",
] as const;

export type CodeErreurChoixCompte = (typeof CODES_ERREUR_CHOIX_COMPTE)[number];

/**
 * Clé i18n lisible pour une erreur manage-users de ce choix, `null` sinon
 * (l'appelant garde son affichage habituel). Le code peut arriver seul
 * (`error`) ou dans un texte plus long : on le cherche comme un mot entier.
 */
export function cleErreurChoixCompte(e: unknown): string | null {
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  for (const code of CODES_ERREUR_CHOIX_COMPTE) {
    if (new RegExp(`(^|[^A-Z_])${code}([^A-Z_]|$)`).test(message)) {
      return `choixCompteCreation.erreurs.${code}`;
    }
  }
  return null;
}
