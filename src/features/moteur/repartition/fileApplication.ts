/**
 * Réglages → « Warmup & file de labels » : une File des créateurs PAR
 * APPLICATION (`reglages.file_labels_comptes.par_application[slug]`). À la
 * création d'un compte, manage-users tire le label de la File de l'application
 * du compte (sa langue, puis sa file générale), sinon un choix équilibré
 * (stock × vues, par langue) parmi les labels qui servent cette application. Décisions pures de l'éditeur.
 *
 * La tranche Sophia est écrite exactement comme avant
 * (`avecFileLabelsApplication` recopie aussi la file racine `items` /
 * `par_langue`, que lisent les lecteurs historiques).
 */
import { avecFileLabelsApplication, fileLabelsDeLApplication } from "../applications";
import {
  consommerFileSlideshow,
  estLabelFileSlideshow,
  type LabelFileSlideshow,
} from "../fileLabelsSlideshow";
import {
  applicationsDuLabel,
  SLUG_SOPHIA,
  type LienLabelApplication,
} from "../multiApp";
import { canoniserLangue } from "../langues";
import type { FileLabelCompteItem, FileLabelsApplication, ReglagesFileLabels } from "../types";

/** `"general"` ou code langue. */
export type CleFile = string;

/** Une application dont on peut éditer la File. */
export interface ApplicationFile {
  slug: string;
  nom: string;
  actif: boolean;
}

/**
 * Les applications dont la File s'édite : les actives, et celles EN
 * PRÉPARATION dont la page donne les slugs (inactives, déjà dotées d'un label ;
 * migration 0770). Sophia d'abord, puis par nom.
 *
 * Une application en préparation peut recevoir les recrues : il faut donc
 * pouvoir dire dans quel label partent ses comptes, sinon ils se répartissent
 * à parts égales entre tous ses labels.
 */
export function applicationsDeLaFile<T extends ApplicationFile>(
  applications: readonly T[],
  slugsEnPreparation: readonly string[] = [],
): T[] {
  const enPlus = new Set(slugsEnPreparation);
  return applications
    .filter((a) => a.actif || enPlus.has(a.slug))
    .sort((a, b) =>
      a.slug === SLUG_SOPHIA ? -1 : b.slug === SLUG_SOPHIA ? 1 : a.nom.localeCompare(b.nom),
    );
}

/** Plafond d'un ajout en une fois : de quoi couvrir une vague d'embauches, pas une faute de frappe. */
export const AJOUT_MAX_FILE = 200;

/** Le nombre d'entrées demandé, ramené à un entier entre 1 et `AJOUT_MAX_FILE`. */
export function nombreAjout(brut: unknown): number {
  const n = Math.floor(Number(brut));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(AJOUT_MAX_FILE, n);
}

/** Ajoute `n` fois la même entrée en fin de File : une entrée = un compte. */
export function avecEntreesAjoutees(
  items: readonly FileLabelCompteItem[],
  item: FileLabelCompteItem,
  n: number,
): FileLabelCompteItem[] {
  return [...items, ...Array.from({ length: nombreAjout(n) }, () => ({ ...item }))];
}

/** Des entrées qui se suivent et donnent le même label (et le même mode UGC). */
export interface GroupeFile {
  /** Rang (à partir de 0) de la première entrée du groupe dans la File. */
  debut: number;
  /** Nombre d'entrées, donc de comptes. */
  n: number;
  item: FileLabelCompteItem;
}

/**
 * La File regroupée pour l'affichage : cinquante entrées du même label font
 * une ligne « ×50 », pas cinquante lignes. L'ordre ne change pas, la File
 * reste une liste à plat en base (une entrée = un compte, tirée dans l'ordre).
 */
export function groupesDeLaFile(items: readonly FileLabelCompteItem[]): GroupeFile[] {
  const groupes: GroupeFile[] = [];
  items.forEach((item, i) => {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.item.label_id === item.label_id && dernier.item.ugc === item.ugc) {
      dernier.n += 1;
    } else {
      groupes.push({ debut: i, n: 1, item });
    }
  });
  return groupes;
}

