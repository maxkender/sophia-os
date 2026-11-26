/**
 * Thème + genre déduits du nom/slug d'un label : ce qui fixe, pour les comptes
 * d'un label, les mots de leur @, leur bio et la banque de photos de profil.
 *
 * Copie front de `supabase/functions/_shared/label_theme.ts` (le module
 * source, lu par le moteur à la création d'un compte), à garder synchro :
 * `catalogueApplications.test.ts` compare les deux fichiers. Le front s'en
 * sert pour annoncer, dès la création d'un label, l'identité de ses comptes.
 */

export type Genre = "homme" | "femme";

export type ThemeLabel =
  | "alpha_male"
  | "smart_girl"
  | "clean_girl"
  | "cinema"
  | "anciens"
  | "default";

function sansAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function normaliserLabel(s: string): string {
  return sansAccents(s).replace(/[^a-z0-9]+/g, "_");
}

/** Déduit le thème persona depuis le nom ou slug du label. */
export function themeDuLabel(nomOuSlug: string | null | undefined): ThemeLabel {
  const s = normaliserLabel(nomOuSlug ?? "");
  if (!s) return "default";
  if (s.includes("ancien")) return "anciens";
  if (s === "cinema" || s === "film" || (s.includes("cinema") && !s.includes("alpha"))) {
    return "cinema";
  }
  if (s.includes("clean")) return "clean_girl";
  // alpha* / *male* (y compris alpha_msle_dark typo) → alpha_male. Jamais
  // « female » (white_female_run), qui contient « male ».
  if (s.includes("alpha") || (s.includes("male") && !s.includes("girl") && !s.includes("female"))) {
    return "alpha_male";
  }
  if (s.includes("girl") || s.includes("smart") || s.includes("beau")) return "smart_girl";
  return "default";
}

/**
 * Genre imposé par le label / thème.
 * clean_girl / smart_girl / *_girl → femme
 * alpha_male / *male* → homme
 */
export function genreDuLabel(nomOuSlug: string | null | undefined): Genre | null {
  const theme = themeDuLabel(nomOuSlug);
  if (theme === "alpha_male") return "homme";
  if (theme === "clean_girl" || theme === "smart_girl") return "femme";
  const s = normaliserLabel(nomOuSlug ?? "");
  if (!s) return null;
  if (s.includes("girl") || s.includes("femme") || s.includes("female") || s.includes("woman")) return "femme";
  if (s.includes("male") || s.includes("homme") || s.includes("alpha")) return "homme";
  // 26/11 : `looksmaxxing_man` n'était reconnu par rien (« man » n'est pas « male ») : ses comptes recevaient le
  // genre par défaut, femme (prénom, bio, photo). Mots ENTIERS, jamais un morceau de mot (« human », « manga »).
  const mots = s.split("_");
  if (mots.some((m) => MOTS_FEMME.has(m))) return "femme";
  if (mots.some((m) => MOTS_HOMME.has(m))) return "homme";
  return null;
}

const MOTS_HOMME: ReadonlySet<string> = new Set(["man", "men", "guy", "guys", "boy", "boys", "gentleman", "gentlemen", "bro", "bros"]);
const MOTS_FEMME: ReadonlySet<string> = new Set(["women", "lady", "ladies", "her", "she"]);

/**
 * Thème des MOTS du @ et de la bio : plus fin que `ThemeLabel`, qui règle aussi
 * le genre et la banque de photos de profil et ne doit donc pas bouger.
 * Un label d'études, de carrière, de psycho, de philo, de running ou d'art a
 * ses propres mots ; les autres gardent ceux de leur `ThemeLabel`.
 */
export type ThemeMots = ThemeLabel | "etude" | "carriere" | "psycho" | "philo" | "running" | "art";

/**
 * Les mots qui font d'un label un label de running (Atala). Mots ENTIERS du
 * nom (`clean_girl_run`, `male_run`, `anxiety_run`), jamais un morceau de mot :
 * « brunch » ou « prune » ne sont pas du running.
 */
