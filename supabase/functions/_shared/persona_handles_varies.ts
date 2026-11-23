/**
 * @ « variés » : des @ qui ne se ressemblent pas entre eux, comme ceux de vraies
 * personnes. Pur, sans base ni réseau.
 *
 * Pourquoi (19/11, Adrien) : le format `prenom.mot123` de persona_identite.ts,
 * avec un mot toujours tiré du thème du label, donnait pour Atala trente
 * comptes « prenom.<mot de course>123 ». Vus côte à côte, on les reconnaît.
 *
 * Ici, chaque @ tire au hasard une FORME parmi une quarantaine, en trois
 * familles :
 *  - le nom seul (environ une fois sur deux) : prénom + nom de famille, nom
 *    abrégé (« mrtn »), initiale, lettre doublée (« emmaa »), préfixe
 *    (« its », « cest »…) ;
 *  - le nom et un mot (environ deux fois sur cinq) : le mot vient deux fois sur
 *    trois de la vie de tous les jours (café, dimanche, playlist…), une fois
 *    sur trois du thème du label (la course) ;
 *  - deux mots, sans nom (une fois sur seize) : « slow.mornings ».
 *
 * Résultat : moins d'un @ sur cinq parle du thème du label.
 *
 * TOUJOURS UN NOMBRE (19/11, Adrien : « golden_days sera déjà pris, il faut des
 * numéros »). Un @ sans chiffres est presque toujours déjà pris sur TikTok, et
 * la recrue ne peut alors pas créer le compte qu'on lui demande. Chaque @ porte
 * donc un nombre de 2 à 4 chiffres : une année de naissance (« 04 », « 2004 »)
 * ou un nombre quelconque. Les formes les plus nues (`nue` : prénom + nom
 * entier, prénom + initiale, prénom seul, deux mots sans nom) en prennent 3 ou
 * 4, jamais 2. Le nombre est à la fin, parfois juste après le prénom
 * (« emma04.mrtn »), parfois suivi d'un tiret bas.
 *
 * Si le @ est quand même pris, la recrue donne le sien dans « My TikTok
 * account » et l'OS le remplace (handle_tiktok.ts, 0444).
 */
import type { Genre, ThemeMots } from "./label_theme.ts";

type Hasard = () => number;

/** TikTok refuse un @ de plus de 24 caractères. */
export const HANDLE_MAX = 24;
const HANDLE_MIN = 5;

/** Un @ que l'OS accepte (`handle_tiktok.ts`) : lettres, chiffres, points, tirets bas ; ni point au début ni à la fin. */
export const HANDLE_VALIDE = /^[a-z0-9_][a-z0-9._]*[a-z0-9_]$/;

/** Part des mots pris dans le thème du label quand un @ porte un mot (le reste : la vie de tous les jours). */
const PART_MOT_THEME = 0.35;

/**
 * Mots de tous les jours, en anglais : valables dans toutes les langues, pour
 * les deux genres. Rien qui dise un sujet précis.
 */
export const MOTS_QUOTIDIEN: readonly string[] = [
  "daily", "days", "diary", "journal", "notes", "life", "vibes", "mood", "moods", "mornings",
  "sunday", "sundays", "weekend", "club", "things", "stuff", "world", "corner", "moments", "stories",
  "pages", "hours", "coffee", "latte", "toast", "brunch", "sky", "clouds", "sun", "sunny",
  "moon", "stars", "ocean", "waves", "coast", "hills", "city", "outside", "outdoors", "air",
  "calm", "slow", "easy", "lemon", "mint", "olive", "studio", "lab", "files", "tapes",
  "archive", "playlist", "music", "sounds", "walks", "steps", "routes", "maps", "roads", "weather",
];

/**
 * Des mots qui ne vont qu'APRÈS le prénom (« erin.lately », « tom.offline ») :
 * devant lui, au possessif ou après « and », ils ne veulent plus rien dire.
 */
export const MOTS_APRES_PRENOM: readonly string[] = [
  "somewhere", "elsewhere", "offline", "lately", "today", "always", "again", "anyway",
];

