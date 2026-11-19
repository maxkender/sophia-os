/**
 * Photo de profil d'un compte : à quelle application il appartient VRAIMENT,
 * et quels autres labels peuvent lui prêter une photo. Décisions pures : rien
 * ici ne touche la base (les lectures sont dans `avatar.ts` et `persona.ts`).
 *
 * Pourquoi ce fichier (19/11) : le choix de la photo lisait
 * `comptes.application_id`, une colonne historique qui vaut Sophia pour tous
 * les comptes. Un compte Atala était donc vu comme un compte Sophia : sa photo
 * était cherchée dans les seules photos rangées sous Sophia, et faute de
 * photo sur son label elle venait des labels `smart_girl` de Sophia.
 * L'application d'un compte se lit dans `parts_applications` et dans les
 * cases cochées de son label, comme partout ailleurs dans le moteur.
 */
import { genreDuLabel, themeDuLabel, type Genre } from "./label_theme.ts";
import { normaliserParts, SLUG_SOPHIA } from "./multi_app.ts";

/**
 * Le slug de l'application qu'un compte promeut, pour choisir sa photo.
 *
 * - Répartition explicite (`parts_applications`) : la plus grosse part ; à
 *   égalité Sophia, puis l'ordre alphabétique (les égalités du moteur).
 * - Pas de répartition : Sophia si son label la sert (c'est le défaut de toute
 *   la flotte), sinon la première application de son label.
 * - Rien de connu : `null`, et l'appelant garde ce qu'il avait.
 */
export function slugApplicationDuCompte(
  parts: unknown,
  slugsDuLabel: readonly string[],
): string | null {
  const explicites = normaliserParts(parts);
  if (explicites) {
    const classees = Object.entries(explicites).sort(
      (a, b) =>
        b[1] - a[1] ||
        Number(b[0] === SLUG_SOPHIA) - Number(a[0] === SLUG_SOPHIA) ||
        a[0].localeCompare(b[0]),
    );
    return classees[0]![0];
  }
  const slugs = [...new Set(slugsDuLabel.filter(Boolean))].sort();
  if (slugs.length === 0) return null;
  return slugs.includes(SLUG_SOPHIA) ? SLUG_SOPHIA : slugs[0]!;
}

/** Ce qu'il faut savoir d'un label pour lui emprunter une photo. */
export interface LabelPhoto {
  id: string;
  nom?: string | null;
  slug?: string | null;
  /** `labels.genre` : « homme », « femme », ou rien. */
  genre?: string | null;
}

const nomDe = (l: LabelPhoto): string => l.nom ?? l.slug ?? "";

/** Le genre d'un label : sa colonne, sinon son nom ; `null` quand rien ne le dit. */
export function genreDuLabelPhoto(l: LabelPhoto): Genre | null {
  return l.genre === "homme" || l.genre === "femme" ? l.genre : genreDuLabel(nomDe(l));
}

/**
 * Les labels FRÈRES d'un compte : ceux qui peuvent lui prêter une photo quand
 * son label n'en a plus de libre. `labels` ne contient que les labels qui
 * servent SON application : on ne sort jamais de la banque de l'application.
 *
 * - `memeTheme` : même thème visuel (`themeDuLabel` : clean_girl, alpha_male…),
 *   sauf un label dont le genre connu est l'autre.
 * - `memeGenre` : les autres labels du même genre (une recrue d'un label femme
 *   reçoit une photo d'un label femme). Vide quand le genre n'est pas connu.
 *
 * Jamais le label du compte lui-même, ni deux fois le même label.
 */
export function labelsFreres(args: {
  labelId: string | null | undefined;
  labelNom: string | null | undefined;
  genre: Genre | null | undefined;
  labels: readonly LabelPhoto[];
}): { memeTheme: string[]; memeGenre: string[] } {
  const theme = themeDuLabel(args.labelNom);
  const autres = args.labels.filter((l) => l.id !== args.labelId);
  const genreCompatible = (l: LabelPhoto): boolean => {
    const g = genreDuLabelPhoto(l);
    return !args.genre || !g || g === args.genre;
  };
  // Sans label, « default » ne désigne aucune famille : pas de frères par thème.
  const memeTheme = theme === "default" && !args.labelId
    ? []
    : autres.filter((l) => themeDuLabel(nomDe(l)) === theme && genreCompatible(l)).map((l) => l.id);
  const memeGenre = args.genre
    ? autres
      .filter((l) => !memeTheme.includes(l.id) && genreDuLabelPhoto(l) === args.genre)
      .map((l) => l.id)
    : [];
  return { memeTheme, memeGenre };
}