const MOTS_RUNNING: ReadonlySet<string> = new Set([
  "run", "runs", "runner", "runners", "running", "runclub", "jogging", "marathon", "trail",
]);

export function estLabelRunning(nomOuSlug: string | null | undefined): boolean {
  return normaliserLabel(nomOuSlug ?? "").split("_").some((mot) => MOTS_RUNNING.has(mot));
}

/**
 * Les mots qui font d'un label un label d'art (Artura, 23/11). Mots ENTIERS du
 * nom (`art_girl`, `museum_girl`, `painting_male`), jamais un morceau de mot :
 * « smart », « start » ou « party » ne sont pas de l'art.
 */
const MOTS_ART: ReadonlySet<string> = new Set([
  "art", "arts", "artsy", "arty", "artist", "artists", "artura", "arthistory", "artgirl",
  "museum", "museums", "musee", "museo", "gallery", "galerie", "painting", "paintings",
  "painter", "peinture", "tableau", "tableaux", "renaissance", "baroque", "masterpiece",
  "louvre", "impressionism", "impressionist",
]);

export function estLabelArt(nomOuSlug: string | null | undefined): boolean {
  return normaliserLabel(nomOuSlug ?? "").split("_").some((mot) => MOTS_ART.has(mot));
}

export function themeMotsDuLabel(nomOuSlug: string | null | undefined): ThemeMots {
  const s = normaliserLabel(nomOuSlug ?? "");
  // Le running passe avant tout : `clean_girl_run` garde le genre et la photo
  // de profil de clean_girl, mais son @ et sa bio parlent de course.
  if (estLabelRunning(nomOuSlug)) return "running";
  if (s.includes("study") || s.includes("etud")) return "etude";
  if (s === "rh" || s.startsWith("rh_") || s.includes("career") || s.includes("carriere")) {
    return "carriere";
  }
  if (s.includes("psych") || s.includes("mental")) return "psycho";
  if (s.includes("plony") || s.includes("stoi") || s.includes("philo")) return "philo";
  // L'art APRÈS les thèmes d'avant (23/11) : `psych_art`, label existant,
  // garde son identité psycho. `art_girl` garde le genre et la photo de
  // profil de smart_girl, mais son @ et sa bio parlent d'art.
  if (estLabelArt(nomOuSlug)) return "art";
  return themeDuLabel(nomOuSlug);
}

/**
 * La NICHE dite au posteur pour son warm-up (« follow accounts in the … niche »),
 * en anglais comme tous les textes aux posteurs. Elle suit le thème des mots du
 * @ et de la bio : un compte de running s'échauffe sur du running, pas sur de
 * la culture générale. Un thème ajouté à `ThemeMots` doit avoir sa niche ici
 * (le type l'impose).
 */
export const NICHE_PAR_THEME: Record<ThemeMots, string> = {
  default: "general knowledge",
  anciens: "history",
  cinema: "movies",
  alpha_male: "self-improvement",
  smart_girl: "books and culture",
  clean_girl: "wellness",
  etude: "study",
  carriere: "career advice",
  psycho: "psychology",
  philo: "philosophy",
  running: "running",
  art: "art",
};

/** Sans label lisible : la niche d'un compte de culture générale. */
export const NICHE_DEFAUT: string = NICHE_PAR_THEME.default;

export function nicheDuLabel(nomOuSlug: string | null | undefined): string {
  return NICHE_PAR_THEME[themeMotsDuLabel(nomOuSlug)];
}

/**
 * La niche d'un compte, d'après ses labels (presque toujours un seul). Avec
 * plusieurs : le premier, par ordre alphabétique, qui a une niche à lui.
 */
export function nicheDesLabels(noms: readonly (string | null | undefined)[]): string {
  const niches = noms
    .filter((n): n is string => typeof n === "string" && n.trim() !== "")
    .sort()
    .map(nicheDuLabel);
  return niches.find((n) => n !== NICHE_DEFAUT) ?? NICHE_DEFAUT;
}