/** Les mêmes, en plus, pour un compte femme. */
export const MOTS_QUOTIDIEN_F: readonly string[] = [
  "glow", "bloom", "honey", "peach", "vanilla", "matcha", "linen", "cozy", "soft", "pilates",
  "flowers", "pearl", "rose", "lilac", "dreamy", "sweet", "luna", "bliss", "aura", "petal",
];

/** Les mêmes, en plus, pour un compte homme. */
export const MOTS_QUOTIDIEN_H: readonly string[] = [
  "grind", "focus", "drive", "mode", "zone", "crew", "garage", "gear", "kicks", "laces",
  "tracks", "peak", "north", "steady", "onthemove",
];

/** Pour les @ sans nom : un premier mot… */
const DEBUTS_SANS_NOM: readonly string[] = [
  "slow", "sunday", "early", "daily", "easy", "quiet", "sunny", "lazy", "morning", "weekend",
  "late", "long", "fresh", "simple", "steady", "random",
];
const DEBUTS_SANS_NOM_F: readonly string[] = ["soft", "cozy", "tiny", "little", "golden", "happy"];
/** … et un second. La moitié parle de mouvement, sans dire « course ». */
const FINS_SANS_NOM: readonly string[] = [
  "miles", "runs", "laps", "strides", "mornings", "days", "steps", "loops", "notes", "diary",
  "club", "hours", "moods", "things", "routes", "walks",
];

/**
 * Les seconds mots d'un thème qui n'est pas la course (23/11) : un compte
 * d'art ne s'appelle pas « slow.miles ». Sans ligne ici, ceux de la course.
 */
export const FINS_SANS_NOM_PAR_THEME: Readonly<Partial<Record<ThemeMots, readonly string[]>>> = {
  art: [
    "frames", "canvas", "colors", "sketches", "mornings", "days", "notes", "diary", "museum",
    "gallery", "hours", "moods", "things", "strokes", "palette", "walks",
  ],
};

/** Ce qu'on met devant un prénom : « its.emma », « justemma ». Anglais, courant partout sur TikTok. */
const PREFIXES: readonly string[] = ["its", "just", "hey", "im", "iam", "by", "with", "thisis", "simply", "only", "not"];
/** Et dans la langue du compte, quand elle a le sien. */
const PREFIXES_PAR_LANGUE: Readonly<Record<string, readonly string[]>> = {
  fr: ["cest", "juste"],
  es: ["soy"],
  "es-419": ["soy"],
  it: ["sono"],
  pt: ["sou"],
  "pt-BR": ["sou"],
  de: ["einfach"],
  nl: ["gewoon"],
  tr: ["ben"],
  pl: ["jestem"],
};

/** Ce qu'on colle après un prénom : « emma.xo », « emmax ». Les « x » sont des bises : comptes femme seulement. */
const SUFFIXES_F: readonly string[] = ["x", "xo", "xx", "_", "__"];
const SUFFIXES_H: readonly string[] = ["_", "__"];

function tirer<T>(liste: readonly T[], hasard: Hasard): T {
  return liste[Math.floor(hasard() * liste.length)]!;
}

/** Tire une entrée selon son poids. */
function tirerPondere<T>(choix: readonly (readonly [number, T])[], hasard: Hasard): T {
  const total = choix.reduce((s, [poids]) => s + poids, 0);
  let r = hasard() * total;
  for (const [poids, valeur] of choix) {
    r -= poids;
    if (r < 0) return valeur;
  }
  return choix[choix.length - 1]![1];
}

/**
 * Le nom de famille abrégé comme on le fait dans un @ : sans ses voyelles
 * après l'initiale, quatre lettres au plus (« martin » → « mrtn », « dubois » →
 * « dbs »). Un nom qui n'y laisse qu'une lettre (« lee ») garde ses trois
 * premières.
 */
export function squelette(nom: string): string {
  const s = (nom[0] ?? "") + nom.slice(1).replace(/[aeiouy]/g, "");
  return s.length >= 2 ? s.slice(0, 4) : nom.slice(0, 3);
}

