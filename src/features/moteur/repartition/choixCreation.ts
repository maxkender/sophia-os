/**
 * Création d'un compte par l'admin ou le Head of Ops : choix des applications
 * à DEUX NIVEAUX, décisions pures (le composant `ChoixApplicationsCreation`
 * ne fait qu'afficher ce qui se décide ici).
 *
 * 1. Le label dit ce que le compte PEUT promouvoir (`label_applications`, un
 *    label sans ligne sert Sophia — `applicationsDuLabel`). « Automatique » =
 *    la File des créateurs, exactement comme aujourd'hui.
 * 2. La répartition (`comptes.parts_applications`) choisit parmi ce que le
 *    label permet. « Par défaut » = rien n'est envoyé (NULL) : 100 % Sophia si
 *    le label la sert, sinon l'application (ou les applications à parts
 *    égales) qu'il sert. Une répartition EXPLICITE est exclusive : seules les
 *    applications à part > 0 seront jamais publiées sur ce compte, sans repli
 *    Sophia — un compte réglé 100 % Unswipe ne fait que de l'Unswipe.
 *
 * Contrat manage-users : `label_id` et `parts_applications` (slug → entier
 * 1..100, somme 100) ne partent QUE s'ils sont renseignés. Rien choisi = corps
 * identique à celui d'avant, File des créateurs puis repli.
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

/** Seuls ces rôles choisissent label et répartition à la création (manage-users refuse les autres). */
export function peutChoisirApplicationsCompte(role: string | null | undefined): boolean {
  return role === "admin" || role === "head_of_ops";
}

export type RepartitionCreation = "defaut" | "unique" | "perso";

export interface ChoixCreation {
  /** Label imposé ; `null` = Automatique (File des créateurs). */
  labelId: string | null;
  repartition: RepartitionCreation;
  /** Slug du préréglage « 100 % <Nom> » (repartition = "unique"). */
  appUnique: string | null;
  /** Saisie « Personnalisée » : slug → entier (0 = aucune part). */
  perso: Record<string, number>;
}

/** Rien choisi : rien n'est envoyé, le comportement d'avant tel quel. */
export const CHOIX_CREATION_DEFAUT: ChoixCreation = {
  labelId: null,
  repartition: "defaut",
  appUnique: null,
  perso: {},
};

