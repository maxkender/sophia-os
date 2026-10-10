/**
 * Choix du label et de la répartition À LA CRÉATION d'un compte perso
 * (manage-users : create, ensure_compte, ajouter_compte). Décisions pures, sans
 * I/O : manage-users lit la base, ce module tranche.
 *
 * DEUX NIVEAUX (docs/multi-applications.md) :
 *   1. le LABEL dit ce que le compte PEUT promouvoir (`label_applications`,
 *      un label sans ligne sert Sophia : `applicationsDuLabel`) ;
 *   2. la RÉPARTITION (`comptes.parts_applications`) choisit parmi ce que le
 *      label permet. Une répartition explicite n'autorise QUE ses applications
 *      à part > 0 : un compte réglé 100 % Unswipe avec un label Sophia +
 *      Unswipe ne fait que de l'Unswipe.
 *
 * Le label choisi doit donc servir TOUTES les applications à part > 0, sinon
 * le compte naîtrait avec une part qu'aucun de ses labels ne peut remplir.
 *
 * Contrat d'API (le front est codé dessus) :
 *   - `label_id` (uuid) et `parts_applications` ({ slug: entier 1..100 },
 *     somme exactement 100, slugs de la table `applications`) sont optionnels ;
 *     absents ou `null` → comportement STRICTEMENT inchangé ;
 *   - les rôles qui créent des comptes de créateurs (admin, head_of_ops,
 *     directing_manager, hiring_manager) : c'est le créateur qui est associé à
 *     des applications, pas son recruteur. Tout autre rôle qui envoie une
 *     valeur non nulle → 403 CHOIX_COMPTE_ADMIN ;
 *   - valeurs invalides → 400 REPARTITION_INVALIDE ; label inexistant, système,
 *     UGC AI VIDEO ou qui ne sert pas toutes les applications à part > 0 →
 *     400 LABEL_INCOMPATIBLE ; compte CM ou UGC AI VIDEO → 400
 *     CHOIX_COMPTE_INCOMPATIBLE ; aucun label slideshow ne sert toutes les
 *     applications demandées → 409 NO_LABELS_APPLICATION.
 *
 * Module à part, importé par manage-users seul : le toucher ne redéploie
 * aucune autre fonction.
 */
import { estLabelFileSlideshow, type LabelFileSlideshow } from "./labels_file.ts";
import {
  applicationsDuLabel,
  type LienLabelApplication,
  normaliserParts,
  type PartsApplications,
} from "./multi_app.ts";

/**
 * Rôles qui choisissent le label / la répartition d'un compte qui naît : tous
 * ceux qui créent des comptes de créateurs. Le choix porte sur le compte du
 * créateur, pas sur le recruteur.
 */
export const ROLES_CHOIX_COMPTE: readonly string[] = [
  "admin",
  "head_of_ops",
  "directing_manager",
  "hiring_manager",
];

export type CodeChoixCompte =
  | "CHOIX_COMPTE_ADMIN"
  | "REPARTITION_INVALIDE"
  | "LABEL_INCOMPATIBLE"
  | "CHOIX_COMPTE_INCOMPATIBLE"
  | "NO_LABELS_APPLICATION";

/**
 * Choix reçu dans le corps. Au moins un des deux champs est non nul (sinon
 * `lireChoixCompte` rend `null` : aucun choix, chemin historique).
 */