/** Le prénom dont on double la dernière lettre : « emmaa », « leoo ». */
function etire(prenom: string, hasard: Hasard): string {
  const derniere = prenom[prenom.length - 1] ?? "";
  return prenom + derniere.repeat(hasard() < 0.7 ? 1 : 2);
}

export interface PiecesHandle {
  prenom: string;
  nomFamille: string;
  genre: Genre;
  langue: string;
  /** Année en cours : sert à l'année de naissance (18 à 29 ans). */
  annee: number;
  /** Les mots du thème du label (langue du compte, puis anglais commun). */
  motsTheme: readonly string[];
  /** Le thème du label : choisit les seconds mots des @ sans nom (course par défaut). */
  theme?: ThemeMots;
}

type Famille = "nom" | "mot" | "sans_nom";

interface Brouillon {
  /** Les lettres du @, avant son nombre. */
  base: string;
  famille: Famille;
  /** Forme très simple, la plus souvent déjà prise sur TikTok : un nombre de 3 ou 4 chiffres. */
  nue?: boolean;
  /** Ce qui vient après le nombre (« emma482_ »). */
  apres?: string;
}

/** Les lettres d'un @, avant son nombre. */
function tirerBase(p: PiecesHandle, hasard: Hasard): Brouillon {
  const { prenom, nomFamille } = p;
  const sk = squelette(nomFamille);
  const initiale = nomFamille[0] ?? "x";
  const sep = () => tirer([".", "_", ""], hasard);
  const sepVisible = () => tirer([".", "_"], hasard);

  const famille = tirerPondere<Famille>([[54, "nom"], [40, "mot"], [6, "sans_nom"]], hasard);

  if (famille === "sans_nom") {
    const debuts = p.genre === "femme" ? [...DEBUTS_SANS_NOM, ...DEBUTS_SANS_NOM_F] : DEBUTS_SANS_NOM;
    return { base: `${tirer(debuts, hasard)}${sep()}${tirer((p.theme && FINS_SANS_NOM_PAR_THEME[p.theme]) || FINS_SANS_NOM, hasard)}`, famille, nue: true };
  }

  if (famille === "mot") {
    const quotidien = p.genre === "femme"
      ? [...MOTS_QUOTIDIEN, ...MOTS_QUOTIDIEN_F]
      : [...MOTS_QUOTIDIEN, ...MOTS_QUOTIDIEN_H];
    const motQuotidien = tirer(quotidien, hasard);
    const mot = p.motsTheme.length > 0 && hasard() < PART_MOT_THEME ? tirer(p.motsTheme, hasard) : motQuotidien;
    // Après le prénom, un adverbe passe aussi (« erin.lately »), une fois sur huit.
    const motApres = mot === motQuotidien && hasard() < 0.125 ? tirer(MOTS_APRES_PRENOM, hasard) : mot;
    const base = tirerPondere<() => string>([
      [10, () => `${prenom}.${motApres}`],
      [6, () => `${prenom}_${motApres}`],
      [4, () => `${prenom}${motApres}`],
      [5, () => `${mot}.${prenom}`],
      [3, () => `${mot}_${prenom}`],
      // « emmasdiary » : le prénom au possessif, sans apostrophe.
      [3, () => (prenom.endsWith("s") ? `${prenom}.${mot}` : `${prenom}s${mot}`)],
      [2, () => `${prenom}${initiale}${sepVisible()}${mot}`],
      // « emma.and.coffee » : en anglais d'un bout à l'autre, jamais avec un mot de la langue du compte.
      [2, () => `${prenom}.and.${motQuotidien}`],
    ], hasard)();
    return { base, famille };
  }

  const prefixes = [...PREFIXES, ...(PREFIXES_PAR_LANGUE[p.langue] ?? [])];
  return tirerPondere<() => Brouillon>([
    // Prénom + nom de famille, entier ou abrégé.
    [5, () => ({ base: `${prenom}.${nomFamille}`, famille, nue: true })],
    [4, () => ({ base: `${prenom}_${nomFamille}`, famille, nue: true })],
    [4, () => ({ base: `${prenom}${nomFamille}`, famille, nue: true })],
    [7, () => ({ base: `${prenom}.${sk}`, famille })],
    [4, () => ({ base: `${prenom}_${sk}`, famille })],
    [5, () => ({ base: `${prenom}${sk}`, famille })],
    [2, () => ({ base: `${nomFamille}${sepVisible()}${prenom}`, famille, nue: true })],
    [1, () => ({ base: `${sk}.${prenom}`, famille })],
    // Prénom + initiale.
    [3, () => ({ base: `${prenom}.${initiale}`, famille, nue: true })],
    [2, () => ({ base: `${prenom}_${initiale}`, famille, nue: true })],
    [2, () => ({ base: `${prenom}${initiale}`, famille, nue: true })],
    // Prénom seul, déformé comme on le fait quand il est déjà pris.
    [5, () => ({ base: etire(prenom, hasard), famille, nue: true })],
    [6, () => ({ base: `${tirer(prefixes, hasard)}${sep()}${prenom}`, famille, nue: true })],
    [3, () => {
      const suffixe = tirer(p.genre === "femme" ? SUFFIXES_F : SUFFIXES_H, hasard);
      // Un tiret bas vient après le nombre (« emma482_ »), une bise avant (« emma.xo482 »).
      if (suffixe.startsWith("_")) return { base: prenom, famille, nue: true, apres: suffixe };
      return { base: `${prenom}${tirer([".", ""], hasard)}${suffixe}`, famille, nue: true };
    }],
  ], hasard)();
}