/** Retire `combien` entrées du groupe `index` (tout le groupe par défaut). */
export function sansEntreesDuGroupe(
  items: readonly FileLabelCompteItem[],
  index: number,
  combien?: number,
): FileLabelCompteItem[] {
  const g = groupesDeLaFile(items)[index];
  if (!g) return [...items];
  const n = Math.min(g.n, Math.max(1, Math.floor(combien ?? g.n)));
  // Par la fin du groupe : les premières entrées gardent leur rang.
  const fin = g.debut + g.n;
  return [...items.slice(0, fin - n), ...items.slice(fin)];
}

/**
 * Fait passer le groupe `index` avant le groupe précédent (`sens` −1) ou après
 * le suivant (`sens` +1), en bloc. Aux extrémités, rien ne bouge.
 */
export function avecGroupeDeplace(
  items: readonly FileLabelCompteItem[],
  index: number,
  sens: -1 | 1,
): FileLabelCompteItem[] {
  const groupes = groupesDeLaFile(items);
  const voisin = index + sens;
  if (!groupes[index] || !groupes[voisin]) return [...items];
  const ordre = groupes.map((_, i) => i);
  [ordre[index], ordre[voisin]] = [ordre[voisin]!, ordre[index]!];
  return ordre.flatMap((i) => {
    const g = groupes[i]!;
    return items.slice(g.debut, g.debut + g.n);
  });
}

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
 * Le label sert-il l'application ? `label_applications` : sans application
 * cochée, le label ne sert personne (21/10). La colonne `labels.application_id`
 * n'est pas lue.
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
  /** `"tous"` : liens pas (encore) lisibles, la File Sophia propose tous les labels slideshow. */
  liens: readonly LienLabelApplication[] | null | "tous",
): T[] {
  if (!liens) return [];
  if (liens === "tous") return labels.filter((l) => estLabelFileSlideshow(l));
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

/**
 * Tire le prochain label de la File d'une application, et rend la File amputée
 * de ce qui a été consommé.
 *
 * Miroir de `popLabelFile` (manage-users) : la file de la LANGUE d'abord, puis
 * la file GÉNÉRALE de l'application. Une entrée dont le label n'est pas
 * éligible — il ne sert pas cette application, ou il est fermé — est RETIRÉE
 * sans rien donner, exactement comme côté serveur : sinon la nuit reprendrait
 * le label au compte dès le lendemain.
 *
 * La File est un STOCK, pas un bonus permanent : une entrée sert un compte et
 * disparaît. C'est pour ça que cette fonction rend la File suivante, et que
 * l'appelant doit la reprendre pour le tirage d'après.
 */
export function tirerDeLaFile(
  file: ReglagesFileLabels,
  slug: string,
  langue: string,
  eligibles: Iterable<string>,
): { item: FileLabelCompteItem | null; file: ReglagesFileLabels } {
  const ok = new Set([...eligibles].filter(Boolean));
  const lang = canoniserLangue(langue);
  let courant = file;

  if (lang) {
    const parLangue = fileDeLApplication(courant, slug).par_langue[lang] ?? [];
    const pop = consommerFileSlideshow([...parLangue], ok);
    if (pop.item || pop.skipped.length > 0) {
      courant = avecItemsApplication(courant, slug, lang, pop.rest);
    }
    if (pop.item) return { item: pop.item, file: courant };
  }

  const general = fileDeLApplication(courant, slug).items;
  const pop = consommerFileSlideshow([...general], ok);
  if (pop.item || pop.skipped.length > 0) {
    courant = avecItemsApplication(courant, slug, "general", pop.rest);
  }
  return { item: pop.item, file: courant };
}

/**
 * La File de cette application a-t-elle une entrée utilisable pour cette
 * langue ? Miroir de `fileAUneEntree` (manage-users), qui sert à DÉTOURNER
 * l'application : le moteur descend son classement et prend le premier
 * candidat qui en a une. Ne consomme rien, `tirerDeLaFile` étant pure.
 */
export function fileAUneEntree(
  file: ReglagesFileLabels,
  slug: string,
  langue: string,
  eligibles: Iterable<string>,
): boolean {
  return tirerDeLaFile(file, slug, langue, eligibles).item !== null;
}