export interface ChoixCompte {
  /** uuid du label imposé, en minuscules ; `null` = repli « moins utilisé ». */
  labelId: string | null;
  /** `parts_applications` tel que reçu, validé plus tard contre `applications`. */
  partsBrutes: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function absent(valeur: unknown): boolean {
  return valeur === undefined || valeur === null;
}

export function peutChoisirCompte(role: string | null | undefined): boolean {
  return ROLES_CHOIX_COMPTE.includes(role ?? "");
}

/**
 * Lit `label_id` / `parts_applications` du corps et vérifie le rôle.
 *
 * Seuls `undefined` et `null` valent « absent » : une chaîne vide est une
 * valeur, refusée comme telle (403 hors des rôles qui recrutent, sinon 400).
 * C'est ce qui garantit qu'un vieux front n'entre jamais dans ce chemin.
 *
 * Le rôle passe AVANT la forme : un rôle qui ne recrute pas (poster) et envoie
 * n'importe quoi reçoit 403, pas un 400 qui lui dirait comment corriger sa
 * requête.
 */
export function lireChoixCompte(
  // deno-lint-ignore no-explicit-any
  body: any,
  role: string | null | undefined,
):
  | { ok: true; choix: ChoixCompte | null }
  | { ok: false; erreur: CodeChoixCompte; statut: 400 | 403 } {
  const labelBrut = body?.label_id;
  const partsBrutes = body?.parts_applications;
  if (absent(labelBrut) && absent(partsBrutes)) return { ok: true, choix: null };
  if (!peutChoisirCompte(role)) {
    return { ok: false, erreur: "CHOIX_COMPTE_ADMIN", statut: 403 };
  }
  let labelId: string | null = null;
  if (!absent(labelBrut)) {
    if (typeof labelBrut !== "string" || !UUID.test(labelBrut.trim())) {
      return { ok: false, erreur: "REPARTITION_INVALIDE", statut: 400 };
    }
    labelId = labelBrut.trim().toLowerCase();
  }
  return {
    ok: true,
    choix: { labelId, partsBrutes: absent(partsBrutes) ? null : partsBrutes },
  };
}

/**
 * Un choix ne vaut que pour un compte perso SLIDESHOW : un compte CM (pas de
 * moteur), un compte UGC AI VIDEO (labels du HM, Sophia seule) ou une création
 * sans compte n'en ont pas l'usage → CHOIX_COMPTE_INCOMPATIBLE.
 */
export function choixApplicableAuCompte(args: {
  typeCompte: string;
  ugcAiVideo: boolean;
}): boolean {
  return args.typeCompte === "perso" && !args.ugcAiVideo;
}

/**
 * Valide une répartition reçue. Stricte, contrairement à `normaliserParts` qui
 * lit la base en tolérant tout : objet non vide, clés = slugs existants,
 * valeurs entières 1..100 (nombres JSON, pas de chaîne), somme EXACTEMENT 100.
 * `null` si invalide ; sinon la répartition normalisée, prête pour l'insert.
 */
export function validerParts(
  brut: unknown,
  slugsExistants: readonly string[],
): PartsApplications | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const entrees = Object.entries(brut as Record<string, unknown>);
  if (entrees.length === 0) return null;
  let somme = 0;
  for (const [slug, valeur] of entrees) {
    if (!slugsExistants.includes(slug)) return null;
    if (typeof valeur !== "number" || !Number.isInteger(valeur)) return null;
    // Grille de 10, celle de la carte du compte (10 % = 1 post sur 10).
    if (valeur < 1 || valeur > 100 || valeur % 10 !== 0) return null;
    somme += valeur;
  }
  if (somme !== 100) return null;
  return normaliserParts(brut);
}

/**
 * Ids des applications à part > 0 : celles que le label du compte doit TOUTES
 * servir. Répartition absente → aucune exigence (le défaut se débrouille avec
 * ce que le label sert).
 */
export function applicationsRequises(
  parts: PartsApplications | null,
  applications: readonly { id: string; slug: string }[],
): string[] {
  if (!parts) return [];
  return applications
    .filter((a) => (parts[a.slug] ?? 0) > 0)
    .map((a) => a.id)
    .sort();
}

/** Le label sert-il chacune des applications `requises` (héritage Sophia compris) ? */
export function labelServitToutes(
  labelId: string,
  liens: readonly LienLabelApplication[],
  requises: readonly string[],
): boolean {
  const servies = applicationsDuLabel(labelId, liens);
  return requises.every((app) => servies.includes(app));
}

/**
 * Label imposé par l'admin : il doit exister, être un label slideshow (ni Hook,
 * ni marque UGC AI VIDEO, ni label du pool vidéo — même règle que la File) et
 * servir toutes les applications à part > 0.
 */
export function labelChoisiCompatible(
  label: (LabelFileSlideshow & { id: string }) | null | undefined,
  liens: readonly LienLabelApplication[],
  requises: readonly string[],
): boolean {
  if (!label?.id) return false;
  if (!estLabelFileSlideshow(label)) return false;
  return labelServitToutes(label.id, liens, requises);
}