/**
 * Le nombre d'un @, de 2 à 4 chiffres : une année de naissance (18 à 29 ans),
 * sur deux ou quatre chiffres, ou un nombre quelconque. Jamais moins de trois
 * chiffres pour une forme `nue` : « emma.martin04 » est déjà pris.
 */
export function tirerNombre(annee: number, nue: boolean, hasard: Hasard): string {
  const naissance = annee - (Math.floor(hasard() * 12) + 18);
  const yy = String(naissance % 100).padStart(2, "0");
  return tirerPondere<() => string>([
    [nue ? 0 : 15, () => yy],
    [nue ? 0 : 15, () => String(Math.floor(hasard() * 90) + 10)],
    [nue ? 75 : 50, () => String(Math.floor(hasard() * 900) + 100)],
    [nue ? 25 : 20, () => String(naissance)],
  ], hasard)();
}

/** Part des @ dont le nombre vient juste après le prénom (« emma04.mrtn ») plutôt qu'à la fin. */
const PART_NOMBRE_AU_MILIEU = 0.15;
/** Part des @ qui finissent par un tiret bas après leur nombre (« clara.bnt482_ »). */
const PART_TIRET_FINAL = 0.05;

/** Un @ varié pour ces pièces, toujours avec un nombre. Peut déjà être pris : c'est à l'appelant de le vérifier. */
export function tirerHandleVarie(p: PiecesHandle, hasard: Hasard = Math.random): string {
  for (let essai = 0; essai < 40; essai += 1) {
    const { base, nue, apres } = tirerBase(p, hasard);
    const nombre = tirerNombre(p.annee, nue === true, hasard);
    const suite = base.slice(p.prenom.length);
    // « emma04.mrtn » : le nombre après le prénom, quand le @ commence par lui et continue après un séparateur.
    // Jamais dans « emma.and.coffee » : le nombre y couperait la phrase.
    const auMilieu = apres === undefined && base.startsWith(p.prenom) && /^[._][a-z]+$/.test(suite) &&
      hasard() < PART_NOMBRE_AU_MILIEU;
    const handle = auMilieu
      ? `${p.prenom}${nombre}${suite}`
      : `${base}${nombre}${apres ?? (hasard() < PART_TIRET_FINAL ? "_" : "")}`;
    if (handle.length >= HANDLE_MIN && handle.length <= HANDLE_MAX && HANDLE_VALIDE.test(handle)) return handle;
  }
  // Prénom et nom trop longs pour toutes les formes : le prénom, l'initiale et un nombre, toujours assez courts.
  return `${p.prenom.slice(0, HANDLE_MAX - 5)}.${p.nomFamille[0] ?? "x"}${Math.floor(hasard() * 900) + 100}`;
}