/** Ce qui part dans le corps manage-users (clés absentes = non renseigné). */
export interface OptionsChoixCreation {
  labelId?: string | null;
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

/** Labels proposés : ceux que la File a le droit de poser sur un créateur slideshow. */
export function labelsProposes<T extends LabelFileSlideshow & { id: string }>(labels: readonly T[]): T[] {
  return labels.filter((l) => estLabelFileSlideshow(l));
}

/**
 * Répartition à envoyer. « Par défaut » → `null` (rien n'est envoyé). Sinon
 * les seules parts > 0, entières : le contrat refuse un 0 comme un décimal.
 */
export function partsDuChoix(choix: ChoixCreation): PartsApplications | null {
  if (choix.repartition === "unique") {
    return choix.appUnique ? { [choix.appUnique]: 100 } : null;
  }
  if (choix.repartition === "perso") {
    const parts: PartsApplications = {};
    for (const [slug, v] of Object.entries(choix.perso)) {
      if (Number(v) > 0) parts[slug] = Number(v);
    }
    return Object.keys(parts).length > 0 ? parts : null;
  }
  return null;
}

/** Options du corps : uniquement ce qui est renseigné ({} = comportement actuel). */
export function optionsDuChoix(choix: ChoixCreation): OptionsChoixCreation {
  const options: OptionsChoixCreation = {};
  if (choix.labelId) options.labelId = choix.labelId;
  const parts = partsDuChoix(choix);
  if (parts) options.partsApplications = parts;
  return options;
}

/** Passage en « Personnalisée » : repart de ce qui était affiché (défaut = 100 % Sophia). */
export function persoInitial(
  choix: ChoixCreation,
  applications: readonly { slug: string }[],
): Record<string, number> {
  const depart =
    choix.repartition === "unique" && choix.appUnique ? choix.appUnique : SLUG_SOPHIA;
  return Object.fromEntries(applications.map((a) => [a.slug, a.slug === depart ? 100 : 0]));
}

export type ErreurChoixCreation =
  /** Saisie Personnalisée : un nombre n'est pas un entier entre 0 et 100. */
  | { type: "saisie" }
  /** Saisie Personnalisée : le total n'est pas 100. */
  | { type: "somme"; total: number }
  /** Le label choisi ne sert pas toutes les applications à part > 0. */
  | { type: "labelIncompatible"; label: string; apps: string[] }
  /** Label Automatique : aucun label ne sert toutes les applications à part > 0. */
  | { type: "aucunLabel"; apps: string[] };

export type InfoChoixCreation =
  /** Label Automatique + répartition explicite : manage-users choisira le label, sans la File. */
  | { type: "labelAuto"; apps: string[] }
  /** Répartition explicite : seules ces applications seront publiées, sans repli. */
  | { type: "exclusif"; apps: string[] }
  /** Une application à part > 0 ne cible pas la langue du compte : rien ne sera publié pour elle. */
  | { type: "langue"; app: string; langue: string };

export interface ValidationChoixCreation {
  parts: PartsApplications | null;
  erreurs: ErreurChoixCreation[];
  infos: InfoChoixCreation[];
  /** Envoi permis. Un choix par défaut l'est toujours (rien n'est envoyé). */
  ok: boolean;
}

function nomDuSlug(slug: string, applications: readonly ApplicationMoteur[]): string {
  const app = applications.find((a) => a.slug === slug);
  return app ? nomApplication(app) : nomApplication({ slug });
}

/** Le label sert-il TOUTES ces applications (slugs) ? Slug inconnu = non servi. */
function labelSertTout(
  labelId: string,
  slugs: readonly string[],
  liens: readonly LienLabelApplication[],
  applications: readonly ApplicationMoteur[],
): string[] {
  const servies = applicationsDuLabel(labelId, liens);
  return slugs.filter((slug) => {
    const app = applications.find((a) => a.slug === slug);
    return !app || !servies.includes(app.id);
  });
}

/**
 * Validation locale, avant envoi. Les lectures absentes (`null`, encore en
 * cours ou en erreur) ne bloquent rien : manage-users revalide de toute façon
 * (LABEL_INCOMPATIBLE, NO_LABELS_APPLICATION…). Seul ce qui est SÛR de
 * échouer bloque.
 */
export function validerChoixCreation(args: {
  choix: ChoixCreation;
  applications: readonly ApplicationMoteur[] | null;
  liens: readonly LienLabelApplication[] | null;
  labels: ReadonlyArray<LabelFileSlideshow & { id: string; nom?: string | null }> | null;
  /** Langue du compte créé (avertissement seulement). */
  langue?: string | null;
}): ValidationChoixCreation {
  const { choix, liens, labels, langue } = args;
  const applications = args.applications ?? [];
  const erreurs: ErreurChoixCreation[] = [];
  const infos: InfoChoixCreation[] = [];

  if (choix.repartition === "perso") {
    const valeurs = Object.values(choix.perso);
    if (valeurs.some((v) => !Number.isInteger(v) || v < 0 || v > 100)) {
      erreurs.push({ type: "saisie" });
    } else {
      const total = valeurs.reduce((s, v) => s + v, 0);
      if (total !== 100) erreurs.push({ type: "somme", total });
    }
  }

  const parts = erreurs.length > 0 ? null : partsDuChoix(choix);
  if (parts) {
    const slugs = Object.keys(parts).sort((a, b) =>
      a === SLUG_SOPHIA ? -1 : b === SLUG_SOPHIA ? 1 : a.localeCompare(b),
    );
    const noms = slugs.map((s) => nomDuSlug(s, applications));

    if (choix.labelId && liens && args.applications) {
      const manquantes = labelSertTout(choix.labelId, slugs, liens, applications);
      if (manquantes.length > 0) {
        const label = labels?.find((l) => l.id === choix.labelId);
        erreurs.push({
          type: "labelIncompatible",
          label: String(label?.nom ?? "").trim() || "—",
          apps: manquantes.map((s) => nomDuSlug(s, applications)),
        });
      }
    } else if (!choix.labelId) {
      const candidats =
        liens && labels && args.applications
          ? labelsProposes(labels).filter(
              (l) => labelSertTout(l.id, slugs, liens, applications).length === 0,
            )
          : null;
      if (candidats && candidats.length === 0) erreurs.push({ type: "aucunLabel", apps: noms });
      else infos.push({ type: "labelAuto", apps: noms });
    }

    infos.push({ type: "exclusif", apps: noms });
    if (langue) {
      for (const slug of slugs) {
        const app = applications.find((a) => a.slug === slug);
        if (app && app.langues !== null && !app.langues.includes(langue)) {
          infos.push({ type: "langue", app: nomApplication(app), langue });
        }
      }
    }
  }

  return { parts, erreurs, infos, ok: erreurs.length === 0 };
}

/**
 * Ce que « Par défaut » donnera, en clair, pour le label choisi : 100 %
 * Sophia s'il la sert, sinon son application, ou ses applications à parts
 * égales. `null` = label Automatique (on ne sait pas encore lequel).
 */
export function defautDuLabel(
  labelId: string | null,
  liens: readonly LienLabelApplication[] | null,
  applications: readonly ApplicationMoteur[] | null,
): { type: "sophia" } | { type: "unique"; app: string } | { type: "egales"; apps: string[] } | null {
  if (!labelId || !liens || !applications) return null;
  const ids = applicationsDuLabel(labelId, liens);
  const apps = ids
    .map((id) => applications.find((a) => a.id === id))
    .filter((a): a is ApplicationMoteur => Boolean(a));
  if (apps.some((a) => a.slug === SLUG_SOPHIA) || apps.length === 0) return { type: "sophia" };
  if (apps.length === 1) return { type: "unique", app: nomApplication(apps[0]!) };
  return { type: "egales", apps: apps.map((a) => nomApplication(a)).sort((a, b) => a.localeCompare(b)) };
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
