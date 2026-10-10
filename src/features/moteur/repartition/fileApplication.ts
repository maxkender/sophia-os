/**
 * Réglages → « Warmup & file de labels » : une File des créateurs PAR
 * APPLICATION (`reglages.file_labels_comptes.par_application[slug]`). À la
 * création d'un compte, manage-users tire le label de la File de l'application
 * du compte (sa langue, puis sa file générale), sinon le label le moins utilisé
 * parmi ceux qui servent cette application. Décisions pures de l'éditeur.
 *
 * La tranche Sophia est écrite exactement comme avant
 * (`avecFileLabelsApplication` recopie aussi la file racine `items` /
 * `par_langue`, que lisent les lecteurs historiques).
 */
import { avecFileLabelsApplication, fileLabelsDeLApplication } from "../applications";
import { estLabelFileSlideshow, type LabelFileSlideshow } from "../fileLabelsSlideshow";
import {
  applicationsDuLabel,
  SLUG_SOPHIA,
  type LienLabelApplication,
} from "../multiApp";
import type { FileLabelCompteItem, FileLabelsApplication, ReglagesFileLabels } from "../types";

/** `"general"` ou code langue. */
export type CleFile = string;

export function itemsDeLaFile(file: FileLabelsApplication, cle: CleFile): FileLabelCompteItem[] {
  if (cle === "general") return file.items;
  return file.par_langue[cle] ?? [];
}

export function avecItemsFile(
  file: FileLabelsApplication,
  cle: CleFile,
  items: FileLabelCompteItem[],
): FileLabelsApplication {
  if (cle === "general") return { ...file, items };
  const par_langue = { ...file.par_langue };
  if (items.length === 0) delete par_langue[cle];
  else par_langue[cle] = items;
  return { ...file, par_langue };
}

/** File (items + par_langue) de l'application `slug`. */
export function fileDeLApplication(file: ReglagesFileLabels, slug: string): FileLabelsApplication {
  return fileLabelsDeLApplication(file, slug);
}

/**
 * Remplace les items d'UNE file (générale ou langue) d'UNE application, sans
 * toucher aux autres applications. Sophia : file racine réécrite aussi, comme
 * avant.
 */
export function avecItemsApplication(
  file: ReglagesFileLabels,
  slug: string,
  cle: CleFile,
  items: FileLabelCompteItem[],
): ReglagesFileLabels {
  const slice = avecItemsFile(fileDeLApplication(file, slug), cle, items);
  return avecFileLabelsApplication(file, slug, slice);
}

/**
 * Le label sert-il l'application ? `label_applications`, héritage Sophia (un
 * label sans ligne sert Sophia). La colonne `labels.application_id` n'est pas
 * lue.
 */
export function labelSertApplication(
  labelId: string,
  applicationId: string,
  liens: readonly LienLabelApplication[],
): boolean {
  return applicationsDuLabel(labelId, liens).includes(applicationId);
}

/**
 * Labels proposés à l'ajout dans la File d'une application : slideshow (ni
 * système, ni UGC AI vidéo) et qui servent cette application. `liens` absent
 * (encore en lecture) → rien à proposer.
 */
export function labelsAjoutables<T extends LabelFileSlideshow & { id: string }>(
  applicationId: string,
  labels: readonly T[],
  liens: readonly LienLabelApplication[] | null,
): T[] {
  if (!liens) return [];
  return labels.filter(
    (l) => estLabelFileSlideshow(l) && labelSertApplication(l.id, applicationId, liens),
  );
}

/**
 * Entrée déjà en File dont le label ne sert (plus) l'application : signalée,
 * pas masquée. Liens illisibles → rien n'est signalé (on ne sait pas).
 */
export function entreeHorsApplication(
  item: FileLabelCompteItem,
  applicationId: string,
  liens: readonly LienLabelApplication[] | null,
): boolean {
  if (!liens) return false;
  return !labelSertApplication(item.label_id, applicationId, liens);
}

/** La case « Compte UGC » n'existe que pour Sophia : un compte d'une autre application n'est jamais UGC. */
export function ugcPossible(slug: string): boolean {
  return slug === SLUG_SOPHIA;
}
